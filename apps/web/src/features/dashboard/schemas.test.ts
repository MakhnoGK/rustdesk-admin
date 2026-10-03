import { bucketFor, dashboardSearchSchema, resolvePeriod } from './schemas';

const now = new Date('2026-10-03T12:00:30.000Z');
const parse = (q: string) =>
  dashboardSearchSchema.parse(Object.fromEntries(new URLSearchParams(q)));

describe('dashboard periods', () => {
  it('last 24 h ends at the next whole minute, hourly buckets', () => {
    expect(resolvePeriod(parse(''), undefined, now)).toEqual({
      from: '2026-10-02T12:01:00.000Z',
      to: '2026-10-03T12:01:00.000Z',
      bucket: 'hour',
    });
  });

  it('last 7 days are whole local days including today, daily buckets', () => {
    expect(resolvePeriod(parse('period=7d'), undefined, now)).toEqual({
      from: '2026-09-26T22:00:00.000Z',
      to: '2026-10-03T22:00:00.000Z',
      bucket: 'day',
    });
  });

  it('a custom range of two days uses hourly buckets (≤ 48 h)', () => {
    const range = resolvePeriod(parse('period=custom&from=2026-10-01&to=2026-10-02'), 'UTC', now);
    expect(range).toEqual({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-03T00:00:00.000Z',
      bucket: 'hour',
    });
  });

  it('bucket boundary', () => {
    expect(bucketFor('2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z')).toBe('hour');
    expect(bucketFor('2026-10-01T00:00:00Z', '2026-10-03T00:00:01Z')).toBe('day');
  });
});

describe('duration axis ticks', () => {
  it('uses the unit that fits the largest value', async () => {
    const { durationTickFormatter } = await import('./chart-format');
    expect(durationTickFormatter(73)(60)).toBe('60s');
    expect(durationTickFormatter(5400)(1800)).toBe('30m');
    expect(durationTickFormatter(36_000)(5400)).toBe('1.5h');
  });
});
