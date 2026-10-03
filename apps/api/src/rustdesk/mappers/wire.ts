// Lenient readers for RustDesk JSON bodies: a wrong type reads as "absent", never as a crash.

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A string field, trimmed to `max` characters; '' and non-strings read as null. */
export function readString(obj: JsonObject, key: string, max = 256): string | null {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) return null;
  return v.length > max ? v.slice(0, max) : v;
}

/** An integer field accepted as a number or a numeric string, within [min, max]. */
export function readInt(
  obj: JsonObject,
  key: string,
  min = -2_147_483_648,
  max = 2_147_483_647,
): number | null {
  const v = obj[key];
  const n =
    typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** A 64-bit integer that may have been kept as a string by the body parser; returned as its decimal text. */
export function readInt64Text(obj: JsonObject, key: string): string | null {
  const v = obj[key];
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  if (typeof v === 'string' && /^-?\d{1,20}$/.test(v)) return v;
  return null;
}

export function readBigInt(obj: JsonObject, key: string): bigint | null {
  const text = readInt64Text(obj, key);
  return text === null ? null : BigInt(text);
}
