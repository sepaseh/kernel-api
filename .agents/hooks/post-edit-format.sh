#!/bin/bash
# Optional post-edit helper: inspect the supplied JSON and lint only the edited file.
# This hook is a local helper and does not replace the project's validation gate.

if [ -z "${INPUT:-}" ] && [ ! -t 0 ]; then
  INPUT=$(cat) || exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Post-edit hook requires Node.js to inspect its input." >&2
  exit 2
fi

FILE_PATH=$(printf '%s' "${INPUT:-}" | node -e '
  try {
    const payload = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const file = payload?.tool_input?.file_path ?? payload?.file_path ?? "";
    if (typeof file !== "string" || /[\0\r\n]/.test(file)) {
      throw new TypeError("file_path must be a single-line string");
    }
    process.stdout.write(file);
  } catch {
    process.stderr.write("Post-edit hook cannot inspect its input.\n");
    process.exitCode = 2;
  }
') || exit 2

[ -n "$FILE_PATH" ] || exit 0
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

PROJECT_ROOT=$(cd -P -- "$(dirname -- "$0")/../.." && pwd -P) || exit 2
case "$FILE_PATH" in
  [[:alpha:]]:\\*)
    if ! command -v cygpath >/dev/null 2>&1; then
      echo "Post-edit hook cannot resolve a Windows path on this host." >&2
      exit 2
    fi
    FILE_PATH=$(cygpath -u -- "$FILE_PATH") || exit 2
    ;;
  [[:alpha:]]:/*) ;;
  [[:alpha:]]:*|\\*|//*)
    echo "Post-edit hook refuses ambiguous or network paths." >&2
    exit 2
    ;;
  /*) ;;
  *) FILE_PATH="$PROJECT_ROOT/$FILE_PATH" ;;
esac
if [ ! -f "$FILE_PATH" ] || [ -L "$FILE_PATH" ]; then
  echo "Post-edit hook expected an existing, non-symlink file." >&2
  exit 2
fi
FILE_DIR=$(cd -P -- "$(dirname -- "$FILE_PATH")" && pwd -P) || exit 2
case "$FILE_DIR/" in
  "$PROJECT_ROOT/"*) ;;
  *) echo "Post-edit hook refuses files outside this repository." >&2; exit 2 ;;
esac
RESOLVED_FILE="$FILE_DIR/$(basename -- "$FILE_PATH")"
cd "$PROJECT_ROOT" || exit 2
if [ ! -x ./node_modules/.bin/eslint ]; then
  echo "Post-edit hook requires the local ESLint executable." >&2
  exit 2
fi
./node_modules/.bin/eslint --fix -- "$RESOLVED_FILE"
