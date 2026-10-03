// The admin panel without Docker and without nginx: serves the built panel (dist/) and proxies
// /api/ to the API server, so panel and API share one origin (required by the SameSite=Strict
// session cookie). Does what docker/nginx.conf + docker/entrypoint.sh do in the container.
//
//   pnpm --filter @rustdesk-admin/web build && pnpm --filter @rustdesk-admin/web start
//
// Environment (also read from the repository's .env; real environment variables win):
//   WEB_HOST                     listen address (default 0.0.0.0)
//   WEB_PORT                     listen port (default 8080)
//   API_UPSTREAM                 where /api/ goes (default http://127.0.0.1:21114)
//   APP_NAME                     shown in the sidebar and on the login page
//   ACTIVE_SESSIONS_REFRESH_MS   auto-refresh of the active sessions (1000-300000)
// Unset or empty APP_NAME / ACTIVE_SESSIONS_REFRESH_MS fall back to the build-time VITE_* values.
//
// dist/ is read once at startup: restart after a rebuild.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { extname, join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const here = import.meta.dirname;
const envFile = join(here, '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const host = process.env.WEB_HOST || '0.0.0.0';
const port = Number(process.env.WEB_PORT || 8080);
const upstream = new URL(process.env.API_UPSTREAM || 'http://127.0.0.1:21114');
const distDir = join(here, 'dist');
const MAX_BODY_BYTES = 10 * 1024 * 1024; // nginx: client_max_body_size 10m
const UPSTREAM_TIMEOUT_MS = 60_000; // nginx: proxy_read_timeout 60s

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);
// Connection-level headers that a proxy must not forward (RFC 9110 §7.6.1).
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/** The panel's security headers, from the same file the container's nginx includes. */
function loadSecurityHeaders() {
  const file = join(here, 'docker', 'security-headers.conf');
  const headers = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^add_header\s+(\S+)\s+"([^"]*)"\s+always;/.exec(line.trim());
    if (m) headers[m[1]] = m[2];
  }
  if (Object.keys(headers).length === 0) throw new Error(`No headers found in ${file}`);
  return headers;
}

/** Same output as docker/entrypoint.sh: public values only, never secrets. */
function runtimeConfigJs() {
  const config = {};
  for (const key of ['APP_NAME', 'ACTIVE_SESSIONS_REFRESH_MS']) {
    if (process.env[key]) config[key] = process.env[key];
  }
  const json = JSON.stringify(config).replaceAll('<', '\\u003c');
  return `// Generated at server start. Public values only: never put secrets here.\nwindow.__APP_CONFIG__ = ${json};\n`;
}

function asset(urlPath, body) {
  const ext = extname(urlPath);
  return {
    body,
    gzip: COMPRESSIBLE.has(ext) && body.length >= 1024 ? gzipSync(body, { level: 5 }) : null,
    type: TYPES[ext] ?? 'application/octet-stream',
    // Content-hashed build output is immutable; everything else (index.html, config.js) revalidates.
    cache: urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
}

/** Every file of dist/ by URL path, so no request ever touches the file system. */
function loadDist() {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(
      `${distDir}/index.html not found: run \`pnpm --filter @rustdesk-admin/web build\``,
    );
  }
  const files = new Map();
  for (const entry of readdirSync(distDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    const urlPath = '/' + relative(distDir, full).split(sep).join('/');
    files.set(urlPath, asset(urlPath, readFileSync(full)));
  }
  files.set('/config.js', asset('/config.js', Buffer.from(runtimeConfigJs())));
  return files;
}

const securityHeaders = loadSecurityHeaders();
const files = loadDist();
const indexHtml = files.get('/index.html');

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const { pathname } = new URL(req.url ?? '/', 'http://panel');
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok\n');
    return;
  }
  // SPA fallback: unknown paths render the app, which shows its own 404 page; missing build
  // output stays a 404.
  const file = files.get(pathname) ?? (pathname.startsWith('/assets/') ? null : indexHtml);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found\n');
    return;
  }
  const gzip = file.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  const body = gzip ? file.gzip : file.body;
  res.writeHead(200, {
    ...securityHeaders,
    'Content-Type': file.type,
    'Content-Length': body.length,
    'Cache-Control': file.cache,
    ...(file.gzip ? { Vary: 'Accept-Encoding' } : {}),
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function stripHopByHop(headers) {
  const out = { ...headers };
  for (const name of HOP_BY_HOP) delete out[name];
  return out;
}

/**
 * Forwards the request unchanged (Host, Origin and cookies included: the API checks Origin against
 * ADMIN_ALLOWED_ORIGINS) and appends the client address to X-Forwarded-For, like nginx's
 * $proxy_add_x_forwarded_for. The API must list this server in TRUSTED_PROXIES (loopback).
 */
function proxyToApi(req, res) {
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    res.writeHead(413, { 'Content-Type': 'text/plain' }).end('Payload too large\n');
    return;
  }
  const clientIp = (req.socket.remoteAddress ?? '').replace(/^::ffff:(?=\d+\.)/, '');
  const forwardedFor = req.headers['x-forwarded-for'];
  const headers = {
    ...stripHopByHop(req.headers),
    'x-real-ip': clientIp,
    'x-forwarded-for': forwardedFor ? `${forwardedFor}, ${clientIp}` : clientIp,
    // Behind a TLS-terminating proxy, keep its X-Forwarded-Proto; otherwise this server's scheme.
    'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http',
    'x-forwarded-host': req.headers.host ?? '',
  };
  const client = upstream.protocol === 'https:' ? https : http;
  const upstreamReq = client.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: req.url,
      headers,
      timeout: UPSTREAM_TIMEOUT_MS,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, stripHopByHop(upstreamRes.headers));
      upstreamRes.pipe(res);
    },
  );
  upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('upstream timeout')));
  upstreamReq.on('error', (err) => {
    console.error(`API upstream ${upstream.origin}: ${err.message}`);
    if (res.headersSent) res.destroy();
    else res.writeHead(502, { 'Content-Type': 'text/plain' }).end('Bad gateway\n');
  });
  // The browser went away: stop the upstream request too.
  res.on('close', () => upstreamReq.destroy());
  req.pipe(upstreamReq);
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/')) proxyToApi(req, res);
  else serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(
    `Admin panel on http://${host}:${port} (dist: ${files.size} files), /api/ → ${upstream.origin}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
