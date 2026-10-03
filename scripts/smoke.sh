#!/usr/bin/env bash
# Replays a realistic RustDesk client sequence against a running API server with curl.
#
#   BASE_URL=http://localhost:21114 USERNAME=admin PASSWORD=... ./scripts/smoke.sh
#
# Uses fictional IDs: the logged-in client is 123456789, the controlled device 987654321,
# the initiator 111222333. Needs curl and python3 (for JSON parsing). Writes test data.
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:21114}
USERNAME=${USERNAME:-admin}
PASSWORD=${PASSWORD:?set PASSWORD (e.g. INITIAL_ADMIN_PASSWORD from .env)}
ORIGIN=${ORIGIN:-http://localhost:5173}
DEVICE_UUID=${DEVICE_UUID:-c21va2UtdGVzdC1kZXZpY2U=}
CONN_ID=${CONN_ID:-$((RANDOM % 100000 + 1))}

json() { python3 -c "import sys, json; print(json.load(sys.stdin)$1)"; }
nonce() { python3 -c 'import uuid; print(uuid.uuid4())'; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
# Fails unless the response is HTTP 200 with an empty body (the RustDesk mutation contract).
expect_empty_200() {
  local out code
  out=$(curl -sS -w '\n%{http_code}' "$@")
  code=${out##*$'\n'}
  body=${out%$'\n'*}
  if [[ $code != 200 || -n $body ]]; then echo "expected empty 200, got $code: $body" >&2; exit 1; fi
  echo "200 (empty body)"
}

step "Login (no Content-Type, like the client)"
LOGIN=$(curl -sS -X POST "$BASE_URL/api/login" -H 'Content-Type:' \
  --data-binary "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"id\":\"123456789\",\"uuid\":\"Y2xpZW50LXV1aWQ=\",\"autoLogin\":true,\"type\":\"account\",\"deviceInfo\":{\"os\":\"linux\",\"type\":\"client\",\"name\":\"smoke\"}}")
TOKEN=$(echo "$LOGIN" | json "['access_token']")
echo "$LOGIN" | json "['user']"
AUTH="Authorization: Bearer $TOKEN"

step "Current user"
curl -sS -X POST "$BASE_URL/api/currentUser" -H "$AUTH" --data-binary '{"id":"123456789","uuid":"Y2xpZW50LXV1aWQ="}'; echo

step "Personal address book"
GUID=$(curl -sS -X POST "$BASE_URL/api/ab/personal" -H "$AUTH" | json "['guid']")
echo "guid=$GUID"
curl -sS -X POST "$BASE_URL/api/ab/settings" -H "$AUTH"; echo

step "Add a tag, add a peer"
expect_empty_200 -X POST "$BASE_URL/api/ab/tag/add/$GUID" -H "$AUTH" --data-binary '{"name":"smoke","color":4283215696}'
curl -sS -X DELETE "$BASE_URL/api/ab/peer/$GUID" -H "$AUTH" --data-binary '["987654321"]' >/dev/null
expect_empty_200 -X POST "$BASE_URL/api/ab/peer/add/$GUID" -H "$AUTH" \
  --data-binary '{"id":"987654321","alias":"Front desk","tags":["smoke"],"hash":"","username":"jane","hostname":"desk-01","platform":"Windows","forceAlwaysRelay":"false"}'
curl -sS -X POST "$BASE_URL/api/ab/peers?current=1&pageSize=100&ab=$GUID" -H "$AUTH"; echo
curl -sS -X POST "$BASE_URL/api/ab/tags/$GUID" -H "$AUTH"; echo

step "Controlled device: heartbeat + sysinfo"
curl -sS -X POST "$BASE_URL/api/heartbeat" --data-binary "{\"id\":\"987654321\",\"uuid\":\"$DEVICE_UUID\",\"ver\":1004002,\"modified_at\":0}"; echo
curl -sS -X POST "$BASE_URL/api/sysinfo" --data-binary "{\"id\":\"987654321\",\"uuid\":\"$DEVICE_UUID\",\"version\":\"1.4.2\",\"hostname\":\"desk-01\",\"username\":\"jane\",\"os\":\"Windows 11\"}"; echo
curl -sS -X POST "$BASE_URL/api/sysinfo_ver"; echo

step "Connection audit: new → peer → (heartbeat with conns) → close   [conn_id=$CONN_ID]"
expect_empty_200 -X POST "$BASE_URL/api/audit/conn" --data-binary \
  "{\"action\":\"new\",\"ip\":\"203.0.113.10\",\"id\":\"987654321\",\"uuid\":\"$DEVICE_UUID\",\"conn_id\":$CONN_ID,\"session_id\":0,\"nonce\":\"$(nonce)\"}"
expect_empty_200 -X POST "$BASE_URL/api/audit/conn" --data-binary \
  "{\"peer\":[\"111222333\",\"Alice\"],\"type\":0,\"id\":\"987654321\",\"uuid\":\"$DEVICE_UUID\",\"conn_id\":$CONN_ID,\"session_id\":7357,\"nonce\":\"$(nonce)\"}"
curl -sS -X POST "$BASE_URL/api/heartbeat" --data-binary "{\"id\":\"987654321\",\"uuid\":\"$DEVICE_UUID\",\"ver\":1004002,\"conns\":[$CONN_ID],\"modified_at\":0}"; echo
sleep 2
CLOSE_NONCE=$(nonce)
expect_empty_200 -X POST "$BASE_URL/api/audit/conn" --data-binary \
  "{\"action\":\"close\",\"id\":\"987654321\",\"uuid\":\"$DEVICE_UUID\",\"conn_id\":$CONN_ID,\"session_id\":7357,\"nonce\":\"$CLOSE_NONCE\"}"
echo "retry with the same nonce (no-op):"
expect_empty_200 -X POST "$BASE_URL/api/audit/conn" --data-binary \
  "{\"action\":\"close\",\"id\":\"987654321\",\"uuid\":\"$DEVICE_UUID\",\"conn_id\":$CONN_ID,\"session_id\":7357,\"nonce\":\"$CLOSE_NONCE\"}"

step "Admin API: sign in, latest session, today's stats"
COOKIE=$(curl -sS -i -X POST "$BASE_URL/api/admin/auth/login" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  --data-binary "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" | sed -n 's/^[Ss]et-[Cc]ookie: \(rd_admin_session=[^;]*\).*/\1/p')
[[ -n $COOKIE ]] || { echo "admin login failed (is $USERNAME an ADMIN?)" >&2; exit 1; }
curl -sS "$BASE_URL/api/admin/sessions?deviceId=987654321&pageSize=1" -H "Cookie: $COOKIE" | json "['data'][0]"
FROM=$(date -u +%Y-%m-%dT00:00:00Z)
TO=$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc)+d.timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z"))')
curl -sS "$BASE_URL/api/admin/stats/summary?from=$FROM&to=$TO" -H "Cookie: $COOKIE"; echo

step "Logout"
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/api/logout" -H "$AUTH" --data-binary '{"id":"123456789","uuid":"Y2xpZW50LXV1aWQ="}'
echo; echo "Smoke test passed."
