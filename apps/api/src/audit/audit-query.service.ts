import { Injectable } from '@nestjs/common';
import { type Page, skipTake, toPage } from '../common/pagination/pagination';
import { type AuditEvent, type AuditKind, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEventListQuery {
  kind?: AuditKind;
  deviceId?: string;
  sessionId?: string;
  /** `[from, to)` on `receivedAt`. */
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
  direction: 'asc' | 'desc';
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditEventListQuery): Promise<Page<AuditEvent>> {
    const where: Prisma.AuditEventWhereInput = {
      kind: query.kind,
      deviceId: query.deviceId,
      sessionId: query.sessionId,
      ...(query.from || query.to ? { receivedAt: { gte: query.from, lt: query.to } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ receivedAt: query.direction }, { id: query.direction }],
        ...skipTake(query),
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return toPage(data, total, query);
  }
}
