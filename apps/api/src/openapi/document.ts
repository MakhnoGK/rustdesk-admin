import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ADMIN_COOKIE_NAME } from '../auth/auth.types';
import { AdminErrorDto, RustdeskErrorDto } from '../common/errors/error.dto';
import { APP_VERSION } from '../common/version';

export const SWAGGER_PATH = 'api/docs';

const DESCRIPTION = `
Self-hosted replacement for the RustDesk **API server** (port 21114). It does not replace \`hbbs\`/\`hbbr\`.

**rustdesk** — endpoints the RustDesk client calls. Quirks of the client contract:
- bodies are parsed as JSON whatever the Content-Type; an empty body is \`{}\`;
- errors are \`{"error": "<string>"}\`;
- address-book mutations and audit posts answer **200 with an empty body** (204 or a non-empty body is a failure for the client);
- \`/api/sysinfo\` and \`/api/sysinfo_ver\` answer plain text;
- audit, heartbeat and sysinfo are unauthenticated by protocol.

**admin** — the admin panel API under \`/api/admin\`: session cookie, role ADMIN, an allowed \`Origin\` on state-changing requests,
errors \`{"error": {"code", "message", "details"?}}\`, ISO-8601 UTC timestamps, durations in whole seconds.
`.trim();

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('RustDesk API server')
    .setDescription(DESCRIPTION)
    .setVersion(APP_VERSION)
    .addTag('rustdesk', 'Called by RustDesk clients (verified against rustdesk master e5bc204)')
    .addTag('admin', 'Admin panel API')
    .addTag('health', 'Probes')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Token from POST /api/login' })
    .addCookieAuth(ADMIN_COOKIE_NAME, { type: 'apiKey', in: 'cookie', name: ADMIN_COOKIE_NAME })
    .build();
  return SwaggerModule.createDocument(app, config, {
    extraModels: [AdminErrorDto, RustdeskErrorDto],
    // Stable operation IDs for the generated client: AdminUsers_list, RustdeskAb_addPeer, ...
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}
