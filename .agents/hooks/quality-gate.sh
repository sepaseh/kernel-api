#!/bin/bash
# Optional fast check for local JS/TS changes; this is not the full PR gate.

HOOK_ROOT=$(cd -P -- "$(dirname -- "$0")/../.." && pwd -P) || exit 2
PROJECT_DIR=${AI_PROJECT_DIR:-$HOOK_ROOT}
if ! cd -P -- "$PROJECT_DIR"; then
  echo "Quality hook cannot enter the project directory." >&2
  exit 2
fi
if [ "$(pwd -P)" != "$HOOK_ROOT" ]; then
  echo "Quality hook refuses a different project directory." >&2
  exit 2
fi
GIT_ROOT=$(git rev-parse --show-toplevel) || {
  echo "Quality hook cannot identify the Git repository." >&2
  exit 2
}
GIT_ROOT=$(cd -P -- "$GIT_ROOT" && pwd -P) || exit 2
if [ "$GIT_ROOT" != "$HOOK_ROOT" ]; then
  echo "Quality hook requires this repository's root." >&2
  exit 2
fi

PATHS_FILE=$(mktemp) || {
  echo "Quality hook cannot create a temporary path list." >&2
  exit 2
}
trap 'rm -f -- "$PATHS_FILE"' EXIT
git diff --name-only -z --diff-filter=ACMRTD HEAD > "$PATHS_FILE" || {
  echo "Quality hook cannot inspect tracked changes." >&2
  exit 2
}
HAS_SOURCE_CHANGE=false
while IFS= read -r -d '' FILE_PATH; do
  case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) HAS_SOURCE_CHANGE=true ;;
  esac
done < "$PATHS_FILE"
git ls-files --others --exclude-standard -z > "$PATHS_FILE" || {
  echo "Quality hook cannot inspect untracked changes." >&2
  exit 2
}
while IFS= read -r -d '' FILE_PATH; do
  case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) HAS_SOURCE_CHANGE=true ;;
  esac
done < "$PATHS_FILE"
if [ "$HAS_SOURCE_CHANGE" != true ]; then
  exit 0
fi

npm run lint || exit 2
npm run typecheck || exit 2
