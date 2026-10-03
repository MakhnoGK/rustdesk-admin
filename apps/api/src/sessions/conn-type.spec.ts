import { connTypeName } from './conn-type';

describe('connTypeName', () => {
  it.each([
    [0, 'REMOTE_DESKTOP'],
    [1, 'FILE_TRANSFER'],
    [2, 'PORT_FORWARD'],
    [3, 'VIEW_CAMERA'],
    [4, 'TERMINAL'],
  ])('maps %i to %s', (value, name) => {
    expect(connTypeName(value)).toBe(name);
  });

  it.each([null, -1, 5, 1.5])('returns null for %p', (value) => {
    expect(connTypeName(value)).toBeNull();
  });
});
