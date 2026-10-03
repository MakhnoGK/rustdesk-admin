# RustDesk admin — API server

A self-hosted replacement for the **RustDesk API server** (the HTTP API on port `21114` that
RustDesk clients talk to), with an administrative REST API for a separate React admin panel.

It provides client login, personal and shared address books, connection audit turned into
**sessions** (with durations, heartbeat reconciliation, timeouts and remote disconnect), a
device registry, analytics, and a typed OpenAPI contract.

It does **not** replace the ID/rendezvous server (`hbbs`) or the relay (`hbbr`) — keep running
those from the open-source [`rustdesk-server`](https://github.com/rustdesk/rustdesk-server).

```bash
./scripts/init-env.sh        # creates .env with generated secrets and prints the first admin password
docker compose up -d         # db → api-migrate (migrations + seed) → api on :21114
curl http://localhost:21114/api/health/ready
```

Docker is optional: without it the stack is two Node.js 24 processes (API and panel) and your own
PostgreSQL 18 — see [Without Docker](#without-docker).

Contents: [Architecture](#architecture) · [RustDesk compatibility](#rustdesk-compatibility) ·
[API reference](#api-reference) · [Session processing](#session-processing) ·
[Installation](#installation) · [Client configuration](#rustdesk-client-configuration) ·
[Testing](#testing) · [Security](#security) · [Production checklist](#production-checklist)

---

## Architecture

```text
rustdesk-admin/
├── apps/
│   ├── api/                 NestJS API server (this README)
│   └── web/                 admin panel (React + shadcn/ui) — see apps/web/README.md
├── packages/
│   ├── api-contract/        openapi.json emitted by apps/api + generated TS types (committed)
│   ├── tsconfig/            shared tsconfig presets
│   └── eslint-config/       shared ESLint flat config
├── scripts/                 init-env.sh, smoke.sh
├── deploy/systemd/          without Docker: units for the API and the panel server
├── docker-compose.yml       db, api-migrate, api, web
└── turbo.json               api#openapi:emit → api-contract#generate → web#build
```

Stack: Node.js 24 LTS, pnpm workspaces + Turborepo, NestJS 12 (Express), PostgreSQL 18,
Prisma 7 (`pg` driver adapter), class-validator, `@nestjs/swagger`, `@nestjs/jwt`, argon2id,
`@nestjs/config` + Zod, `@nestjs/schedule`, `@nestjs/throttler`, helmet, nestjs-pino,
`@nestjs/terminus`, Jest + Supertest + Testcontainers.

### Modules (`apps/api/src`)

| Module                                                           | Responsibility                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rustdesk/`                                                      | **The only place RustDesk wire formats exist**: controllers, DTOs, mappers (`ab.mapper`, `audit.mapper`, `device.mapper`, `user.mapper`). Each controller documents the payload and the client source file it was verified against. |
| `admin/`                                                         | `/api/admin/*` controllers, admin DTOs, domain → DTO mappers.                                                                                                                                                                       |
| `auth/`                                                          | Password hashing (argon2id), JWT issue/verify with `jti` rows in `auth_tokens`, Bearer guard, cookie guard, Origin (CSRF) guard.                                                                                                    |
| `users/`, `address-books/`, `devices/`, `disconnects/`, `stats/` | Domain services shared by both namespaces.                                                                                                                                                                                          |
| `audit/`                                                         | Append-only ingestion of `/api/audit/*` (idempotent by `nonce`) and audit queries.                                                                                                                                                  |
| `sessions/`                                                      | Pure state machine (`session-state.ts`), the projection applied in the ingestion transaction, heartbeat reconciliation and the timeout sweep.                                                                                       |
| `jobs/`                                                          | Timeout sweep (startup + interval) and audit retention, both behind PostgreSQL advisory locks.                                                                                                                                      |
| `common/`                                                        | Error formats + global filter, body parsing, validation pipes, pagination, throttling, CIDR guard, time helpers, logging.                                                                                                           |
| `openapi/`                                                       | Document builder and `emit.ts` (no database, no port).                                                                                                                                                                              |

### Data flow: RustDesk records → sessions

```text
controlled device ──POST /api/audit/conn──► audit.mapper (lenient decode, raw payload kept)
                                            │
                       ┌────────────────────▼─────────────────────────────┐
                       │ one transaction                                  │
                       │  INSERT audit_events (unique nonce → retry no-op) │
                       │  pg_advisory_xact_lock(uuid:conn_id)              │
                       │  decideConnRecord(...) → SessionOp[] (pure)       │
                       │  apply ops to sessions; link event → session      │
                       └──────────────────────────────────────────────────┘
controlled device ──POST /api/heartbeat───► device upsert → reconcile sessions vs `conns`
                                            → deliver pending disconnects → {disconnect?, sysinfo?}
scheduler ─────────────────────────────────► timeout sweep (UPDATE … RETURNING under advisory lock)
```

### Token model

| Kind              | Issued by                    | Transport                                                                      | Secret                                            | TTL                                                        |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| `RUSTDESK_CLIENT` | `POST /api/login`            | `Authorization: Bearer`                                                        | `RUSTDESK_JWT_SECRET`, audience `RUSTDESK_CLIENT` | `RUSTDESK_TOKEN_TTL_DAYS` (30) — the client cannot refresh |
| `ADMIN_WEB`       | `POST /api/admin/auth/login` | httpOnly, Secure, SameSite=Strict cookie `rd_admin_session`, path `/api/admin` | `ADMIN_JWT_SECRET`, audience `ADMIN_WEB`          | `ADMIN_SESSION_TTL_HOURS` (12)                             |

Every token is a row in `auth_tokens` keyed by its `jti` (user, kind, client `id`/`uuid`,
`deviceInfo`, IP, user agent, issued/expires/last used/revoked). Each request verifies the
signature **and** the row (not revoked, not expired, user active), so administrators can list
and revoke any token. Password reset and disabling a user revoke all their tokens.

---

## RustDesk compatibility

Verified against `rustdesk/rustdesk` master (`e5bc204`, 2026-10-03):
`flutter/lib/models/{user,ab,peer}_model.dart`, `flutter/lib/common/hbbs/hbbs.dart`,
`src/server/connection.rs`, `src/hbbs_http/sync.rs`, `src/common.rs`.

| Endpoint                                                                             | Purpose             | Implemented shape                                                                                                                                                                                          | Status                                    |
| ------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `POST /api/login`                                                                    | Client login        | Body parsed as JSON whatever the Content-Type → `{"type":"access_token","access_token","user":{name,display_name,email,note,avatar,status,is_admin}}`; 401 wrong credentials, 403 disabled, 400 2FA fields | verified                                  |
| `POST /api/currentUser`                                                              | Current user        | Bearer → UserPayload; 401 drops the client's token                                                                                                                                                         | verified                                  |
| `POST /api/logout`                                                                   | Logout              | Revokes the token, 200 empty                                                                                                                                                                               | verified                                  |
| `GET /api/login-options`                                                             | OIDC providers      | `[]`                                                                                                                                                                                                       | verified                                  |
| `POST /api/ab/personal`                                                              | Personal book guid  | `{"guid"}`, created lazily (200 ⇒ client uses the current API)                                                                                                                                             | verified                                  |
| `POST /api/ab/settings`                                                              | Limits              | `{"max_peer_one_ab": AB_MAX_PEERS}`                                                                                                                                                                        | verified                                  |
| `POST /api/ab/shared/profiles`                                                       | Shared books        | `{"total","data":[{guid,name,owner,note,rule,info:{}}]}`                                                                                                                                                   | verified (`info` is opaque to the client) |
| `POST /api/ab/peers?ab=`                                                             | Peers               | `{"total","data":[AbPeer]}`; personal → `hash`, shared → `password`                                                                                                                                        | verified                                  |
| `POST /api/ab/tags/<guid>`                                                           | Tags                | bare `[{"name","color"}]`                                                                                                                                                                                  | verified                                  |
| `POST /api/ab/peer/add/<guid>` · `PUT …/peer/update/<guid>` · `DELETE …/peer/<guid>` | Peer mutations      | 200 **empty body**; unknown peer fields kept verbatim                                                                                                                                                      | verified                                  |
| `POST …/tag/add` · `PUT …/tag/rename` · `PUT …/tag/update` · `DELETE …/tag/<guid>`   | Tag mutations       | 200 empty; rename/delete propagate to peers                                                                                                                                                                | verified                                  |
| `GET/POST /api/ab`                                                                   | Legacy address book | `{"data":"<JSON string>"}` with `tag_colors` as a JSON string; served from the personal book                                                                                                               | verified                                  |
| `POST /api/audit/conn`                                                               | Connection audit    | 200 **empty body**; `new` / `peer` (no `action`) / `close`; dedup by `nonce`                                                                                                                               | verified                                  |
| `POST /api/audit/file`, `/api/audit/alarm`                                           | File/alarm audit    | Stored raw, linked to the session by `(uuid, conn_id)`                                                                                                                                                     | verified                                  |
| `POST /api/heartbeat`                                                                | Liveness            | `{}` · `{"disconnect":[conn_id]}` · `{"sysinfo":1}`; never `strategy`                                                                                                                                      | verified                                  |
| `POST /api/sysinfo`                                                                  | System info         | text `SYSINFO_UPDATED` / `ID_NOT_FOUND`                                                                                                                                                                    | verified                                  |
| `POST /api/sysinfo_ver`                                                              | Sysinfo version     | text: **server-wide** token                                                                                                                                                                                | verified (see below)                      |
| `session_id` on the `new` record is `0`                                              | —                   | not used for matching                                                                                                                                                                                      | verified (default LoginRequest)           |
| Records without `nonce`                                                              | Old clients         | dedup by `sha256(kind, uuid, conn_id, action, payload)` within 5 min                                                                                                                                       | **UNVERIFIED**                            |
| When a conn ID enters/leaves heartbeat `conns` vs `new`/`close`                      | —                   | `conns` = `ALIVE_CONNS` (every connection, incl. unauthenticated, from creation to drop); reconciliation still waits `HEARTBEAT_GRACE_SECONDS`                                                             | partly verified                           |
| API URL derived from the ID server on port 21114                                     | Discovery           | documented                                                                                                                                                                                                 | **UNVERIFIED** details                    |

**Differences found while re-verifying the contract** (the code follows the source):

- `POST /api/sysinfo_ver` is posted with an **empty body**, so the token cannot be per device.
  It is a server-wide token (`server_settings.sysinfo_ver`, generated by the migration); a new
  database yields a new token, which makes clients re-upload. Missing system info for a device
  is requested through the heartbeat (`{"sysinfo": 1}`).
- Audit posts treat success as **2xx with an empty body**; a non-empty 200 (even `{}`) is
  retried. 408/429 and 5xx are retried for ~2 minutes (10 s, 30 s back-off); other 4xx are final.
- `session_id` is a `u64` and exceeds 2^53: RustDesk-facing bodies are parsed with a reviver that
  keeps integers outside the safe range as exact decimal strings.
- Peer `forceAlwaysRelay` and `rdpPort` are **strings** in the client; they are stored verbatim.

### Out of scope (RustDesk Pro)

OIDC (`/api/oidc/*`), 2FA and email verification (`tfa_check`/`email_check`), strategies,
device groups and the "accessible devices" tab (`/api/device-group/accessible`,
`/api/users?accessible`, `/api/peers?accessible`), session recording upload. The client shows an
error or an empty state in the related UI — this is expected.

---

## API reference

The OpenAPI document is the reference: `packages/api-contract/openapi.json`, and Swagger UI at
`/api/docs` (always outside production; in production only with `SWAGGER_ENABLED=true`).
Operation IDs are stable (`AdminUsers_list`, `RustdeskAb_addPeer`, …).

### RustDesk-facing (tag `rustdesk`)

Conventions: body parsed as JSON regardless of Content-Type, empty body = `{}`; errors
`{"error": "<string>"}`; lists `?current&pageSize` → `{"total","data"}`.

| Method | Path                                       | Auth         | Request                            | Success                        | Errors                                          |
| ------ | ------------------------------------------ | ------------ | ---------------------------------- | ------------------------------ | ----------------------------------------------- |
| POST   | `/api/login`                               | —            | LoginRequest                       | 200 LoginResponse              | 400, 401, 403, 429                              |
| POST   | `/api/currentUser`                         | Bearer       | `{id,uuid}`                        | 200 UserPayload                | 401                                             |
| POST   | `/api/logout`                              | Bearer       | `{id,uuid}`                        | 200 empty                      | 401                                             |
| GET    | `/api/login-options`                       | —            | —                                  | 200 `[]`                       |                                                 |
| POST   | `/api/ab/personal`                         | Bearer       | —                                  | 200 `{guid}`                   | 401                                             |
| POST   | `/api/ab/settings`                         | Bearer       | —                                  | 200 `{max_peer_one_ab}`        | 401                                             |
| POST   | `/api/ab/shared/profiles?current&pageSize` | Bearer       | —                                  | 200 `{total,data:[AbProfile]}` | 400, 401                                        |
| POST   | `/api/ab/peers?current&pageSize&ab`        | Bearer       | —                                  | 200 `{total,data:[AbPeer]}`    | 400, 401, 404                                   |
| POST   | `/api/ab/tags/{guid}`                      | Bearer       | —                                  | 200 `[AbTag]`                  | 401, 404                                        |
| POST   | `/api/ab/peer/add/{guid}`                  | Bearer       | AbPeer                             | 200 empty                      | 400, 401, 403 (read-only / limit), 404, 409     |
| PUT    | `/api/ab/peer/update/{guid}`               | Bearer       | `{id, …changed}`                   | 200 empty                      | 400, 401, 403, 404                              |
| DELETE | `/api/ab/peer/{guid}`                      | Bearer       | `["<id>"]`                         | 200 empty                      | 400, 401, 403, 404                              |
| POST   | `/api/ab/tag/add/{guid}`                   | Bearer       | `{name,color}`                     | 200 empty (idempotent)         | 400, 401, 403, 404                              |
| PUT    | `/api/ab/tag/rename/{guid}`                | Bearer       | `{old,new}`                        | 200 empty                      | 401, 403, 404, 409                              |
| PUT    | `/api/ab/tag/update/{guid}`                | Bearer       | `{name,color}`                     | 200 empty                      | 401, 403, 404                                   |
| DELETE | `/api/ab/tag/{guid}`                       | Bearer       | `["<tag>"]`                        | 200 empty                      | 400, 401, 403, 404                              |
| GET    | `/api/ab`                                  | Bearer       | —                                  | 200 `{data}`                   | 401                                             |
| POST   | `/api/ab`                                  | Bearer       | `{data}`                           | 200 empty                      | 400, 401, 403                                   |
| POST   | `/api/audit/conn` · `/file` · `/alarm`     | — (protocol) | record                             | 200 empty                      | 400 (stored as MALFORMED), 403 (CIDR), 413, 429 |
| POST   | `/api/heartbeat`                           | — (protocol) | `{id,uuid,ver,conns?,modified_at}` | 200 `{disconnect?, sysinfo?}`  | 400, 403, 429                                   |
| POST   | `/api/sysinfo`                             | — (protocol) | system info                        | 200 text                       | 403, 429                                        |
| POST   | `/api/sysinfo_ver`                         | — (protocol) | empty                              | 200 text                       | 403, 429                                        |
| GET    | `/api/health/live`, `/api/health/ready`    | —            | —                                  | 200 / 503                      |                                                 |

### Admin (tag `admin`, `/api/admin/*`)

Cookie session, role `ADMIN`, an allowed `Origin` on every POST/PUT/PATCH/DELETE. Lists:
`?page=1&pageSize=50` (max 200) `&sort=field:asc|desc` → `{"data","total","page","pageSize"}`.
Errors: `{"error":{"code","message","details"?}}` — 401, 403 (`FORBIDDEN`, `CSRF_ORIGIN_MISMATCH`),
404, 409 (`ALREADY_EXISTS`, `LAST_ADMIN`, `SELF_MODIFICATION`, `SESSION_NOT_ACTIVE`, `CONFLICT`),
422 (`VALIDATION_FAILED` with `details`, `RANGE_TOO_LARGE`), 429. Timestamps are ISO-8601 UTC;
durations whole seconds. Password hashes, peer `hash` and `password` are never returned
(`hasHash` / `hasPassword` instead).

| Method               | Path                                                                                            | Notes                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| POST                 | `/auth/login`                                                                                   | `{username,password}` → 200 `{user, expiresAt}` + cookie. Admins only.                                                                |
| POST                 | `/auth/logout`                                                                                  | 204; revokes the token, clears the cookie                                                                                             |
| GET                  | `/auth/me`                                                                                      | `{user, expiresAt}`                                                                                                                   |
| GET / POST           | `/users`                                                                                        | filters `search`, `role`, `status`; sort `username, createdAt, updatedAt, role, status` · create → 201                                |
| GET / PATCH / DELETE | `/users/{id}`                                                                                   | PATCH `displayName,email,note,role,status`; no self demote/disable/delete; last active admin protected (409)                          |
| POST                 | `/users/{id}/password`                                                                          | 204; revokes every token of the user                                                                                                  |
| GET                  | `/users/{id}/tokens`                                                                            | token history, newest first; `current` marks the caller's own session                                                                 |
| DELETE               | `/tokens/{id}`                                                                                  | 204, idempotent                                                                                                                       |
| GET                  | `/devices`                                                                                      | `search` (RustDesk ID, hostname, user), `online`; sort `rustdeskId, hostname, lastHeartbeatAt, createdAt`                             |
| GET                  | `/devices/{uuid}`                                                                               | with raw sysinfo (credentials redacted) and RustDesk ID history                                                                       |
| GET / POST           | `/address-books`                                                                                | filters `kind`, `ownerId`, `search` · POST creates a shared book                                                                      |
| GET / PATCH / DELETE | `/address-books/{guid}`                                                                         | DELETE only for shared books                                                                                                          |
| GET / PUT            | `/address-books/{guid}/shares`                                                                  | PUT body `[{userId, rule}]` replaces the list                                                                                         |
| GET / POST           | `/address-books/{guid}/peers`                                                                   | `search`, `tag` (repeatable) + `tagMode=any\|all`, pagination · `password` is write-only, shared books only                           |
| PATCH / DELETE       | `/address-books/{guid}/peers/{peerId}`                                                          |                                                                                                                                       |
| GET / POST           | `/address-books/{guid}/tags`                                                                    | with `peerCount`                                                                                                                      |
| PATCH / DELETE       | `/address-books/{guid}/tags/{name}`                                                             | rename and/or color                                                                                                                   |
| GET                  | `/sessions`                                                                                     | `status, deviceId, initiatorId, from, to, minDurationSeconds, authenticated`; sort `startedAt, closedAt, durationSeconds, lastSeenAt` |
| GET                  | `/sessions/active`                                                                              |                                                                                                                                       |
| GET                  | `/sessions/{id}`                                                                                | with its audit events                                                                                                                 |
| POST / GET           | `/sessions/{id}/disconnect`                                                                     | 201 created / 200 already pending · delivery state `REQUESTED / DELIVERED / EXPIRED`                                                  |
| GET                  | `/sessions/{id}/disconnects`                                                                    | every request of the session, newest first (at most 100)                                                                              |
| GET                  | `/stats/summary`, `/stats/timeseries?bucket=hour\|day`, `/stats/top?by=initiator\|target&limit` | `from`/`to` required, `[from, to)` on `startedAt`, at most `STATS_MAX_RANGE_DAYS`                                                     |
| GET                  | `/audit-events`                                                                                 | `kind=conn\|file\|alarm, deviceId, sessionId, from, to`, `sort=receivedAt:asc\|desc`                                                  |
| GET                  | `/system/info`                                                                                  | version and timing settings                                                                                                           |

Sessions carry `deviceHostname` (the target device's current hostname, joined by machine UUID)
and `connTypeName` (`REMOTE_DESKTOP`, `FILE_TRANSFER`, `PORT_FORWARD`, `VIEW_CAMERA`, `TERMINAL` for
the client's `type` 0–4; `null` when unknown) next to the raw `connType`.

---

## Session processing

A session is the projection of one connection, keyed by `(device uuid, conn_id)` among
**ACTIVE** sessions (a partial unique index guarantees at most one). The **target** is the device
that posts the audit; the **initiator** comes from the `peer` record. Event time is the server's
receipt time, taken once per request.

```text
new ──► ACTIVE ──peer──► ACTIVE (authenticated) ──close──► CLOSED (CLIENT_CLOSE | ADMIN_DISCONNECT)
               │                               ├─heartbeat w/o conn──► CLOSED (HEARTBEAT_RECONCILED)
               │                               └─no liveness > timeout──► TIMEOUT
               └─new with same (uuid, conn_id)──► UNKNOWN (SUPERSEDED)
close without session ──► UNKNOWN
```

`decideConnRecord` (`sessions/session-state.ts`) is a pure function of the record and the
sessions found for its key; `SessionProjectionService` executes the plan inside the ingestion
transaction, after `pg_advisory_xact_lock(hash(uuid:conn_id))` so records of one connection are
serialised across API instances.

| Record  | Situation                                                 | Effect                                                                                        |
| ------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `new`   | no active session                                         | create ACTIVE, `startedAt` = receipt, `initiatorIp` = `ip`                                    |
| `new`   | active session exists (client restart reused the conn ID) | old → UNKNOWN / SUPERSEDED, `closedAt = lastSeenAt ?? now`, estimated; then create            |
| `peer`  | active session                                            | set initiator, `connType`, `authenticated`, `authenticatedAt`                                 |
| `peer`  | no active, a recent (24 h) final unauthenticated session  | enrich it (late `peer` after reconciliation)                                                  |
| `peer`  | nothing                                                   | create ACTIVE authenticated (`new` was lost)                                                  |
| `close` | active session                                            | CLOSED, exact duration; `ADMIN_DISCONNECT` if a disconnect was delivered, else `CLIENT_CLOSE` |
| `close` | no active, a recent final session                         | duplicate / late close: event attached, session unchanged                                     |
| `close` | nothing                                                   | UNKNOWN session, `durationSeconds = null`                                                     |

**Heartbeat reconciliation** — every heartbeat: active sessions of the device whose `conn_id`
is in `conns` get `lastSeenAt = now`; active sessions **absent** from `conns` and older than
`HEARTBEAT_GRACE_SECONDS` become CLOSED / HEARTBEAT_RECONCILED with `closedAt = now`,
`durationEstimated = true`. A later `close` only adds the event to the log.

**Timeout sweep** — every `SESSION_TIMEOUT_CHECK_INTERVAL_SECONDS` and once at startup: one
`UPDATE … RETURNING` turns active sessions with `coalesce(lastSeenAt, startedAt)` older than
`SESSION_TIMEOUT_MINUTES` into TIMEOUT, `closedAt = coalesce(lastSeenAt, startedAt + timeout)`,
estimated. It runs under `pg_try_advisory_xact_lock`, so with several instances one sweeps and
the others skip. A long session that keeps appearing in heartbeats never times out.

**Remote disconnect** — `POST /api/admin/sessions/{id}/disconnect` stores a pending request
(expires after `DISCONNECT_TTL_SECONDS`). The next heartbeat from the device atomically marks it
delivered (`UPDATE … RETURNING`) and answers `{"disconnect":[conn_id]}`, so it is delivered once.
The client closes the connection; the session closes when its `close` record arrives
(`ADMIN_DISCONNECT`) or by reconciliation. **It only works while the device sends heartbeats.**

**Duplicates and ordering**

| Case                                             | Behaviour                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Same record retried (same `nonce`)               | No-op; the unique index also covers concurrent retries                            |
| `new` with a different nonce for an active key   | Conn ID reuse → SUPERSEDED (retries always reuse the nonce)                       |
| Duplicate `close`                                | No-op on the closed session (event attached)                                      |
| `close` / `peer` before `new`                    | See the table above                                                               |
| Client process restart (conn IDs reset)          | SUPERSEDED                                                                        |
| API restart with active sessions                 | State is in PostgreSQL; the sweep runs at startup                                 |
| Several API instances                            | Per-record transactions, unique `nonce`, per-connection advisory lock, sweep lock |
| Records without `nonce` (UNVERIFIED old clients) | Deduplicated by payload hash within 5 minutes                                     |

Durations are whole seconds (`floor`), computed by one helper in TS (`durationSeconds`) and its
SQL twin (`sqlDurationSeconds`).

---

## Installation

### Docker (recommended)

Only Docker is needed.

```bash
./scripts/init-env.sh      # or: cp .env.example .env and fill in the secrets
docker compose up -d
docker compose logs -f api
```

`api-migrate` runs `prisma migrate deploy` and the idempotent seed (first administrator from
`INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`, only when no administrator exists), then
`api` starts on port 21114. Rebuild after an upgrade with `docker compose up -d --build`.

### Without Docker

Two Node.js processes — the API and the admin panel — and nothing else. Requires Node.js 24
(`.nvmrc`), pnpm 12 (`corepack enable` or `npm i -g pnpm@12`), and **PostgreSQL 18** that you run
yourself (an empty database and a user that owns it). The commands run from the repository root,
e.g. `/opt/rustdesk-admin`.

```bash
pnpm install --frozen-lockfile
./scripts/init-env.sh                          # or: cp .env.example .env and fill in the secrets
#   .env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>
#         TRUSTED_PROXIES=loopback             (the panel server proxies /api/ from this host)
#         ADMIN_ALLOWED_ORIGINS=<the panel's URL, e.g. http://admin-host:8080>
pnpm build                                     # API → OpenAPI contract → panel (apps/web/dist)
pnpm --filter @rustdesk-admin/api db:deploy    # prisma migrate deploy
pnpm --filter @rustdesk-admin/api db:seed      # first administrator (idempotent)
pnpm --filter @rustdesk-admin/api start        # API on :21114
pnpm --filter @rustdesk-admin/web start        # panel on :8080, /api/ proxied to the API
```

Both read `.env` from the repository root. The panel server (`apps/web/server.mjs`, no
dependencies) does what nginx does in the container: serves `apps/web/dist` with the SPA fallback,
caching and security headers, writes `/config.js` from the environment, and proxies `/api/` to
`API_UPSTREAM`, so panel and API share one origin (required by the session cookie).

| Variable (panel server)                   | Default                  | Meaning                                           |
| ----------------------------------------- | ------------------------ | ------------------------------------------------- |
| `WEB_HOST` / `WEB_PORT`                   | `0.0.0.0` / `8080`       | where the panel listens                           |
| `API_UPSTREAM`                            | `http://127.0.0.1:21114` | the API (keep it on the same host: `loopback`)    |
| `APP_NAME` / `ACTIVE_SESSIONS_REFRESH_MS` | build-time `VITE_*`      | panel name, active-sessions refresh (1000–300000) |

As services: [`deploy/systemd/`](deploy/systemd) has a unit for each process
(`rustdesk-admin-api`, `rustdesk-admin-web`); adjust paths and user, then
`systemctl enable --now rustdesk-admin-api rustdesk-admin-web`. For HTTPS put any TLS proxy in front
of the panel and add its address to `TRUSTED_PROXIES`.

Upgrade: `git pull`, `pnpm install --frozen-lockfile`, `pnpm build`, `db:deploy`, then restart both
processes (the panel server reads `dist` at startup). The other commands below (`ab:rotate-key`,
`openapi`, tests) work the same way.

### Local development

Requires Node.js 24 (`.nvmrc`) and pnpm 12 (`corepack enable` or `npm i -g pnpm@12`).

```bash
pnpm install
./scripts/init-env.sh                 # then set NODE_ENV=development in .env
docker compose up -d db               # uncomment the db `ports` mapping first;
                                      # or use a local PostgreSQL 18 and set DATABASE_URL in .env
pnpm --filter @rustdesk-admin/api db:deploy   # or db:migrate while changing the schema
pnpm --filter @rustdesk-admin/api db:seed
pnpm dev                              # nest start --watch, pretty logs, Swagger at /api/docs
```

| Command (root)                                              | Does                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | Turborepo across the workspace                                                                                              |
| `pnpm openapi`                                              | builds the API, `api#openapi:emit` → `packages/api-contract/openapi.json`, then `api-contract#generate` → `src/schema.d.ts` |
| `pnpm --filter @rustdesk-admin/api openapi:emit`            | emits the document only (needs a prior build); no database, no port                                                         |
| `pnpm --filter @rustdesk-admin/api ab:rotate-key`           | re-encrypts address-book credentials under the current key                                                                  |

Both generated contract files are committed; CI fails when regenerating changes them.

---

## Admin panel (`apps/web`)

A React + shadcn/ui SPA served by nginx on port **8080** (`docker compose up -d` starts it with the
rest). nginx serves the panel and proxies all of `/api/` to the API, so panel and API share one
origin — required by the `SameSite=Strict` session cookie. Sign in with the seeded administrator.

- `ADMIN_ALLOWED_ORIGINS` must contain the URL the browser uses for the panel
  (`http://localhost:8080` in Docker, `http://localhost:5173` for `pnpm --filter
@rustdesk-admin/web dev`), or sign-in and every mutation fail the CSRF check.
- docker compose pins the web container to `WEB_PROXY_IP` (default `172.31.250.10` in
  `DOCKER_SUBNET`, default `172.31.250.0/24`) and adds that one address to the API's
  `TRUSTED_PROXIES`, so client IPs and rate limits stay per client behind the panel's proxy.
  Never trust a whole range such as `uniquelocal` there: port 21114 is public, and a direct caller
  from a trusted range could spoof `X-Forwarded-For`.
- Runtime settings of the web container: `API_UPSTREAM`, `APP_NAME`, `ACTIVE_SESSIONS_REFRESH_MS`.
- Without Docker, `pnpm --filter @rustdesk-admin/web start` (`apps/web/server.mjs`) serves the
  panel and proxies `/api/` instead of nginx, on the API's host, so `TRUSTED_PROXIES=loopback` is
  the equivalent of the pinned container address.

Architecture, contract matrix, screens, tests and the panel's production checklist:
[`apps/web/README.md`](apps/web/README.md).

---

## RustDesk client configuration

In the client: **Settings → Network → ID/Relay server**.

| Field          | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| ID server      | your `hbbs` host                                             |
| Relay server   | your `hbbr` host (optional)                                  |
| Key            | the public key of your `hbbs`                                |
| **API server** | `https://rustdesk-api.example.com` — this server, behind TLS |

Set the API server explicitly. If it is empty, the client derives it from the ID server host with
port 21114 (`src/common.rs`; details UNVERIFIED), i.e. plain `http://<id-host>:21114`.

Still required from `rustdesk-server`: `hbbs` (IDs, rendezvous, NAT punching) and `hbbr`
(relay). Unavailable features (RustDesk Pro): OIDC login, 2FA/email verification, strategies,
device groups and the accessible-devices tab, session recording upload.

---

## Testing

```bash
pnpm test                                         # unit + integration (Docker, or TEST_DATABASE_URL)
pnpm --filter @rustdesk-admin/api test:unit       # pure logic: state machine, time, errors, mappers, cipher, CIDR, env
pnpm --filter @rustdesk-admin/api test:int        # Testcontainers PostgreSQL 18 + real migrations
TEST_DATABASE_URL=postgresql://…/rustdesk_test pnpm test   # without Docker: an existing PostgreSQL 18
BASE_URL=http://localhost:21114 PASSWORD=... ./scripts/smoke.sh   # realistic client sequence with curl
```

`TEST_DATABASE_URL` must point to a **dedicated, disposable** database: the suites apply the
migrations and `TRUNCATE` every table. Without it, Testcontainers starts PostgreSQL in Docker.

Integration suites: client login (shape, `text/plain`, invalid, disabled, rate limit), tokens
(expired, revoked, logout), address book (guid, pagination, empty-body 200s, tags propagation,
rules, `max_peer_one_ab`, legacy round trip), audit (duration, retried nonce, duplicate close,
out-of-order, SUPERSEDED, malformed), heartbeat (grace, reconciliation, `lastSeenAt`, disconnect
exactly once, sysinfo), timeout sweep (incl. concurrent sweeps), admin (cookie, CSRF, roles,
last admin, secrets never returned, stats against a known dataset, pagination limits).

CI (`.github/workflows/ci.yml`) runs two jobs. `check`: `pnpm audit --audit-level high`,
typecheck, lint, format, tests, build, and the OpenAPI contract diff. `e2e`: Playwright against the
built panel with a mocked API, then `docker compose up --build` (both images) with secrets from
`scripts/init-env.sh`, Playwright against that real stack, and `scripts/smoke.sh` on port 21114.

### curl examples (fictional IDs)

```bash
API=http://localhost:21114
# Login (the client sends no Content-Type)
TOKEN=$(curl -s $API/api/login -H 'Content-Type:' --data-binary \
  '{"username":"admin","password":"…","id":"123456789","uuid":"Y2xpZW50","type":"account","deviceInfo":{"os":"linux"}}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
# Current user
curl -s -X POST $API/api/currentUser -H "Authorization: Bearer $TOKEN" -d '{"id":"123456789","uuid":"Y2xpZW50"}'
# Personal address book
GUID=$(curl -s -X POST $API/api/ab/personal -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["guid"])')
# Add a tag, add a peer (both answer 200 with an empty body)
curl -s -X POST $API/api/ab/tag/add/$GUID -H "Authorization: Bearer $TOKEN" -d '{"name":"office","color":4283215696}'
curl -s -X POST $API/api/ab/peer/add/$GUID -H "Authorization: Bearer $TOKEN" -d '{"id":"987654321","alias":"Front desk","tags":["office"]}'
# Audit sequence posted by the controlled device 987654321 (unauthenticated)
D='"id":"987654321","uuid":"ZGV2aWNl","conn_id":7,"session_id":0'
curl -s $API/api/audit/conn -d "{$D,\"action\":\"new\",\"ip\":\"203.0.113.7\",\"nonce\":\"$(uuidgen)\"}"
curl -s $API/api/audit/conn -d "{$D,\"peer\":[\"111222333\",\"Alice\"],\"type\":0,\"nonce\":\"$(uuidgen)\"}"
curl -s $API/api/heartbeat -d '{"id":"987654321","uuid":"ZGV2aWNl","ver":1004002,"conns":[7],"modified_at":0}'
curl -s $API/api/audit/conn -d "{$D,\"action\":\"close\",\"nonce\":\"$(uuidgen)\"}"
# Session stats (admin cookie; state-changing admin calls also need -H "Origin: <allowed origin>")
COOKIE=$(curl -si $API/api/admin/auth/login -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"…"}' | sed -n 's/^[Ss]et-[Cc]ookie: \(rd_admin_session=[^;]*\).*/\1/p')
curl -s "$API/api/admin/stats/summary?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z" -H "Cookie: $COOKIE"
```

---

## Security

- Passwords: argon2id (19 MiB, t=2); hashes never returned or logged. Login rate-limited per IP
  and per username; failures and successes logged without passwords.
- Separate JWT secrets and audiences per token kind; `jti` revocation checked on every request.
- Admin: httpOnly + Secure + SameSite=Strict cookie, **and** an `Origin` from
  `ADMIN_ALLOWED_ORIGINS` on every state-changing request (login included). CORS is enabled only
  for `/api/admin/*` and only for those origins.
- Address-book `hash`/`password`: AES-256-GCM, envelope `v1:<keyId>:<iv>:<tag>:<ct>`; returned only
  to RustDesk clients with access to the book; never through the admin API.
- Logs: request ID (`X-Request-Id` accepted or generated, echoed); `authorization`, `cookie`,
  `set-cookie`, `password`, `hash`, `access_token` redacted. No stack traces or internal messages in
  responses.
- `X-Forwarded-For` is honoured only from `TRUSTED_PROXIES`.

### Accepted protocol limitation: unauthenticated device endpoints

`/api/audit/*`, `/api/heartbeat`, `/api/sysinfo` and `/api/sysinfo_ver` carry **no
authentication** — that is how the RustDesk client works. Anyone who can reach them can post
fake audit records, fake heartbeats (which can close sessions through reconciliation or pick up
a pending disconnect) and fake system info. Mitigations in place: per-device and per-IP rate
limits, per-endpoint body-size limits, the optional `DEVICE_ALLOWED_CIDRS` allowlist, and the
source IP stored with every audit event. **Restrict these paths at the network level** (VPN,
firewall, or reverse-proxy allowlist of your client networks) wherever possible.

---

## Production checklist

- **TLS**: terminate HTTPS at a reverse proxy (Caddy, nginx, Traefik); point clients' _API server_
  at `https://…`; set `TRUSTED_PROXIES` to the proxy address so `req.ip` and rate limits see real
  client IPs (with docker compose the web container is already trusted; add only your proxy). Do not expose `21114` directly.
- **Secrets**: generate `RUSTDESK_JWT_SECRET`, `ADMIN_JWT_SECRET` (different), `AB_SECRET_KEY`,
  `POSTGRES_PASSWORD`; keep `.env` out of version control (`chmod 600`). Rotating a JWT secret logs
  everyone out. **AB key rotation**: new key in `AB_SECRET_KEY` with a new `AB_SECRET_KEY_ID`, old
  one in `AB_PREVIOUS_SECRET_KEYS=oldId:oldKey`, deploy, run `ab:rotate-key`, then remove the old key.
- **Admin panel**: `ADMIN_ALLOWED_ORIGINS` = the panel's public URL; `ADMIN_COOKIE_SECURE=true`;
  change the seeded administrator's password after first sign-in. Panel-side items (CSP, caching,
  runtime config) are in [`apps/web/README.md`](apps/web/README.md#production-checklist).
- **PostgreSQL**: automated backups (`pg_dump` or WAL archiving/PITR) with tested restores;
  monitor disk growth of `audit_events`.
- **Migrations**: `prisma migrate deploy` only (the `api-migrate` service, or `db:deploy` without
  Docker); never `migrate dev` in production; back up before upgrading.
- **Network**: firewall or proxy allowlist for the device endpoints, or `DEVICE_ALLOWED_CIDRS`.
- **Rate limits**: tune `RATE_LIMIT_*` (counters are per instance; behind a load balancer the
  effective limit is per instance).
- **Monitoring**: probe `/api/health/ready`; ship JSON logs; alert on 5xx, on
  `Session timeout sweep finished` with unusual `timedOut`, and on `Malformed audit record stored`.
- **Retention**: set `AUDIT_RETENTION_DAYS` if audit history must not grow forever (hourly batch
  delete; sessions are kept).
- **Timeouts**: `SESSION_TIMEOUT_MINUTES` bounds how long a session without liveness evidence
  stays active; `HEARTBEAT_GRACE_SECONDS` must exceed the heartbeat interval with live connections
  (~3 s) plus network jitter.
- **Swagger**: leave `SWAGGER_ENABLED=false` unless the docs must be public.
- **Client upgrades**: re-verify the contract (files listed under
  [RustDesk compatibility](#rustdesk-compatibility)) before rolling out a new client version.
