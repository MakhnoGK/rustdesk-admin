import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** OWASP-recommended argon2id parameters (19 MiB, t=2, p=1). */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class PasswordService {
  /** Verified against when the user does not exist, so both paths cost the same. */
  private readonly dummyHash = argon2.hash('dummy-password-for-timing', ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    const target = hash ?? (await this.dummyHash);
    try {
      const ok = await argon2.verify(target, password);
      return hash !== null && ok;
    } catch {
      return false;
    }
  }
}
