#!/bin/sh
# Writes the public runtime configuration (/config.js) from the environment, then hands over to the
# nginx image's entrypoint (which renders /etc/nginx/templates with API_UPSTREAM).
#   APP_NAME                     shown in the sidebar and on the login page
#   ACTIVE_SESSIONS_REFRESH_MS   auto-refresh of the active sessions (1000-300000)
# Unset or empty values fall back to the build-time VITE_* values. The app validates the result and
# shows a configuration-error screen when it is invalid.
set -eu

CONFIG=/usr/share/nginx/html/config.js

# A JSON string body: escape backslash and quote, drop control characters, keep "<" out of the script.
json_escape() {
  printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'
}

entries=''
add() {
  [ -n "$2" ] || return 0
  entry=$(printf '"%s": "%s"' "$1" "$(json_escape "$2")")
  entries="${entries:+$entries, }$entry"
}
add APP_NAME "${APP_NAME:-}"
add ACTIVE_SESSIONS_REFRESH_MS "${ACTIVE_SESSIONS_REFRESH_MS:-}"

printf '// Generated at container start. Public values only: never put secrets here.\nwindow.__APP_CONFIG__ = {%s};\n' "$entries" > "$CONFIG"

exec /docker-entrypoint.sh "$@"
