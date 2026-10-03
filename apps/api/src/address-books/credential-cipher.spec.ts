import { randomBytes } from 'node:crypto';
import { CredentialCipher } from './credential-cipher';

const key = () => randomBytes(32);

describe('CredentialCipher', () => {
  it('round-trips and produces a fresh IV every time', () => {
    const cipher = new CredentialCipher({ current: { id: 'k1', key: key() }, previous: [] });
    const a = cipher.encrypt('s3cret');
    const b = cipher.encrypt('s3cret');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:k1:')).toBe(true);
    expect(cipher.decrypt(a)).toBe('s3cret');
  });

  it('decrypts with a previous key after rotation', () => {
    const oldKey = key();
    const before = new CredentialCipher({ current: { id: 'k1', key: oldKey }, previous: [] });
    const envelope = before.encrypt('legacy');
    const after = new CredentialCipher({
      current: { id: 'k2', key: key() },
      previous: [{ id: 'k1', key: oldKey }],
    });
    expect(after.decrypt(envelope)).toBe('legacy');
    expect(after.keyIdOf(after.encrypt('new'))).toBe('k2');
  });

  it('rejects tampering and unknown keys', () => {
    const cipher = new CredentialCipher({ current: { id: 'k1', key: key() }, previous: [] });
    const parts = cipher.encrypt('x').split(':');
    parts[4] = Buffer.from('tampered').toString('base64');
    expect(() => cipher.decrypt(parts.join(':'))).toThrow();
    const other = new CredentialCipher({ current: { id: 'k9', key: key() }, previous: [] });
    expect(() => cipher.decrypt(other.encrypt('x'))).toThrow(/k9/);
  });

  it('seal/open treat empty as "no credential"', () => {
    const cipher = new CredentialCipher({ current: { id: 'k1', key: key() }, previous: [] });
    expect(cipher.seal(undefined)).toBeUndefined();
    expect(cipher.seal('')).toBeNull();
    expect(cipher.open(null)).toBe('');
    expect(cipher.open(cipher.seal('v') as string)).toBe('v');
  });
});
