import { addSeconds, durationSeconds, isIsoDateTime, toIso } from './time';

describe('time helpers', () => {
  it('durationSeconds floors to whole seconds and never goes negative', () => {
    const start = new Date('2026-10-03T10:00:00.000Z');
    expect(durationSeconds(start, new Date('2026-10-03T10:01:30.999Z'))).toBe(90);
    expect(durationSeconds(start, start)).toBe(0);
    expect(durationSeconds(start, new Date('2026-10-03T09:59:59.000Z'))).toBe(0);
  });

  it('addSeconds works in both directions', () => {
    const t = new Date('2026-10-03T00:00:00Z');
    expect(addSeconds(t, 61).toISOString()).toBe('2026-10-03T00:01:01.000Z');
    expect(addSeconds(t, -1).toISOString()).toBe('2026-10-02T23:59:59.000Z');
  });

  it('toIso renders UTC with Z and keeps null', () => {
    expect(toIso(new Date(Date.UTC(2026, 9, 3, 1, 2, 3)))).toBe('2026-10-03T01:02:03.000Z');
    expect(toIso(null)).toBeNull();
  });

  it.each([
    ['2026-10-03T10:00:00Z', true],
    ['2026-10-03T10:00:00.123Z', true],
    ['2026-10-03T10:00:00+02:00', true],
    ['2026-10-03T10:00Z', true],
    ['2026-10-03', false],
    ['2026-10-03T10:00:00', false],
    ['2026-13-03T10:00:00Z', false],
    ['yesterday', false],
  ])('isIsoDateTime(%s) = %s', (value, expected) => {
    expect(isIsoDateTime(value)).toBe(expected);
  });
});
