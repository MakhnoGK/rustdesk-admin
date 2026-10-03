/** Axis ticks in the unit that fits the largest value: hours, minutes or seconds. */
export function durationTickFormatter(maxSeconds: number): (seconds: number) => string {
  const [unit, size] = maxSeconds >= 7200 ? ['h', 3600] : maxSeconds >= 120 ? ['m', 60] : ['s', 1];
  return (seconds) => {
    const value = seconds / size;
    return `${value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10}${unit}`;
  };
}
