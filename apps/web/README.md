# RustDesk admin — web panel (`@rustdesk-admin/web`)

The human-facing UI for the admin API of [`apps/api`](../../README.md): sign-in, live active
sessions with remote disconnect, session history and analytics, devices, address books with sharing
and tags, users and their tokens, and the audit log.

```bash
docker compose up -d                 # from the repo root: db → api-migrate → api → web
open http://localhost:8080           # sign in as INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD
```

Contents: [Architecture](#architecture) · [Contract matrix](#contract-matrix) ·
[Screens](#screens) · [Running](#installation-and-running) · [Testing](#testing) ·
[Production checklist](#production-checklist)

---

## Architecture

| Concern      | Choice                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Build        | Vite 8 SPA, React 19, TypeScript 6 (strict, `noUncheckedIndexedAccess`)                                |
| UI           | shadcn/ui (`radix-vega` style, Radix primitives) + Tailwind CSS v4, lucide icons, sonner toasts        |
| Routing      | React Router 7 **data mode** (`createBrowserRouter`), every page `lazy`, `errorElement` on every level |
| Server state | TanStack Query 5, one query-key factory per feature (`sessionKeys.list(query)`, …)                     |
| Tables       | TanStack Table 8 in one `DataTable` (shadcn pattern), fully server-driven                              |
| Forms        | React Hook Form + Zod through shadcn `Field` components                                                |
| Charts       | Recharts 3 through the shadcn `Chart` component                                                        |
| API client   | `openapi-fetch` typed by `@rustdesk-admin/api-contract`; the only HTTP client is `src/api/client.ts`   |
| Time         | date-fns 4 + `@date-fns/tz`; helpers in `src/lib/time.ts`                                              |
| Tests        | Vitest 5 + React Testing Library + MSW 2 (unit and integration), Playwright (e2e)                      |
| Serving      | unprivileged nginx (alpine) in Docker, `server.mjs` without: static files, SPA fallback, `/api/` proxy |

**Relation to the API and to RustDesk.** The panel calls only `/api/admin/*` (and nothing of the
RustDesk-facing namespace). It never talks to `hbbs`/`hbbr` and offers nothing RustDesk cannot do:
no "connect", "view screen" or "send file". Remote disconnect is real but asynchronous: the API
queues it, the device receives it with its next heartbeat, and the session closes when the device
reports the close — the UI shows _requested → delivered → closed_, or _expired_.

**Contract.** All API types come from `@rustdesk-admin/api-contract` (generated from the API's
OpenAPI document, committed). `src/api/types.ts` only gives them short aliases. Turborepo builds
the contract first: `api#openapi:emit` → `api-contract#generate` → `web#build|typecheck|test`
(`dependsOn: ["^generate", "^build"]`).

**Authentication.** The session is an httpOnly, `SameSite=Strict` cookie set by
`POST /api/admin/auth/login`. JavaScript never sees a token: no storage, no `Authorization` header.

- The protected route's loader calls `GET /api/admin/auth/me` before rendering (no flash of
  protected content); no session → `/login?redirect=<path>`.
- Any 401 (query or mutation) → back to `/login?redirect=…&reason=expired`, then the query cache is
  cleared. After login the panel returns to `redirect` — same-origin relative paths only
  (`safeRedirect`), anything else goes to `/`.
- `expiresAt` from `auth/me`: a warning toast 5 minutes before, sign-out at expiry.
- Logout: `POST /auth/logout`, then the cache is cleared whatever the result.
- Mutations that carry a password (login, create user, reset password, peer password) are reset as
  soon as they settle and have `gcTime: 0`, so no password stays in the TanStack caches.
- CSRF is the API's job (`SameSite=Strict` + `Origin` check against `ADMIN_ALLOWED_ORIGINS`); the
  browser sends `Origin` on same-origin mutations and neither nginx nor the Vite proxy touches it.

**Errors.** Every failure becomes an `ApiError` (`src/api/errors.ts`) parsed from
`{"error": {"code", "message", "details"}}`. Non-envelope bodies (proxy HTML, stack traces) and
5xx texts are never shown. Queries render errors inline (`ErrorState`: 403 → "No access",
404 → not found, else message + Retry). Mutations report each error exactly once: forms map 422
details and 409 conflicts to fields and 400/403 to a form alert; 429 (with `Retry-After`), 5xx and
network errors become toasts. Retries: none on 4xx, up to 3 with backoff on network errors and 5xx.

**State.** Server data lives only in TanStack Query; filters, sort, page and tabs live in the URL
(parsed by Zod schemas that degrade bad values to defaults); local UI state uses `useState`; the
current user is one small context over the `auth/me` query. Theme and the "Show times in UTC"
toggle are display preferences in `localStorage`.

**Time.** The API speaks UTC ISO-8601. Times display in the viewer's zone, or UTC with the global
toggle. Date filters are calendar days in that zone, sent as `[from, to)` UTC instants (DST-safe:
23 h and 25 h days stay whole days). Durations are the API's integer seconds as `1h 05m 12s`;
estimated ones (`durationEstimated`) show `≈` with the close reason in a tooltip. The only
client-side duration is the ticking elapsed time of active sessions.

**Runtime configuration.** Build time: `VITE_*` (see `.env.example`). Run time: the container
entrypoint writes `/config.js` (`window.__APP_CONFIG__`) from `APP_NAME` and
`ACTIVE_SESSIONS_REFRESH_MS`, so one image serves every environment. Both are merged and validated
with Zod at start; invalid values show a configuration-error screen. Everything there is public.

### Project layout

```text
apps/web/
├── public/                 config.js (dev default; rewritten in Docker), theme-init.js, favicon
├── src/
│   ├── main.tsx            config check → <App /> or the configuration-error screen
│   ├── app/                router, routes, providers, query client, layout/, errors/
│   ├── api/                client.ts (openapi-fetch), errors.ts (ApiError), types.ts (aliases)
│   ├── features/<name>/    api.ts (keys, queries, mutations) · schemas.ts (Zod) · components/ ·
│   │                       pages/ · routes.tsx — auth, dashboard, sessions, devices,
│   │                       address-books, users, audit, system
│   ├── components/         app components (DataTable, ErrorState, StatusBadge, DurationText, …)
│   ├── components/ui/      shadcn CLI output only
│   ├── lib/                config, time, color, format, range, url-state, form-errors, storage
│   ├── hooks/              use-url-state, use-now, use-debounced-value, preferences contexts
│   ├── styles/             globals.css (theme tokens), shadcn-tailwind.css (vendored, verbatim)
│   └── test/               MSW server and handlers, fixtures, render helper
├── e2e/                    Playwright specs + in-browser API mock
├── docker/                 nginx.conf (template), security-headers.conf, entrypoint.sh
├── server.mjs              without Docker: static files + /api/ proxy (replaces nginx)
└── Dockerfile              turbo prune → pnpm build → nginx-unprivileged
```

### shadcn/ui

Initialized with `npx shadcn@4.21.0 init -b radix -p vega`; components were added only with:

```bash
npx shadcn@4.21.0 add alert alert-dialog badge breadcrumb button calendar card chart checkbox \
  command dialog dropdown-menu empty field input input-group label popover radio-group \
  scroll-area select separator sheet sidebar skeleton sonner spinner switch table tabs textarea \
  toggle-group tooltip
```

`src/components/ui/*` and `src/hooks/use-mobile.ts` are untouched CLI output (excluded from
Prettier; ESLint relaxes only the typing rules recharts' payloads need). The one documented theme
tweak lives in `globals.css`: session status tokens (`--status-active|closed|timeout|unknown`)
for both themes, and two chart hues instead of the neutral preset's grays. `shadcn/tailwind.css`
(variants the components use) is vendored verbatim as `src/styles/shadcn-tailwind.css`, so the
shadcn CLI package — with its build-time dependency tree — is not an app dependency. React Hook
Form uses the current `Field` components (the registry no longer ships `form` for this style).

---

## Contract matrix

All paths are under `/api/admin`. "Yes" = present in `packages/api-contract/openapi.json`.

| Screen / action                   | Method + path                                                                                            | In contract | Notes                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| Sign in / out                     | `POST /auth/login`, `POST /auth/logout`                                                                  | Yes         | 401 / 403 / 429 messages shown on the form                                  |
| App start, session expiry         | `GET /auth/me`                                                                                           | Yes         | `expiresAt` drives the warning and the sign-out                             |
| Dashboard KPIs                    | `GET /stats/summary?from&to`                                                                             | Yes         | each KPI links to the history with the same range and filter                |
| Sessions-over-time charts         | `GET /stats/timeseries?from&to&bucket=hour\|day`                                                         | Yes         | `day` buckets are UTC days → labelled in UTC                                |
| Top initiators / targets          | `GET /stats/top?by=initiator\|target&limit`                                                              | Yes         | rows link to the filtered history                                           |
| Active sessions (polling)         | `GET /sessions/active?page&pageSize`                                                                     | Yes         | newest first (the API ignores `sort` here)                                  |
| "No heartbeat" flag               | `GET /system/info` (`heartbeatGraceSeconds`)                                                             | Yes         |                                                                             |
| Request disconnect                | `POST /sessions/:id/disconnect`                                                                          | Yes         | 201 new / 200 existing; 409 `SESSION_NOT_ACTIVE` shown in the dialog        |
| Follow disconnect                 | `GET /sessions/:id/disconnect`, `GET /sessions/:id`                                                      | Yes         | polled every 2 s until delivered/expired and closed                         |
| Session history                   | `GET /sessions` (status, deviceId, initiatorId, authenticated, from, to, minDurationSeconds, sort, page) | Yes         | all server-side                                                             |
| Session detail + audit timeline   | `GET /sessions/:id` (`events`)                                                                           | Yes         |                                                                             |
| Disconnect history (detail sheet) | `GET /sessions/:id/disconnects`                                                                          | Yes         | every request, newest first (at most 100); polled while the newest waits    |
| Devices                           | `GET /devices?search&online&sort&page`                                                                   | Yes         |                                                                             |
| Device detail                     | `GET /devices/:uuid`                                                                                     | Yes         | uuid is base64: URL-encoded in links and requests                           |
| Device's recent sessions          | `GET /sessions?deviceId=<rustdeskId>`                                                                    | Yes         | matches the current RustDesk ID                                             |
| Address books (list, filters)     | `GET /address-books?kind&ownerId&search&sort&page`                                                       | Yes         | owner filter uses a server-searched user picker                             |
| Create / rename / delete book     | `POST /address-books`, `PATCH\|DELETE /address-books/:guid`                                              | Yes         | delete offered for shared books only (personal → 409)                       |
| Book page                         | `GET /address-books/:guid`                                                                               | Yes         |                                                                             |
| Sharing editor                    | `GET\|PUT /address-books/:guid/shares`                                                                   | Yes         | rules 1 read-only, 2 read/write, 3 full control                             |
| Peers                             | `GET\|POST /address-books/:guid/peers`, `PATCH\|DELETE …/peers/:peerId`                                  | Yes         | 409 → field error; password write-only (`""` clears it)                     |
| Peer tag filter                   | `GET …/peers?tag=a&tag=b&tagMode=any\|all`                                                               | Yes         | several tags in the URL (`tag` repeated); "Match" shown from two tags       |
| Tags                              | `GET\|POST …/tags`, `PATCH\|DELETE …/tags/:name`                                                         | Yes         | `peerCount` shown before delete; recolor/rename optimistic                  |
| Users                             | `GET\|POST /users`, `GET\|PATCH\|DELETE /users/:id`, `POST /users/:id/password`                          | Yes         | 409 `LAST_ADMIN` / `SELF_MODIFICATION` shown                                |
| Tokens                            | `GET /users/:id/tokens`, `DELETE /tokens/:id`                                                            | Yes         | newest first; `current` marks your session, revoking it signs you out       |
| Audit log                         | `GET /audit-events?kind&deviceId&sessionId&from&to&sort&page`                                            | Yes         | payload sheet uses the row already loaded (no single-event endpoint needed) |
| About                             | `GET /system/info`                                                                                       | Yes         |                                                                             |

Sessions carry `deviceHostname` (the target's current hostname, shown under its RustDesk ID) and
`connTypeName` (the RustDesk client's connection type; a value the API does not know is shown as
`Unknown (n)`).

---

## Screens

Every data view has skeletons while loading, an empty state ("no data yet" distinct from "no
results for these filters"), an inline error with Retry, and "No access" on 403.

| Route                        | Endpoints                                                   | Key interactions                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`                     | `auth/login`, `auth/me`                                     | API message on 401/403/429 (with `Retry-After`); "Session expired" after a forced sign-out; safe `redirect`                                                        |
| `/` Dashboard                | `stats/summary`, `stats/timeseries`, `stats/top` ×2         | 24 h / 7 d / 30 d / custom range in the URL; hour buckets ≤ 48 h; KPI and top rows link to the filtered history; chart data as a table                             |
| `/sessions/active`           | `sessions/active`, `system/info`, `sessions/:id/disconnect` | auto-refresh (5 s default, selectable, paused while hidden), "Updated n s ago", live elapsed time, "Unknown initiator", "No heartbeat", disconnect with live state |
| `/sessions` (history)        | `sessions`, `sessions/:id`, `sessions/:id/disconnect(s)`    | URL filters (debounced text), server sort and paging, `≈` durations, detail sheet `?session=<id>` with close reason, disconnect, raw events                        |
| `/devices`, `/devices/:uuid` | `devices`, `devices/:uuid`, `sessions?deviceId=`            | search, online filter, copy RustDesk ID, system info JSON, ID changes, recent sessions                                                                             |
| `/address-books`             | `address-books`, `users` (picker)                           | kind / owner / name filters, create shared book, rename, share, delete                                                                                             |
| `/address-books/:guid`       | book, `peers`, `tags`, `shares`                             | tabs in the URL; peer CRUD with tag multi-select and write-only password; tag CRUD with color presets and peer counts; sharing editor                              |
| `/users`, `/users/:id`       | `users`, `users/:id`, `users/:id/tokens`, `tokens/:id`      | create, edit, reset password, delete; no self-delete/demote/disable; token list with revoke                                                                        |
| `/audit`                     | `audit-events`                                              | kind / device / date / session filters, payload sheet (escaped, read-only JSON), link to the session                                                               |
| `/about`                     | `system/info`                                               | server settings and panel version                                                                                                                                  |

Layout: shadcn `Sidebar` (collapsible to icons on desktop, a sheet below `md`), breadcrumbs, UTC
toggle, theme menu (light / dark / system), user menu. Works from 360 px: tables scroll inside
their container, secondary columns hide on small screens, forms open as bottom sheets.

---

## Installation and running

### Docker (whole stack)

```bash
./scripts/init-env.sh        # from the repo root; prints the first administrator's password
docker compose up -d         # web on :8080, api on :21114
```

| Variable (web container)     | Default            | Meaning                                   |
| ---------------------------- | ------------------ | ----------------------------------------- |
| `API_UPSTREAM`               | `http://api:21114` | where nginx proxies `/api/`               |
| `APP_NAME`                   | build value        | name in the sidebar and on the login page |
| `ACTIVE_SESSIONS_REFRESH_MS` | build value (5000) | active-sessions auto-refresh, 1000–300000 |

The API must accept the panel's origin: **`ADMIN_ALLOWED_ORIGINS` has to contain the URL the
browser uses** (`http://localhost:8080` for Docker, `http://localhost:5173` for Vite, the public
URL in production), or every sign-in and mutation fails the CSRF check with 403.

nginx proxies all of `/api/`, so RustDesk clients can use the panel's public URL as their API
server. Requests then reach the API from the nginx container, whose address docker compose fixes
(`WEB_PROXY_IP`) and adds to the API's `TRUSTED_PROXIES`, so client IPs, rate limits and
`DEVICE_ALLOWED_CIDRS` see real addresses. Outside compose, trust exactly the panel's address,
never a whole private range: the API's own port is public and a direct caller could spoof
`X-Forwarded-For`.

### Without Docker (Node.js server, no nginx)

```bash
pnpm install --frozen-lockfile && pnpm build   # repo root; output: apps/web/dist
pnpm --filter @rustdesk-admin/web start        # http://localhost:8080
```

`server.mjs` (Node.js built-ins only) replaces the container's nginx and entrypoint: the same
static serving, SPA fallback, caching, security headers (read from `docker/security-headers.conf`),
`/config.js` generated from `APP_NAME` / `ACTIVE_SESSIONS_REFRESH_MS`, and the `/api/` proxy to
`API_UPSTREAM` (default `http://127.0.0.1:21114`) with `X-Forwarded-For` appended. It listens on
`WEB_HOST:WEB_PORT` (default `0.0.0.0:8080`), reads the repository's `.env`, and loads `dist` once
at startup — restart it after a build. The API on the same host needs `TRUSTED_PROXIES=loopback`.
Starting the API without Docker: [root README](../../README.md#without-docker).

Only same-origin deployment is supported: the session cookie is `SameSite=Strict`, so a panel on
another origin than the API cannot sign in. Keep the API behind the panel's `/api/` proxy (or the
same reverse proxy).

### Local development (Vite + `apps/api`)

```bash
pnpm install                                   # repo root
cp apps/web/.env.example apps/web/.env.local   # optional; defaults work
docker compose up -d db api-migrate api        # or run apps/api with `pnpm dev` (no Docker)
pnpm --filter @rustdesk-admin/web dev          # http://localhost:5173, /api proxied to :21114
```

`ADMIN_COOKIE_SECURE=true` works on `http://localhost` in Chrome and Firefox (localhost is a
secure context). UNVERIFIED: Safari may drop `Secure` cookies on plain-HTTP localhost; use
Chrome/Firefox locally or HTTPS.

| Command (`pnpm --filter @rustdesk-admin/web …`) | Does                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `dev` / `build` / `preview`                     | Vite dev server / type-check + production build / serve `dist` on :4173 |
| `typecheck` / `lint`                            | `tsc` for app and Node configs / ESLint                                 |
| `test` / `test:watch`                           | Vitest (unit + integration)                                             |
| `test:e2e`                                      | Playwright (`npx playwright install chromium` once)                     |

After an API change: `pnpm openapi` at the root regenerates the contract, then `typecheck` shows
what the panel must follow.

---

## Testing

**Unit** (Vitest): time helpers (DST boundaries in `Europe/Berlin`, the UTC toggle, `≈`
durations), ARGB ↔ CSS colors, error mapping and `Retry-After`, runtime configuration, the
redirect sanitizer, URL filter schemas → API queries, query-key factories, dashboard periods and
buckets.

**Integration** (RTL + MSW, handlers typed with the contract types, the real route tree and
providers): login success / invalid credentials / validation / 429 / redirect target / external
redirect rejected; app start with and without a session; 401 mid-session → login (and no redirect
loop); 403 → "No access"; logout clears the cache. Active sessions: polling with fake timers, pause
while hidden and resume, ticking elapsed time without refetches, "Unknown initiator", "No
heartbeat", disconnect requested → delivered → closed and → expired, 409 in the dialog. History:
filters → URL and request params, debounced inputs, shared links, server paging and sorting, `≈`
and `TIMEOUT`, empty states, detail sheet with escaped payload. Address books: peer validation,
409 duplicate → field error, tag assign/remove, write-only password, tag rename/recolor/delete,
409 on tag create, sharing editor. Users: create (no password left in caches), validation,
self-demotion blocked, last-admin 409 in the form and as a toast, token revoke. Dashboard: KPIs and
their links, charts' table view, top lists, period switch, error state.

**End-to-end** (Playwright, `e2e/smoke.spec.ts`): login → dashboard → filter the history → create
a shared book, add and delete a peer → disconnect an active session. By default it runs the built
panel (`vite preview`) with the API mocked in the browser (`page.route`, password `e2e-password`).
Against a real stack:

```bash
E2E_BASE_URL=http://localhost:8080 E2E_USERNAME=admin E2E_PASSWORD=<initial password> \
  pnpm --filter @rustdesk-admin/web test:e2e
```

In that mode only the disconnect step stays mocked (a live RustDesk session cannot be produced on
demand); the book it creates is deleted at the end.

---

## Production checklist

- **HTTPS** at the reverse proxy in front of the web container; nginx keeps an incoming
  `X-Forwarded-Proto`. The API's `ADMIN_COOKIE_SECURE=true` (the cookie is then HTTPS-only),
  `ADMIN_ALLOWED_ORIGINS=https://<panel host>`, `TRUSTED_PROXIES` listing the proxy in front of
  the panel (compose adds the panel itself).
- **Headers** (set by nginx for the panel, not for `/api/`): CSP `default-src 'self'; script-src
'self'` (no inline scripts — runtime config is the `/config.js` file), `style-src 'self'
'unsafe-inline'` (Radix positioning and chart color variables are inline styles),
  `connect-src 'self'`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`, COOP. Adjust `connect-src` only if `VITE_API_BASE_URL` points elsewhere.
- **Caching**: `/assets/*` immutable for a year (hashed names); `index.html`, `config.js` and SPA
  routes `no-cache`, so a deploy is picked up on the next load.
- **Runtime configuration**: `APP_NAME`, `ACTIVE_SESSIONS_REFRESH_MS`, `API_UPSTREAM` per
  environment (without Docker: the same variables for `server.mjs`, plus `WEB_PORT`); nothing secret goes into `VITE_*` or `config.js`.
- **Accessibility**: keyboard-only pass (skip link, sidebar, dialogs, menus, tables), screen reader
  pass on the active-sessions page (toasts and disconnect states are announced), and an axe/Lighthouse
  contrast check in both themes after any theme change.
- **Dependencies**: `pnpm audit --audit-level high` (the web's tree is clean; at the time of writing
  the two remaining high advisories come from `apps/api` → Prisma), Renovate/Dependabot, and re-run
  `shadcn` diff when upgrading it (re-copy `shadcn-tailwind.css`).
- **Contract changes**: after the API changes, `pnpm openapi`, commit the regenerated contract, and
  fix what `pnpm --filter @rustdesk-admin/web typecheck` reports before deploying both together.
- **Health**: the container's healthcheck probes `/healthz`; probe `/api/health/ready` through the
  panel URL as well to catch a broken upstream.
