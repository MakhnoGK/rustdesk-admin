import { historyHref, historySearchSchema, toSessionListQuery } from './schemas';
import { sessionKeys } from './api';

const parse = (query: string) =>
  historySearchSchema.parse(Object.fromEntries(new URLSearchParams(query)));

describe('session history URL state', () => {
  it('applies defaults', () => {
    expect(parse('')).toMatchObject({ page: 1, pageSize: 50, sort: 'startedAt:desc' });
  });

  it('parses valid filters', () => {
    const s = parse(
      'status=TIMEOUT&deviceId=987654321&authenticated=false&minDurationMinutes=5&page=3',
    );
    expect(s).toMatchObject({
      status: 'TIMEOUT',
      deviceId: '987654321',
      authenticated: false,
      minDurationMinutes: 5,
      page: 3,
    });
  });

  it('degrades invalid values to defaults instead of failing', () => {
    const s = parse(
      'status=BOGUS&page=-2&pageSize=5000&sort=password:asc&authenticated=maybe&from=yesterday',
    );
    expect(s).toMatchObject({ page: 1, pageSize: 50, sort: 'startedAt:desc' });
    expect(s.status).toBeUndefined();
    expect(s.authenticated).toBeUndefined();
    expect(s.from).toBeUndefined();
  });

  it('builds the API query: local days → UTC [from, to), minutes → seconds', () => {
    const query = toSessionListQuery(
      parse('from=2026-10-01&to=2026-10-02&minDurationMinutes=2'),
      undefined,
    );
    expect(query).toMatchObject({
      from: '2026-09-30T22:00:00.000Z',
      to: '2026-10-02T22:00:00.000Z',
      minDurationSeconds: 120,
    });
  });

  it('passes exact instants (dashboard links) through', () => {
    const query = toSessionListQuery(
      parse('from=2026-10-02T12:01:00.000Z&to=2026-10-03T12:01:00.000Z'),
      undefined,
    );
    expect(query.from).toBe('2026-10-02T12:01:00.000Z');
    expect(query.to).toBe('2026-10-03T12:01:00.000Z');
  });

  it('builds history links', () => {
    expect(historyHref({ status: 'TIMEOUT', authenticated: false })).toBe(
      '/sessions?status=TIMEOUT&authenticated=false',
    );
  });
});

describe('sessionKeys', () => {
  it('nests lists under the feature key so one invalidation covers all pages', () => {
    const list = sessionKeys.list({ page: 2 });
    expect(list.slice(0, 2)).toEqual([...sessionKeys.lists()]);
    expect(sessionKeys.lists().slice(0, 1)).toEqual([...sessionKeys.all]);
    expect(sessionKeys.detail('x')).toEqual(['sessions', 'detail', 'x']);
    expect(sessionKeys.disconnect('x')).toEqual(['sessions', 'disconnect', 'x']);
  });
});
