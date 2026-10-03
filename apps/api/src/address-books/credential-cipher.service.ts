import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { CredentialCipher, cipherKeysFromEnv } from './credential-cipher';

/** The address-book credential cipher, configured from the environment. */
@Injectable()
export class CredentialCipherService extends CredentialCipher {
  constructor(config: AppConfig) {
    super(
      cipherKeysFromEnv(
        config.get('AB_SECRET_KEY'),
        config.get('AB_SECRET_KEY_ID'),
        config.get('AB_PREVIOUS_SECRET_KEYS'),
      ),
    );
  }
}
