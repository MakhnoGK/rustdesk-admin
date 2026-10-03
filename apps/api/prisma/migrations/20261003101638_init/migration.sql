-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('RUSTDESK_CLIENT', 'ADMIN_WEB');

-- CreateEnum
CREATE TYPE "AddressBookKind" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "AuditKind" AS ENUM ('CONN', 'FILE', 'ALARM');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'TIMEOUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SessionCloseReason" AS ENUM ('CLIENT_CLOSE', 'HEARTBEAT_RECONCILED', 'SUPERSEDED', 'TIMEOUT', 'ADMIN_DISCONNECT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "note" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "TokenKind" NOT NULL,
    "client_id" TEXT,
    "client_uuid" TEXT,
    "device_info" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "uuid" TEXT NOT NULL,
    "rustdesk_id" TEXT NOT NULL,
    "hostname" TEXT,
    "username" TEXT,
    "os" TEXT,
    "version" TEXT,
    "heartbeat_version" BIGINT,
    "sysinfo" JSONB,
    "sysinfo_updated_at" TIMESTAMPTZ(3),
    "last_heartbeat_at" TIMESTAMPTZ(3),
    "last_ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_id_changes" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "old_rustdesk_id" TEXT NOT NULL,
    "new_rustdesk_id" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_id_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_books" (
    "guid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID,
    "kind" "AddressBookKind" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "address_books_pkey" PRIMARY KEY ("guid")
);

-- CreateTable
CREATE TABLE "address_book_shares" (
    "book_guid" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rule" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_book_shares_pkey" PRIMARY KEY ("book_guid","user_id")
);

-- CreateTable
CREATE TABLE "ab_peers" (
    "id" UUID NOT NULL,
    "book_guid" UUID NOT NULL,
    "peer_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "hostname" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "hash_enc" TEXT,
    "password_enc" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ab_peers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_tags" (
    "id" UUID NOT NULL,
    "book_guid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_peer_tags" (
    "peer_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "ab_peer_tags_pkey" PRIMARY KEY ("peer_id","tag_id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "kind" "AuditKind" NOT NULL,
    "device_id" TEXT,
    "device_uuid" TEXT,
    "conn_id" INTEGER,
    "rustdesk_session_id" TEXT,
    "action" TEXT,
    "source_ip" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "nonce" TEXT,
    "dedup_hash" TEXT,
    "malformed" BOOLEAN NOT NULL DEFAULT false,
    "session_id" UUID,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "device_uuid" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "conn_id" INTEGER NOT NULL,
    "rustdesk_session_id" TEXT,
    "initiator_id" TEXT,
    "initiator_name" TEXT,
    "initiator_ip" TEXT,
    "conn_type" INTEGER,
    "authenticated" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "authenticated_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "duration_seconds" INTEGER,
    "duration_estimated" BOOLEAN NOT NULL DEFAULT false,
    "status" "SessionStatus" NOT NULL,
    "close_reason" "SessionCloseReason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_disconnects" (
    "id" UUID NOT NULL,
    "device_uuid" TEXT NOT NULL,
    "conn_id" INTEGER NOT NULL,
    "session_id" UUID NOT NULL,
    "requested_by_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pending_disconnects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_issued_at_idx" ON "auth_tokens"("user_id", "issued_at" DESC);

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_uuid_key" ON "devices"("uuid");

-- CreateIndex
CREATE INDEX "devices_rustdesk_id_idx" ON "devices"("rustdesk_id");

-- CreateIndex
CREATE INDEX "devices_hostname_idx" ON "devices"("hostname");

-- CreateIndex
CREATE INDEX "devices_last_heartbeat_at_idx" ON "devices"("last_heartbeat_at" DESC);

-- CreateIndex
CREATE INDEX "device_id_changes_device_id_changed_at_idx" ON "device_id_changes"("device_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "address_books_owner_id_idx" ON "address_books"("owner_id");

-- CreateIndex
CREATE INDEX "address_books_kind_name_idx" ON "address_books"("kind", "name");

-- CreateIndex
CREATE INDEX "address_book_shares_user_id_idx" ON "address_book_shares"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ab_peers_book_guid_peer_id_key" ON "ab_peers"("book_guid", "peer_id");

-- CreateIndex
CREATE UNIQUE INDEX "ab_tags_book_guid_name_key" ON "ab_tags"("book_guid", "name");

-- CreateIndex
CREATE INDEX "ab_peer_tags_tag_id_idx" ON "ab_peer_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_nonce_key" ON "audit_events"("nonce");

-- CreateIndex
CREATE INDEX "audit_events_kind_received_at_idx" ON "audit_events"("kind", "received_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_device_id_received_at_idx" ON "audit_events"("device_id", "received_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_device_uuid_conn_id_idx" ON "audit_events"("device_uuid", "conn_id");

-- CreateIndex
CREATE INDEX "audit_events_session_id_idx" ON "audit_events"("session_id");

-- CreateIndex
CREATE INDEX "audit_events_received_at_idx" ON "audit_events"("received_at");

-- CreateIndex
CREATE INDEX "audit_events_dedup_hash_received_at_idx" ON "audit_events"("dedup_hash", "received_at");

-- CreateIndex
CREATE INDEX "sessions_device_id_started_at_idx" ON "sessions"("device_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "sessions_initiator_id_started_at_idx" ON "sessions"("initiator_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "sessions_started_at_idx" ON "sessions"("started_at");

-- CreateIndex
CREATE INDEX "sessions_status_started_at_idx" ON "sessions"("status", "started_at");

-- CreateIndex
CREATE INDEX "sessions_device_uuid_conn_id_started_at_idx" ON "sessions"("device_uuid", "conn_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "pending_disconnects_device_uuid_expires_at_idx" ON "pending_disconnects"("device_uuid", "expires_at");

-- CreateIndex
CREATE INDEX "pending_disconnects_session_id_requested_at_idx" ON "pending_disconnects"("session_id", "requested_at" DESC);

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_id_changes" ADD CONSTRAINT "device_id_changes_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_books" ADD CONSTRAINT "address_books_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_book_shares" ADD CONSTRAINT "address_book_shares_book_guid_fkey" FOREIGN KEY ("book_guid") REFERENCES "address_books"("guid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_book_shares" ADD CONSTRAINT "address_book_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_peers" ADD CONSTRAINT "ab_peers_book_guid_fkey" FOREIGN KEY ("book_guid") REFERENCES "address_books"("guid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_tags" ADD CONSTRAINT "ab_tags_book_guid_fkey" FOREIGN KEY ("book_guid") REFERENCES "address_books"("guid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_peer_tags" ADD CONSTRAINT "ab_peer_tags_peer_id_fkey" FOREIGN KEY ("peer_id") REFERENCES "ab_peers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_peer_tags" ADD CONSTRAINT "ab_peer_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "ab_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_disconnects" ADD CONSTRAINT "pending_disconnects_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_disconnects" ADD CONSTRAINT "pending_disconnects_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written: constraints and indexes Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------

-- One personal address book per user.
CREATE UNIQUE INDEX "address_books_personal_owner_key"
  ON "address_books" ("owner_id") WHERE "kind" = 'PERSONAL';

-- Share rule: 1 read-only, 2 read/write, 3 full control.
ALTER TABLE "address_book_shares"
  ADD CONSTRAINT "address_book_shares_rule_check" CHECK ("rule" BETWEEN 1 AND 3);

-- Tag colors are unsigned 32-bit ARGB values.
ALTER TABLE "ab_tags"
  ADD CONSTRAINT "ab_tags_color_check" CHECK ("color" BETWEEN 0 AND 4294967295);

-- Active sessions: the timeout sweep and the heartbeat reconciliation only touch these rows.
CREATE INDEX "sessions_active_idx"
  ON "sessions" ("device_uuid", "started_at") WHERE "status" = 'ACTIVE';

-- At most one ACTIVE session per (device_uuid, conn_id): the key audit records are matched by.
CREATE UNIQUE INDEX "sessions_active_conn_key"
  ON "sessions" ("device_uuid", "conn_id") WHERE "status" = 'ACTIVE';

-- Undelivered disconnects looked up on every heartbeat.
CREATE INDEX "pending_disconnects_undelivered_idx"
  ON "pending_disconnects" ("device_uuid") WHERE "delivered_at" IS NULL;

-- Server-wide sysinfo version token (answered by POST /api/sysinfo_ver). A new database gets a
-- new token, which makes clients that cache it re-upload their system info.
INSERT INTO "server_settings" ("key", "value", "updated_at")
VALUES ('sysinfo_ver', gen_random_uuid()::text, now());
