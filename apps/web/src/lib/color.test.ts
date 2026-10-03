import { argbToCss, argbToHex, hexToArgb, isHexColor, readableTextOn } from './color';

describe('ARGB colors', () => {
  it('converts an ARGB integer to #rrggbb', () => {
    expect(argbToHex(0xff3b82f6)).toBe('#3b82f6');
    expect(argbToHex(0xff000000)).toBe('#000000');
    expect(argbToHex(0)).toBe('#000000');
  });

  it('handles values above 2^31 (unsigned) and signed inputs alike', () => {
    expect(argbToHex(4294967295)).toBe('#ffffff');
    expect(argbToHex(-1)).toBe('#ffffff');
  });

  it('converts #rrggbb to an opaque unsigned ARGB integer', () => {
    expect(hexToArgb('#3b82f6')).toBe(0xff3b82f6);
    expect(hexToArgb('#FFFFFF')).toBe(4294967295);
    expect(hexToArgb('#3b82f6')).toBeGreaterThan(0);
  });

  it('round-trips', () => {
    for (const hex of ['#000000', '#ffffff', '#ef4444', '#14b8a6']) {
      expect(argbToHex(hexToArgb(hex))).toBe(hex);
    }
  });

  it('keeps the alpha channel in CSS', () => {
    expect(argbToCss(0x803b82f6)).toBe('rgb(59 130 246 / 0.5)');
    expect(argbToCss(0xff3b82f6)).toBe('rgb(59 130 246 / 1)');
  });

  it('rejects anything but #rrggbb', () => {
    expect(isHexColor('#abc')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(() => hexToArgb('#abc')).toThrow(RangeError);
  });

  it('picks readable text for a chip', () => {
    expect(readableTextOn(hexToArgb('#ffffff'))).toBe('#000000');
    expect(readableTextOn(hexToArgb('#1e3a8a'))).toBe('#ffffff');
  });
});
