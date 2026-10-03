import type { Schema } from '@rustdesk-admin/api-contract';

type User = Schema<'UserDto'>;
type Session = Schema<'SessionDto'>;

export const ADMIN: User = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Administrator',
  email: null,
  note: null,
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

export function activeSession(): Session {
  const started = new Date(Date.now() - 5 * 60_000).toISOString();
  return {
    id: '10000000-0000-4000-8000-0000000000e2',
    rustdeskSessionId: '1234567890123',
    initiatorId: '111222333',
    initiatorName: 'alice',
    initiatorIp: '203.0.113.7',
    connType: 0,
    startedAt: started,
    authenticatedAt: started,
    closedAt: null,
    lastSeenAt: new Date().toISOString(),
    durationSeconds: null,
    status: 'ACTIVE',
    closeReason: null,
    createdAt: started,
    updatedAt: started,
    deviceUuid: 'ZTJlLWRldmljZQ==',
    deviceId: '987654321',
    connId: 7,
    authenticated: true,
    durationEstimated: false,
  };
}

export function historySession(overrides: Partial<Session> = {}): Session {
  return {
    ...activeSession(),
    id: '10000000-0000-4000-8000-0000000000e3',
    status: 'TIMEOUT',
    closeReason: 'TIMEOUT',
    closedAt: '2026-10-03T11:00:00.000Z',
    startedAt: '2026-10-03T09:00:00.000Z',
    durationSeconds: 7200,
    durationEstimated: true,
    ...overrides,
  };
}
