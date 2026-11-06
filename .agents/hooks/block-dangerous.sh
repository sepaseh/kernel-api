#!/bin/bash
# Optional heuristic hook for AI tools that pass JSON tool input on stdin.
# The Node guard matches only selected patterns and is not a safety boundary.
# Delegates raw stdin to the canonical Node.js guard and preserves its exit status.

NODE_BIN=$(command -v node 2>/dev/null || true)

if [ -z "$NODE_BIN" ]; then
  echo "Safety hook requires Node.js on PATH; input cannot be inspected." >&2
  exit 2
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd) || exit 2
SCRIPT_PATH="$SCRIPT_DIR/block-dangerous.mjs"

case "$NODE_BIN" in
  *.exe)
    if command -v wslpath >/dev/null 2>&1; then
      SCRIPT_PATH=$(wslpath -w "$SCRIPT_PATH") || exit 2
    fi
    ;;
esac

exec "$NODE_BIN" "$SCRIPT_PATH"
