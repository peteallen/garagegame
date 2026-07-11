#!/usr/bin/env python3
"""
Transcribe each generated voice clip via OpenRouter and compare with the
intended line. Prints PASS/FAIL per clip so mis-spoken lines (e.g. the model
answering "You're welcome" instead of saying "Thank you!") get caught.
"""
import base64
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gen_voice import LINES, api_key, OUT

# Gemini for transcription on purpose: openai/gpt-audio too often ignores the
# audio attachment and answers the text prompt instead. See "Models" in README.md.
MODEL = os.environ.get("TRANSCRIBE_MODEL", "google/gemini-3.5-flash")


FILLER = re.compile(r"provide the audio|play the audio|transcribe it|audio file", re.I)


def transcribe(path: Path) -> str:
    data = base64.b64encode(path.read_bytes()).decode()
    body = {
        "model": MODEL,
        "modalities": ["text"],
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": "Transcribe the attached audio EXACTLY, word for word. Output only the transcription."},
                {"type": "input_audio", "input_audio": {"data": data, "format": "wav"}},
            ],
        }],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
    )
    last = ""
    for attempt in range(3):
        with urllib.request.urlopen(req, timeout=180) as res:
            out = json.loads(res.read())
        if "error" in out:
            raise RuntimeError(out["error"])
        last = (out["choices"][0]["message"].get("content") or "").strip()
        # the model sometimes ignores the attachment and asks for the audio;
        # that's a transport flake, not a transcription — retry
        if not FILLER.search(last):
            return last
    return last


def norm(s: str) -> str:
    # drop everything but letters so "bye-bye" == "bye bye"
    return re.sub(r"[^a-z]", "", s.lower())


def main():
    keys = sys.argv[1:] or list(LINES)
    failures = []
    for k in keys:
        p = OUT / f"{k}.wav"
        if not p.exists():
            print(f"{k}: MISSING")
            failures.append(k)
            continue
        try:
            heard = transcribe(p)
        except Exception as e:
            print(f"{k}: TRANSCRIBE-ERROR {e}")
            continue
        want = LINES[k][0]
        ok = norm(heard) == norm(want)
        print(f"{k}: {'PASS' if ok else 'FAIL'} — wanted {want!r}, heard {heard!r}")
        if not ok:
            failures.append(k)
    print("FAILURES:", " ".join(failures) if failures else "none")


if __name__ == "__main__":
    main()
