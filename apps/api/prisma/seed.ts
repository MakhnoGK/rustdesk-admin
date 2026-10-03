// Compiled to dist/prisma/seed.js; run by `prisma db seed` and by the api-migrate container.
import { runSeed } from '../src/seed/seed';

runSeed().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
