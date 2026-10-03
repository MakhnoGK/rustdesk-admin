import { act, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Disconnect, Session, SessionDetail } from '@/api/types';
import { makeDisconnect, makeSession, makeSessionDetail, page, type Page } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';
import { setDocumentHidden } from '@/test/visibility';

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-03T12:00:00.000Z'));
});
afterEach(() => {
  setDocumentHidden(false);
  vi.useRealTimers();
});

function activeHandler(sessions: () => Session[], onRequest?: () => void) {
  return http.get(apiUrl('/sessions/active'), () => {
    onRequest?.();
    return HttpResponse.json<Page<Session>>(page(sessions()));
  });
}

describe('active sessions', () => {
  it('polls every 5 s and pauses while the tab is hidden', async () => {
    let requests = 0;
    server.use(
      activeHandler(
        () => [makeSession()],
        () => (requests += 1),
      ),
    );
    renderApp('/sessions/active', { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText('987654321')).toBeInTheDocument();
    expect(requests).toBe(1);

    await advance(5000);
    expect(requests).toBe(2);
    await advance(5000);
    expect(requests).toBe(3);

    setDocumentHidden(true);
    await advance(20_000);
    expect(requests).toBe(3);

    // Back in view: refetches at once and resumes the interval.
    setDocumentHidden(false);
    await advance(100);
    expect(requests).toBe(4);
    await advance(5000);
    expect(requests).toBe(5);
  });

  it('ticks the elapsed time every second without refetching', async () => {
    let requests = 0;
    server.use(
      activeHandler(
        () => [makeSession({ startedAt: '2026-10-03T11:58:00.000Z' })],
        () => (requests += 1),
      ),
    );
    renderApp('/sessions/active', { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText(/^2m 0\ds$/)).toBeInTheDocument();
    const before = requests;
    await advance(3000);
    expect(screen.getByText(/^2m 0[3-4]s$/)).toBeInTheDocument();
    expect(requests).toBe(before);
  });

  it('shows "Unknown initiator" for unauthenticated sessions and flags missing heartbeats', async () => {
    server.use(
      activeHandler(() => [
        makeSession({
          initiatorId: null,
          initiatorName: null,
          authenticated: false,
          authenticatedAt: null,
          // Older than heartbeatGraceSeconds (30 s).
          lastSeenAt: '2026-10-03T11:58:00.000Z',
        }),
      ]),
    );
    renderApp('/sessions/active', { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText('Unknown initiator')).toBeInTheDocument();
    expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    expect(await screen.findByText('No heartbeat')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    server.use(activeHandler(() => []));
    renderApp('/sessions/active', { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
  });
});

describe('remote disconnect', () => {
  function disconnectHandlers(states: Disconnect['state'][], closesAfterDelivery: boolean) {
    let polls = 0;
    let delivered = false;
    // The device reports the close a little after the delivery: on the 2nd detail poll after it.
    let detailPollsSinceDelivery = 0;
    let sessions = [makeSession()];
    let requested = false;
    return [
      activeHandler(() => sessions),
      http.post(apiUrl('/sessions/:id/disconnect'), () => {
        requested = true;
        return HttpResponse.json<Disconnect>(makeDisconnect(), { status: 201 });
      }),
      http.get(apiUrl('/sessions/:id/disconnect'), () => {
        if (!requested)
          return HttpResponse.json(
            { error: { code: 'NOT_FOUND', message: 'None' } },
            { status: 404 },
          );
        const state = states[Math.min(polls, states.length - 1)] ?? 'REQUESTED';
        polls += 1;
        if (state === 'DELIVERED') delivered = true;
        return HttpResponse.json<Disconnect>(
          makeDisconnect({
            state,
            deliveredAt: state === 'DELIVERED' ? '2026-10-03T12:00:03.000Z' : null,
          }),
        );
      }),
      http.get(apiUrl('/sessions/:id'), () => {
        if (delivered) detailPollsSinceDelivery += 1;
        const closed = closesAfterDelivery && detailPollsSinceDelivery >= 2;
        if (closed) sessions = [];
        return HttpResponse.json<SessionDetail>(
          makeSessionDetail(
            closed
              ? {
                  status: 'CLOSED',
                  closeReason: 'ADMIN_DISCONNECT',
                  closedAt: '2026-10-03T12:00:05.000Z',
                  durationSeconds: 3605,
                }
              : {},
          ),
        );
      }),
    ];
  }

  async function requestDisconnect(user: ReturnType<typeof renderApp>['user']) {
    await user.click(
      await screen.findByRole('button', { name: 'Disconnect session on 987654321' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/next heartbeat/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Request disconnect' }));
  }

  it('goes requested → delivered → closed', async () => {
    server.use(...disconnectHandlers(['DELIVERED'], true));
    const { user } = renderApp('/sessions/active', { advanceTimers: vi.advanceTimersByTime });
    await requestDisconnect(user);

    expect((await screen.findAllByText('Disconnect requested')).length).toBeGreaterThan(0);
    // The next poll (2 s) sees the request handed to the device with its heartbeat.
    await advance(2000);
    expect((await screen.findAllByText('Delivered to the device')).length).toBeGreaterThan(0);
    // The following poll sees the device's close report.
    await advance(2000);
    expect(await screen.findByText('Session closed')).toBeInTheDocument();
    // The row is gone from the active list once the session closed.
    await advance(100);
    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
  });

  it('ends as expired when the device never picks it up', async () => {
    server.use(...disconnectHandlers(['REQUESTED', 'EXPIRED'], false));
    const { user } = renderApp('/sessions/active', { advanceTimers: vi.advanceTimersByTime });
    await requestDisconnect(user);
    expect((await screen.findAllByText('Disconnect requested')).length).toBeGreaterThan(0);
    await advance(2000);
    await advance(2000);
    expect((await screen.findAllByText('Request expired')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Session closed')).not.toBeInTheDocument();
  });

  it('shows the API error in the dialog when the session is no longer active', async () => {
    server.use(
      activeHandler(() => [makeSession()]),
      http.post(apiUrl('/sessions/:id/disconnect'), () =>
        HttpResponse.json(
          { error: { code: 'SESSION_NOT_ACTIVE', message: 'The session is no longer active' } },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderApp('/sessions/active', { advanceTimers: vi.advanceTimersByTime });
    await requestDisconnect(user);
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByText('The session is no longer active')).toBeInTheDocument();
  });
});
