// Domain → admin API DTOs. Credentials (password hashes, peer hash/password) never pass here.

import type { BookSummary, ShareRecord } from '../address-books/address-books.service';
import type { PeerRecord, TagRecord } from '../address-books/address-books.types';
import { toIso } from '../common/time/time';
import type { DisconnectRecord } from '../disconnects/disconnects.service';
import type {
  AuditEvent,
  AuthToken,
  Device,
  DeviceIdChange,
  Session,
} from '../generated/prisma/client';
import type { UserRecord } from '../users/users.service';
import type { AddressBookDto, AdminPeerDto, AdminTagDto, ShareDto } from './dto/address-books.dto';
import type { DeviceDetailDto, DeviceDto } from './dto/devices.dto';
import type { AuditEventDto, DisconnectDto, SessionDto } from './dto/sessions.dto';
import type { TokenDto, UserDto } from './dto/users.dto';

export function toUserDto(u: UserRecord): UserDto {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    note: u.note,
    role: u.role,
    status: u.status,
    createdAt: toIso(u.createdAt),
    updatedAt: toIso(u.updatedAt),
  };
}

export function toTokenDto(t: AuthToken, now = new Date()): TokenDto {
  return {
    id: t.id,
    userId: t.userId,
    kind: t.kind,
    clientId: t.clientId,
    clientUuid: t.clientUuid,
    deviceInfo: (t.deviceInfo ?? null) as Record<string, unknown> | null,
    ip: t.ip,
    userAgent: t.userAgent,
    issuedAt: toIso(t.issuedAt),
    expiresAt: toIso(t.expiresAt),
    lastUsedAt: toIso(t.lastUsedAt),
    revokedAt: toIso(t.revokedAt),
    revokedReason: t.revokedReason,
    active: t.revokedAt === null && t.expiresAt > now,
  };
}

export function toDeviceDto(d: Device, online: boolean): DeviceDto {
  return {
    id: d.id,
    uuid: d.uuid,
    rustdeskId: d.rustdeskId,
    hostname: d.hostname,
    username: d.username,
    os: d.os,
    version: d.version,
    heartbeatVersion: d.heartbeatVersion === null ? null : d.heartbeatVersion.toString(),
    lastHeartbeatAt: toIso(d.lastHeartbeatAt),
    lastIp: d.lastIp,
    online,
    sysinfoUpdatedAt: toIso(d.sysinfoUpdatedAt),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

export function toDeviceDetailDto(
  d: Device,
  online: boolean,
  idChanges: DeviceIdChange[],
): DeviceDetailDto {
  return {
    ...toDeviceDto(d, online),
    sysinfo: (d.sysinfo ?? null) as Record<string, unknown> | null,
    idChanges: idChanges.map((c) => ({
      oldRustdeskId: c.oldRustdeskId,
      newRustdeskId: c.newRustdeskId,
      changedAt: toIso(c.changedAt),
    })),
  };
}

export function toBookDto(s: BookSummary): AddressBookDto {
  return {
    guid: s.book.guid,
    name: s.book.name,
    kind: s.book.kind,
    note: s.book.note,
    ownerId: s.book.ownerId,
    ownerUsername: s.ownerUsername,
    peerCount: s.peerCount,
    shareCount: s.shareCount,
    createdAt: toIso(s.book.createdAt),
    updatedAt: toIso(s.book.updatedAt),
  };
}

export function toShareDto(s: ShareRecord): ShareDto {
  return { userId: s.userId, username: s.username, rule: s.rule };
}

export function toPeerDto(p: PeerRecord): AdminPeerDto {
  return {
    peerId: p.peerId,
    alias: p.alias,
    note: p.note,
    tags: p.tags,
    username: p.username,
    hostname: p.hostname,
    platform: p.platform,
    hasPassword: p.hasPassword,
    hasHash: p.hasHash,
    extra: p.extra,
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  };
}

export function toTagDto(t: TagRecord): AdminTagDto {
  return { name: t.name, color: t.color, peerCount: t.peerCount ?? 0 };
}

export function toSessionDto(s: Session): SessionDto {
  return {
    id: s.id,
    deviceUuid: s.deviceUuid,
    deviceId: s.deviceId,
    connId: s.connId,
    rustdeskSessionId: s.rustdeskSessionId,
    initiatorId: s.initiatorId,
    initiatorName: s.initiatorName,
    initiatorIp: s.initiatorIp,
    connType: s.connType,
    authenticated: s.authenticated,
    startedAt: toIso(s.startedAt),
    authenticatedAt: toIso(s.authenticatedAt),
    closedAt: toIso(s.closedAt),
    lastSeenAt: toIso(s.lastSeenAt),
    durationSeconds: s.durationSeconds,
    durationEstimated: s.durationEstimated,
    status: s.status,
    closeReason: s.closeReason,
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
  };
}

export function toAuditEventDto(e: AuditEvent): AuditEventDto {
  return {
    id: e.id,
    kind: e.kind.toLowerCase() as AuditEventDto['kind'],
    deviceId: e.deviceId,
    deviceUuid: e.deviceUuid,
    connId: e.connId,
    rustdeskSessionId: e.rustdeskSessionId,
    action: e.action as AuditEventDto['action'],
    sourceIp: e.sourceIp,
    receivedAt: toIso(e.receivedAt),
    sessionId: e.sessionId,
    malformed: e.malformed,
    nonce: e.nonce,
    payload: e.payload as Record<string, unknown>,
  };
}

export function toDisconnectDto(d: DisconnectRecord): DisconnectDto {
  return {
    id: d.id,
    sessionId: d.sessionId,
    deviceUuid: d.deviceUuid,
    connId: d.connId,
    state: d.state,
    requestedAt: toIso(d.requestedAt),
    deliveredAt: toIso(d.deliveredAt),
    expiresAt: toIso(d.expiresAt),
    requestedBy:
      d.requestedById && d.requestedByUsername
        ? { id: d.requestedById, username: d.requestedByUsername }
        : null,
  };
}
