// Re-encrypts address-book credentials under the current AB_SECRET_KEY / AB_SECRET_KEY_ID.
// Rotation: set the new key as AB_SECRET_KEY with a new AB_SECRET_KEY_ID, move the old one to
// AB_PREVIOUS_SECRET_KEYS ("<oldId>:<oldKey>"), deploy, run this once, then drop the old key.
//
//   pnpm --filter @rustdesk-admin/api ab:rotate-key

import { NestFactory } from '@nestjs/core';
import { AbPeersService } from '../address-books/ab-peers.service';
import { CommandModule } from '../seed/seed.module';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CommandModule, {
    logger: ['error', 'warn'],
  });
  try {
    const changed = await app.get(AbPeersService).reencryptAll();
    console.log(`Re-encrypted credentials of ${changed} address-book peer(s).`);
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
