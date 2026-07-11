#!/bin/bash
# Verify all voice clips by transcription; regenerate + trim failures; repeat.
# Models come from the scripts' defaults (see "Models" in README.md).
cd "$(dirname "$0")/.."
for round in 1 2 3; do
  echo "=== VERIFY ROUND $round ==="
  OUT=$(python3 scripts/verify_voice.py 2>&1)
  echo "$OUT"
  FAILS=$(echo "$OUT" | sed -n 's/^FAILURES: //p')
  if [ "$FAILS" = "none" ] || [ -z "$FAILS" ]; then
    echo "ALL CLIPS VERIFIED"
    exit 0
  fi
  echo "=== REGENERATING: $FAILS ==="
  python3 scripts/gen_voice.py $FAILS
  python3 scripts/trim_voice.py > /dev/null
done
echo "=== FINAL VERIFY ==="
python3 scripts/verify_voice.py 2>&1 | tail -3
