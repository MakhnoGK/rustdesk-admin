#!/usr/bin/env sh
# Creates .env from .env.example with freshly generated secrets. Never overwrites an existing .env.
# Needs openssl, or Docker as a fallback (so a machine with only Docker works).
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists; leaving it untouched." >&2
  exit 1
fi

rand() { # rand <bytes>
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1"
  else
    docker run --rm node:24-alpine node -e "process.stdout.write(require('crypto').randomBytes($1).toString('base64'))"
  fi
}
# URL-safe password for the database URL.
pw() { rand 24 | tr -d '/+=\n' | cut -c1-28; }

admin_password=$(pw)
sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(pw)|" \
  -e "s|^RUSTDESK_JWT_SECRET=.*|RUSTDESK_JWT_SECRET=$(rand 48 | tr -d '\n')|" \
  -e "s|^ADMIN_JWT_SECRET=.*|ADMIN_JWT_SECRET=$(rand 48 | tr -d '\n')|" \
  -e "s|^AB_SECRET_KEY=.*|AB_SECRET_KEY=$(rand 32 | tr -d '\n')|" \
  -e "s|^INITIAL_ADMIN_PASSWORD=.*|INITIAL_ADMIN_PASSWORD=${admin_password}|" \
  .env.example > .env
# Keep the local-development URL consistent with the generated database password.
db_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
sed -i.bak "s|^DATABASE_URL=postgresql://rustdesk:[^@]*@|DATABASE_URL=postgresql://rustdesk:${db_password}@|" .env && rm -f .env.bak
chmod 600 .env

echo "Created .env with generated secrets."
echo "First administrator: $(sed -n 's/^INITIAL_ADMIN_USERNAME=//p' .env) / ${admin_password}"
echo "Change ADMIN_ALLOWED_ORIGINS to the admin panel's public URL before production use."
