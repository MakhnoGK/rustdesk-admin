import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import {
  orderBy,
  type Page,
  type SortSpec,
  skipTake,
  toPage,
} from '../common/pagination/pagination';
import { addSeconds } from '../common/time/time';
import { AppConfig } from '../config/app-config.service';
import { type Device, type DeviceIdChange, Prisma } from '../generated/prisma/client';
import { PrismaService, type PrismaTx } from '../prisma/prisma.service';

export const DEVICE_SORT_FIELDS = [
  'rustdeskId',
  'hostname',
  'lastHeartbeatAt',
  'createdAt',
] as const;
export type DeviceSortField = (typeof DEVICE_SORT_FIELDS)[number];

export interface DeviceListQuery {
  search?: string;
  online?: boolean;
  page: number;
  pageSize: number;
  sort: SortSpec<DeviceSortField>;
}

export interface HeartbeatInput {
  uuid: string;
  rustdeskId: string | null;
  heartbeatVersion: bigint | null;
  ip: string | null;
  receivedAt: Date;
}

export interface SysinfoInput {
  uuid: string;
  rustdeskId: string;
  hostname: string | null;
  username: string | null;
  os: string | null;
  version: string | null;
  /** The uploaded document, credentials already redacted. */
  sysinfo: Prisma.InputJsonObject;
  ip: string | null;
  receivedAt: Date;
}

const SYSINFO_VER_KEY = 'sysinfo_ver';

/** Device registry keyed by machine UUID; records RustDesk ID changes. */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Registers a heartbeat. Returns whether the server still lacks system info for the device. */
  async recordHeartbeat(
    input: HeartbeatInput,
  ): Promise<{ device: Device; sysinfoMissing: boolean }> {
    const device = await this.upsert(input.uuid, input.rustdeskId, input.receivedAt, {
      lastHeartbeatAt: input.receivedAt,
      lastIp: input.ip,
      ...(input.heartbeatVersion !== null ? { heartbeatVersion: input.heartbeatVersion } : {}),
    });
    return { device, sysinfoMissing: device.sysinfo === null };
  }

  async recordSysinfo(input: SysinfoInput): Promise<Device> {
    const device = await this.upsert(input.uuid, input.rustdeskId, input.receivedAt, {
      hostname: input.hostname,
      username: input.username,
      os: input.os,
      version: input.version,
      sysinfo: input.sysinfo,
      sysinfoUpdatedAt: input.receivedAt,
      lastIp: input.ip,
    });
    this.logger.log(
      { deviceUuid: input.uuid, rustdeskId: input.rustdeskId, hostname: input.hostname },
      'Device system info updated',
    );
    return device;
  }

  /**
   * The server-wide sysinfo version token. The client posts `/api/sysinfo_ver` with an empty
   * body (src/hbbs_http/sync.rs), so it cannot be per device: it identifies this server's
   * sysinfo store, and a new database yields a new token.
   */
  async sysinfoVersion(): Promise<string> {
    const setting = await this.prisma.serverSetting.findUnique({ where: { key: SYSINFO_VER_KEY } });
    return setting?.value ?? '';
  }

  isOnline(device: Pick<Device, 'lastHeartbeatAt'>, now = new Date()): boolean {
    return device.lastHeartbeatAt !== null && device.lastHeartbeatAt > this.onlineCutoff(now);
  }

  async list(query: DeviceListQuery, now = new Date()): Promise<Page<Device>> {
    const cutoff = this.onlineCutoff(now);
    const conditions: Prisma.DeviceWhereInput[] = [];
    if (query.search) {
      conditions.push({
        OR: (['rustdeskId', 'hostname', 'username'] as const).map((f) => ({
          [f]: { contains: query.search, mode: 'insensitive' as const },
        })),
      });
    }
    if (query.online === true) conditions.push({ lastHeartbeatAt: { gt: cutoff } });
    if (query.online === false)
      conditions.push({ OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lte: cutoff } }] });
    const where: Prisma.DeviceWhereInput = { AND: conditions };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        orderBy: [orderBy(query.sort, ['hostname', 'lastHeartbeatAt']), { id: 'asc' }],
        ...skipTake(query),
      }),
      this.prisma.device.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  async getByUuid(uuid: string): Promise<{ device: Device; idChanges: DeviceIdChange[] }> {
    const device = await this.prisma.device.findUnique({
      where: { uuid },
      include: { idChanges: { orderBy: { changedAt: 'desc' }, take: 100 } },
    });
    if (!device) throw DomainError.notFound('Device');
    const { idChanges, ...plain } = device;
    return { device: plain, idChanges };
  }

  private onlineCutoff(now: Date): Date {
    return addSeconds(now, -this.config.get('DEVICE_ONLINE_THRESHOLD_SECONDS'));
  }

  /** Creates or updates by uuid inside a transaction and records a RustDesk ID change. */
  private async upsert(
    uuid: string,
    rustdeskId: string | null,
    now: Date,
    data: Omit<Prisma.DeviceUpdateInput, 'uuid' | 'rustdeskId'>,
  ): Promise<Device> {
    const attempt = () =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.device.findUnique({ where: { uuid } });
        if (!existing) {
          return tx.device.create({
            data: { ...(data as Prisma.DeviceCreateInput), uuid, rustdeskId: rustdeskId ?? '' },
          });
        }
        if (rustdeskId && existing.rustdeskId && existing.rustdeskId !== rustdeskId) {
          await this.recordIdChange(tx, existing, rustdeskId, now);
        }
        return tx.device.update({
          where: { id: existing.id },
          data: { ...data, ...(rustdeskId ? { rustdeskId } : {}) },
        });
      });
    try {
      return await attempt();
    } catch (e) {
      // Two first-contact requests raced on the unique uuid: the second one updates instead.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return attempt();
      throw e;
    }
  }

  private async recordIdChange(
    tx: PrismaTx,
    device: Device,
    newId: string,
    now: Date,
  ): Promise<void> {
    await tx.deviceIdChange.create({
      data: {
        deviceId: device.id,
        oldRustdeskId: device.rustdeskId,
        newRustdeskId: newId,
        changedAt: now,
      },
    });
    this.logger.log(
      { deviceUuid: device.uuid, oldRustdeskId: device.rustdeskId, newRustdeskId: newId },
      'Device RustDesk ID changed',
    );
  }
}
