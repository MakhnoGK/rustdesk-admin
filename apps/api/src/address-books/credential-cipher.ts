import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export interface CipherKeys {
  /** Key used for every new encryption. */
  current: { id: string; key: Buffer };
  /** Retired keys that can still decrypt (rotation). */
  previous: ReadonlyArray<{ id: string; key: Buffer }>;
}

/**
 * AES-256-GCM for address-book credentials (`hash`, `password`).
 * Envelope: `v1:<keyId>:<iv b64>:<auth tag b64>:<ciphertext b64>`; the key ID makes rotation possible.
 */
export class CredentialCipher {
  private readonly keys: Map<string, Buffer>;

  constructor(private readonly config: CipherKeys) {
    this.keys = new Map([[config.current.id, config.current.key]]);
    for (const k of config.previous) if (!this.keys.has(k.id)) this.keys.set(k.id, k.key);
  }

  get currentKeyId(): string {
    return this.config.current.id;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.config.current.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      this.config.current.id,
      iv.toString('base64'),
      tag.toString('base64'),
      data.toString('base64'),
    ].join(':');
  }

  decrypt(envelope: string): string {
    const parts = envelope.split(':');
    if (parts.length !== 5 || parts[0] !== VERSION)
      throw new Error('Unrecognised credential envelope');
    const [, keyId, iv, tag, data] = parts as [string, string, string, string, string];
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`No key configured for credential key ID "${keyId}"`);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  }

  keyIdOf(envelope: string): string | null {
    const parts = envelope.split(':');
    return parts.length === 5 && parts[0] === VERSION ? (parts[1] ?? null) : null;
  }

  /** Empty string clears the credential (null); anything else is encrypted. */
  seal(value: string | undefined | null): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return this.encrypt(value);
  }

  open(envelope: string | null): string {
    return envelope ? this.decrypt(envelope) : '';
  }
}

/** Parses AB_SECRET_KEY / AB_SECRET_KEY_ID / AB_PREVIOUS_SECRET_KEYS into cipher keys. */
export function cipherKeysFromEnv(
  currentKey: string,
  currentKeyId: string,
  previous: string[],
): CipherKeys {
  return {
    current: { id: currentKeyId, key: Buffer.from(currentKey, 'base64') },
    previous: previous.map((pair) => {
      const idx = pair.indexOf(':');
      return { id: pair.slice(0, idx), key: Buffer.from(pair.slice(idx + 1), 'base64') };
    }),
  };
}
