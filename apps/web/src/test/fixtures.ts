// Typed builders for API payloads. Every shape comes from the generated contract types.
import type {
  AddressBook,
  AdminSession,
  AuditEvent,
  Device,
  DeviceDetail,
  Disconnect,
  Peer,
  Session,
  SessionDetail,
  Share,
  StatsSummary,
  SystemInfo,
  Tag,
  Token,
  TopEntry,
  TimeseriesPoint,
  User,
} from '@/api/types';

export const NOW = '2026-10-03T12:00:00.000Z';

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function page<T>(data: T[], overrides: Partial<Page<T>> = {}): Page<T> {
  return { data, total: data.length, page: 1, pageSize: 50, ...overrides };
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'admin',
    displayName: 'Administrator',
    email: 'admin@example.com',
    note: null,
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

export const ADMIN = makeUser();

export function makeAdminSession(overrides: Partial<AdminSession> = {}): AdminSession {
  return { user: ADMIN, expiresAt: '2099-01-01T00:00:00.000Z', ...overrides };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    rustdeskSessionId: '1234567890123',
    initiatorId: '111222333',
    initiatorName: 'alice',
    initiatorIp: '203.0.113.7',
    connType: 0,
    connTypeName: 'REMOTE_DESKTOP',
    startedAt: '2026-10-03T11:00:00.000Z',
    authenticatedAt: '2026-10-03T11:00:05.000Z',
    closedAt: null,
    lastSeenAt: '2026-10-03T11:59:58.000Z',
    durationSeconds: null,
    status: 'ACTIVE',
    closeReason: null,
    createdAt: '2026-10-03T11:00:00.000Z',
    updatedAt: '2026-10-03T11:59:58.000Z',
    deviceUuid: 'ZGV2aWNlLXV1aWQ=',
    deviceId: '987654321',
    deviceHostname: 'desk-01',
    connId: 42,
    authenticated: true,
    durationEstimated: false,
    ...overrides,
  };
}

export function makeSessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return { ...makeSession(), events: [], ...overrides };
}

export function makeDisconnect(overrides: Partial<Disconnect> = {}): Disconnect {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    sessionId: '10000000-0000-4000-8000-000000000001',
    state: 'REQUESTED',
    requestedAt: NOW,
    deliveredAt: null,
    expiresAt: '2026-10-03T12:02:00.000Z',
    requestedBy: { id: ADMIN.id, username: ADMIN.username },
    deviceUuid: 'ZGV2aWNlLXV1aWQ=',
    connId: 42,
    ...overrides,
  };
}

export function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    uuid: 'ZGV2aWNlLXV1aWQ=',
    rustdeskId: '987654321',
    hostname: 'office-pc',
    username: 'bob',
    os: 'Windows 11',
    version: '1.4.2',
    heartbeatVersion: '1004002',
    lastHeartbeatAt: '2026-10-03T11:59:50.000Z',
    lastIp: '198.51.100.4',
    sysinfoUpdatedAt: '2026-10-03T08:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-10-03T11:59:50.000Z',
    online: true,
    ...overrides,
  };
}

export function makeDeviceDetail(overrides: Partial<DeviceDetail> = {}): DeviceDetail {
  return {
    ...makeDevice(),
    sysinfo: { cpu: 'x86_64', memory: '16GB' },
    idChanges: [],
    ...overrides,
  };
}

export function makeBook(overrides: Partial<AddressBook> = {}): AddressBook {
  return {
    guid: '40000000-0000-4000-8000-000000000001',
    kind: 'SHARED',
    name: 'Support team',
    note: null,
    ownerId: ADMIN.id,
    ownerUsername: ADMIN.username,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-02T08:00:00.000Z',
    peerCount: 1,
    shareCount: 1,
    ...overrides,
  };
}

export function makePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    peerId: '555666777',
    alias: 'Front desk',
    note: '',
    tags: ['office'],
    username: 'reception',
    hostname: 'frontdesk-pc',
    platform: 'Windows',
    hasPassword: false,
    hasHash: false,
    extra: {},
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { name: 'office', color: 0xff3b82f6, peerCount: 1, ...overrides };
}

export function makeShare(overrides: Partial<Share> = {}): Share {
  return { userId: '00000000-0000-4000-8000-000000000002', username: 'bob', rule: 1, ...overrides };
}

export function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    kind: 'RUSTDESK_CLIENT',
    clientId: '123456789',
    clientUuid: 'Y2xpZW50LXV1aWQ=',
    deviceInfo: { os: 'linux' },
    ip: '203.0.113.9',
    userAgent: null,
    issuedAt: '2026-09-20T08:00:00.000Z',
    expiresAt: '2026-10-20T08:00:00.000Z',
    lastUsedAt: '2026-10-03T09:00:00.000Z',
    revokedAt: null,
    revokedReason: null,
    active: true,
    current: false,
    ...overrides,
  };
}

export function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: '60000000-0000-4000-8000-000000000001',
    kind: 'conn',
    deviceId: '987654321',
    deviceUuid: 'ZGV2aWNlLXV1aWQ=',
    connId: 42,
    rustdeskSessionId: '1234567890123',
    action: 'new',
    sourceIp: '198.51.100.4',
    receivedAt: '2026-10-03T11:00:00.000Z',
    sessionId: '10000000-0000-4000-8000-000000000001',
    nonce: 'n-1',
    payload: { action: 'new', conn_id: 42, ip: '<script>alert(1)</script>' },
    malformed: false,
    ...overrides,
  };
}

export const SYSTEM_INFO: SystemInfo = {
  version: '0.1.0',
  sessionTimeoutMinutes: 120,
  heartbeatGraceSeconds: 30,
  deviceOnlineThresholdSeconds: 45,
  disconnectTtlSeconds: 120,
};

export const SUMMARY: StatsSummary = {
  totalSessions: 128,
  totalDurationSeconds: 3723,
  avgDurationSeconds: 29,
  timedOutSessions: 3,
  activeSessions: 2,
  unauthenticatedSessions: 7,
};

export const TIMESERIES: TimeseriesPoint[] = [
  { bucketStart: '2026-10-03T10:00:00.000Z', sessions: 4, durationSeconds: 3600 },
  { bucketStart: '2026-10-03T11:00:00.000Z', sessions: 9, durationSeconds: 5400 },
];

export const TOP_INITIATORS: TopEntry[] = [
  { id: '111222333', name: 'alice', sessions: 12, durationSeconds: 7200 },
];
export const TOP_TARGETS: TopEntry[] = [
  { id: '987654321', name: 'office-pc', sessions: 20, durationSeconds: 9000 },
];
