import { applyPatch, listParam, searchParamsToObject } from './url-state';

describe('repeated search params', () => {
  it('reads a repeated key as an array and a single one as a string', () => {
    expect(searchParamsToObject(new URLSearchParams('tag=a&q=x&tag=b'))).toEqual({
      tag: ['a', 'b'],
      q: 'x',
    });
  });

  it('writes arrays by repeating the key and removes empty ones', () => {
    const params = new URLSearchParams('tag=old&page=2');
    expect(applyPatch(params, { tag: ['a', 'b'] }).toString()).toBe('page=2&tag=a&tag=b');
    expect(applyPatch(params, { tag: [] }).toString()).toBe('page=2');
    expect(applyPatch(params, { tag: undefined }).toString()).toBe('page=2');
  });

  it('listParam dedupes, trims, drops invalid values and caps the count', () => {
    const schema = listParam(5, 2);
    expect(schema.parse('a')).toEqual(['a']);
    expect(schema.parse([' a ', 'a', '', 'toolong', 'b', 'c'])).toEqual(['a', 'b']);
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse([''])).toBeUndefined();
    expect(schema.parse(42)).toBeUndefined();
  });
});
