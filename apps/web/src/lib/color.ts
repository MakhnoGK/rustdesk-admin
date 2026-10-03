// Address-book tag colors are 32-bit unsigned ARGB integers (Flutter's Color.value).

const HEX6 = /^#([0-9a-f]{6})$/i;

/** ARGB integer → `#rrggbb` (alpha dropped: chips are always opaque). */
export function argbToHex(argb: number): string {
  const rgb = (argb >>> 0) & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

/** ARGB integer → CSS `rgb(r g b / a)` keeping the alpha channel. */
export function argbToCss(argb: number): string {
  const v = argb >>> 0;
  const a = (v >>> 24) & 0xff;
  const r = (v >>> 16) & 0xff;
  const g = (v >>> 8) & 0xff;
  const b = v & 0xff;
  return `rgb(${r} ${g} ${b} / ${Math.round((a / 255) * 100) / 100})`;
}

/** `#rrggbb` → opaque ARGB integer (alpha 0xff), as the RustDesk client stores it. */
export function hexToArgb(hex: string): number {
  const m = HEX6.exec(hex.trim());
  if (!m?.[1]) throw new RangeError(`Not a #rrggbb color: ${hex}`);
  return (0xff000000 | parseInt(m[1], 16)) >>> 0;
}

export function isHexColor(value: string): boolean {
  return HEX6.test(value.trim());
}

/** Black or white text for a chip background, by relative luminance (WCAG). */
export function readableTextOn(argb: number): '#000000' | '#ffffff' {
  const v = argb >>> 0;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * channel((v >>> 16) & 0xff) +
    0.7152 * channel((v >>> 8) & 0xff) +
    0.0722 * channel(v & 0xff);
  return l > 0.179 ? '#000000' : '#ffffff';
}

/** Default palette offered in the tag form. */
export const TAG_COLOR_PRESETS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const;
