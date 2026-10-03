import { SessionCloseReason, SessionStatus } from '../generated/prisma/enums';
import { decideConnRecord, isFinal, type SessionSnapshot } from './session-state';

const active: SessionSnapshot = {
  id: 'active',
  status: SessionStatus.ACTIVE,
  closeReason: null,
  authenticated: false,
};
const closed: SessionSnapshot = {
  id: 'closed',
  status: SessionStatus.CLOSED,
  closeReason: SessionCloseReason.CLIENT_CLOSE,
  authenticated: true,
};
const reconciledAnonymous: SessionSnapshot = {
  id: 'reconciled',
  status: SessionStatus.CLOSED,
  closeReason: SessionCloseReason.HEARTBEAT_RECONCILED,
  authenticated: false,
};

describe('decideConnRecord', () => {
  it('new opens a session', () => {
    expect(
      decideConnRecord({ action: 'new', active: null, recent: null, disconnectDelivered: false }),
    ).toEqual([{ op: 'create', authenticated: false }]);
  });

  it('new on an active (uuid, conn_id) supersedes it first', () => {
    expect(
      decideConnRecord({ action: 'new', active, recent: null, disconnectDelivered: false }),
    ).toEqual([
      { op: 'supersede', sessionId: 'active' },
      { op: 'create', authenticated: false },
    ]);
  });

  it('peer authenticates the active session', () => {
    expect(
      decideConnRecord({ action: 'peer', active, recent: null, disconnectDelivered: false }),
    ).toEqual([{ op: 'authenticate', sessionId: 'active' }]);
  });

  it('peer without new opens an authenticated session', () => {
    expect(
      decideConnRecord({ action: 'peer', active: null, recent: null, disconnectDelivered: false }),
    ).toEqual([{ op: 'create', authenticated: true }]);
  });

  it('a late peer enriches an already closed, unauthenticated session', () => {
    expect(
      decideConnRecord({
        action: 'peer',
        active: null,
        recent: reconciledAnonymous,
        disconnectDelivered: false,
      }),
    ).toEqual([{ op: 'authenticate', sessionId: 'reconciled' }]);
  });

  it('a peer after an authenticated closed session starts a new one', () => {
    expect(
      decideConnRecord({
        action: 'peer',
        active: null,
        recent: closed,
        disconnectDelivered: false,
      }),
    ).toEqual([{ op: 'create', authenticated: true }]);
  });

  it('close ends the active session with CLIENT_CLOSE, or ADMIN_DISCONNECT after a delivered disconnect', () => {
    expect(
      decideConnRecord({ action: 'close', active, recent: null, disconnectDelivered: false }),
    ).toEqual([{ op: 'close', sessionId: 'active', reason: SessionCloseReason.CLIENT_CLOSE }]);
    expect(
      decideConnRecord({ action: 'close', active, recent: null, disconnectDelivered: true }),
    ).toEqual([{ op: 'close', sessionId: 'active', reason: SessionCloseReason.ADMIN_DISCONNECT }]);
  });

  it('a duplicate or late close only attaches to the final session', () => {
    expect(
      decideConnRecord({
        action: 'close',
        active: null,
        recent: closed,
        disconnectDelivered: false,
      }),
    ).toEqual([{ op: 'attach', sessionId: 'closed' }]);
    expect(
      decideConnRecord({
        action: 'close',
        active: null,
        recent: reconciledAnonymous,
        disconnectDelivered: false,
      }),
    ).toEqual([{ op: 'attach', sessionId: 'reconciled' }]);
  });

  it('close without any session records an UNKNOWN one', () => {
    expect(
      decideConnRecord({ action: 'close', active: null, recent: null, disconnectDelivered: false }),
    ).toEqual([{ op: 'createUnknown' }]);
  });

  it('only ACTIVE is non-final', () => {
    expect(isFinal(SessionStatus.ACTIVE)).toBe(false);
    for (const s of [SessionStatus.CLOSED, SessionStatus.TIMEOUT, SessionStatus.UNKNOWN])
      expect(isFinal(s)).toBe(true);
  });
});
