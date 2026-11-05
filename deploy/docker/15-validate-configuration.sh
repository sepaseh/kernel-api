#!/bin/sh
set -eu

fail() {
  printf '%s\n' "Invalid gateway configuration: $1" >&2
  exit 1
}

valid_host() {
  case "$1" in
    ''|*[!a-z0-9.-]*) return 1 ;;
  esac
  [ "${#1}" -le 253 ] &&
    printf '%s\n' "$1" | LC_ALL=C grep -Eq '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
}

for name in API_HOST; do
  eval "value=\${$name:-}"
  valid_host "$value" || fail "$name must be a lowercase bare DNS hostname."
done
case "${RELEASE_ID:-}" in
  replace-release-id|replace-with-immutable-release-id)
    fail "RELEASE_ID must be replaced with an immutable release identifier." ;;
  ''|*[!A-Za-z0-9_.-]*|*..*) fail "RELEASE_ID contains unsafe characters." ;;
esac
printf '%s\n' "$RELEASE_ID" |
  LC_ALL=C grep -Eq '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$' ||
  fail "RELEASE_ID must contain 1 to 128 safe release identifier characters."

case "${HTTPS_PORT:-}" in
  ''|*[!0-9]*) fail "HTTPS_PORT must be a TCP port." ;;
esac
[ "$HTTPS_PORT" -ge 1 ] && [ "$HTTPS_PORT" -le 65535 ] ||
  fail "HTTPS_PORT must be between 1 and 65535."

[ -r /etc/kernel/tls/fullchain.pem ] || fail "Missing mounted fullchain.pem."
[ -r /etc/kernel/tls/privkey.pem ] || fail "Missing mounted privkey.pem."
