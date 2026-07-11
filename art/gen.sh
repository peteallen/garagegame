#!/bin/bash
# Generate one sprite via the openrouter-image skill script.
# Usage: gen.sh <name> <prompt> [extra args...]
# Model default lives here (override with IMAGE_MODEL) — see "Models" in README.md.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="$1"; shift
PROMPT="$1"; shift
OUT="$DIR/raw/${NAME}.png"
python3 ~/.claude/skills/openrouter-image/scripts/generate_image.py \
  "$PROMPT" \
  --output "$OUT" \
  -m "${IMAGE_MODEL:-google/gemini-3.1-flash-image-preview}" \
  "$@" > "$DIR/raw/${NAME}.log" 2>&1 \
  && echo "OK ${NAME}" || echo "FAIL ${NAME} (see art/raw/${NAME}.log)"
