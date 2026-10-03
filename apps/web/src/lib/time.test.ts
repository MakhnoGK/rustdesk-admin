import {
  dayRangeToUtc,
  elapsedSeconds,
  formatDateTime,
  formatDuration,
  formatDurationLabel,
  parseApiDate,
  startOfDayIn,
  toDay,
} from './time';

// vitest.config.ts pins TZ=Europe/Berlin: CEST (+02:00) until 2026-10-25 03:00, then CET (+01:00).

describe('parseApiDate', () => {
  it('parses ISO-8601 with an explicit zone', () => {
    expect(parseApiDate('2026-10-03T12:00:00.000Z').toISOString()).toBe('2026-10-03T12:00:00.000Z');
    expect(parseApiDate('2026-10-03T14:00:00+02:00').toISOString()).toBe(
      '2026-10-03T12:00:00.000Z',
    );
  });

  it('rejects timestamps without a zone (they would be read as local time)', () => {
    expect(() => parseApiDate('2026-10-03T12:00:00')).toThrow(RangeError);
    expect(() => parseApiDate('yesterday')).toThrow(RangeError);
  });
});

describe('formatDateTime', () => {
  it('shows local time by default', () => {
    expect(formatDateTime('2026-10-03T12:00:00.000Z', undefined)).toBe('2026-10-03 14:00:00');
  });

  it('shows UTC with a suffix when the toggle is on', () => {
    expect(formatDateTime('2026-10-03T12:00:00.000Z', 'UTC')).toBe('2026-10-03 12:00:00 UTC');
  });

  it('follows the DST offset of the instant, not of today', () => {
    expect(formatDateTime('2026-12-01T12:00:00.000Z', undefined)).toBe('2026-12-01 13:00:00');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [12, '12s'],
    [65, '1m 05s'],
    [3600, '1h 00m 00s'],
    [3912, '1h 05m 12s'],
    [90_000, '25h 00m 00s'],
  ])('%i s → %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  it('never shows negative or fractional seconds', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(12.9)).toBe('12s');
  });
});

describe('formatDurationLabel', () => {
  it('marks estimated durations with ≈', () => {
    expect(formatDurationLabel(3912, true)).toBe('≈ 1h 05m 12s');
    expect(formatDurationLabel(3912, false)).toBe('1h 05m 12s');
  });

  it('shows a dash for unknown durations', () => {
    expect(formatDurationLabel(null, true)).toBe('—');
  });
});

describe('elapsedSeconds', () => {
  it('counts whole seconds since the start, never negative', () => {
    const now = new Date('2026-10-03T12:00:10.900Z');
    expect(elapsedSeconds('2026-10-03T12:00:00.000Z', now)).toBe(10);
    expect(elapsedSeconds('2026-10-03T12:01:00.000Z', now)).toBe(0);
  });
});

describe('dayRangeToUtc', () => {
  it('turns an inclusive local day range into [from, to) in UTC', () => {
    expect(dayRangeToUtc('2026-10-01', '2026-10-03', undefined)).toEqual({
      from: '2026-09-30T22:00:00.000Z',
      to: '2026-10-03T22:00:00.000Z',
    });
  });

  it('keeps whole local days across the autumn DST change (25 h day)', () => {
    const { from, to } = dayRangeToUtc('2026-10-25', '2026-10-25', undefined);
    expect(from).toBe('2026-10-24T22:00:00.000Z');
    expect(to).toBe('2026-10-25T23:00:00.000Z');
    expect((Date.parse(to) - Date.parse(from)) / 3600_000).toBe(25);
  });

  it('keeps whole local days across the spring DST change (23 h day)', () => {
    const { from, to } = dayRangeToUtc('2026-03-29', '2026-03-29', undefined);
    expect((Date.parse(to) - Date.parse(from)) / 3600_000).toBe(23);
  });

  it('uses UTC days when the UTC toggle is on', () => {
    expect(dayRangeToUtc('2026-10-25', '2026-10-25', 'UTC')).toEqual({
      from: '2026-10-25T00:00:00.000Z',
      to: '2026-10-26T00:00:00.000Z',
    });
  });

  it('rejects malformed days', () => {
    expect(() => startOfDayIn('2026/10/25', undefined)).toThrow(RangeError);
  });
});

describe('toDay', () => {
  it('gives the calendar day in the display zone', () => {
    const lateEvening = new Date('2026-10-03T23:30:00.000Z');
    expect(toDay(lateEvening, undefined)).toBe('2026-10-04');
    expect(toDay(lateEvening, 'UTC')).toBe('2026-10-03');
  });
});
