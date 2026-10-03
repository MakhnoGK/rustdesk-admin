// Builds the OpenAPI document without a database and without listening on a port, and writes
// it to packages/api-contract/openapi.json (or the path given as the first argument).
//
//   pnpm --filter @rustdesk-admin/api openapi:emit

import './emit-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from './document';

async function main(): Promise<void> {
  // Preview mode resolves the module graph without instantiating providers: no connections.
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
    bodyParser: false,
  });
  const document = buildOpenApiDocument(app);
  await app.close();

  const out = resolve(
    process.argv[2] ?? resolve(__dirname, '../../../../../packages/api-contract/openapi.json'),
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI document written to ${out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
