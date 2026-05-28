#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): auto-format the edited file so code stays
# clean and consistent. Silent and non-blocking — no-ops when the relevant
# formatter is not locally installed. Never triggers a network install.
#
# Reads the hook JSON on stdin; dispatches by file extension.

payload="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

f="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)"
[ -n "$f" ] && [ -f "$f" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"

case "$f" in
  *.rs)
    command -v rustfmt >/dev/null 2>&1 && rustfmt --edition 2021 "$f" >/dev/null 2>&1
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.scss|*.html|*.md)
    if [ -x "$root/node_modules/.bin/prettier" ]; then
      "$root/node_modules/.bin/prettier" --write --ignore-unknown "$f" >/dev/null 2>&1
    fi
    case "$f" in
      *.ts|*.tsx|*.js|*.jsx)
        if [ -x "$root/node_modules/.bin/eslint" ]; then
          "$root/node_modules/.bin/eslint" --fix "$f" >/dev/null 2>&1
        fi
        ;;
    esac
    ;;
esac

exit 0
