#!/usr/bin/env bash
# Claude Code PostToolUse hook — auto-formats and lint-fixes frontend files that
# Claude writes or edits, so its output matches the project's ESLint + Prettier
# config. Best-effort and non-blocking: the enforced gates are the pre-commit
# hook and CI. Backend Kotlin is covered by detekt, not this hook.

file="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)"
[ -n "$file" ] && [ -f "$file" ] || exit 0

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
case "$file" in
  "$repo_root"/frontend/*) ;;
  *) exit 0 ;;
esac

cd "$repo_root/frontend" || exit 0

case "$file" in
  *.js | *.mjs | *.ts | *.vue)
    pnpm exec prettier --write --log-level warn "$file" 2>/dev/null
    pnpm exec eslint --fix "$file" 2>/dev/null
    ;;
  *.json | *.css | *.md | *.yml | *.yaml)
    pnpm exec prettier --write --log-level warn "$file" 2>/dev/null
    ;;
esac
exit 0
