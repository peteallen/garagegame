#!/usr/bin/env python3
"""
Image editing via OpenRouter (nano banana): input image + instruction -> image.
Usage: edit_image.py <input.png> <output.png> "<instruction>"
"""
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

# Same model as generation (art/gen.sh) so edits match the originals' style.
# See "Models" in README.md before changing.
MODEL = os.environ.get("EDIT_MODEL", "google/gemini-3.1-flash-image-preview")


def api_key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k:
        return k.strip()
    p = Path.home() / ".config/openrouter/key"
    if p.exists():
        return p.read_text().strip()
    raise SystemExit("no OpenRouter key")


def main():
    src, dst, prompt = sys.argv[1], sys.argv[2], sys.argv[3]
    data = base64.b64encode(Path(src).read_bytes()).decode()
    body = {
        "model": MODEL,
        "modalities": ["image", "text"],
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}},
            ],
        }],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        out = json.loads(res.read())
    if "error" in out:
        raise SystemExit(f"error: {out['error']}")
    msg = out["choices"][0]["message"]
    url = None
    for img in msg.get("images") or []:
        u = (img.get("image_url") or {}).get("url", "")
        if u.startswith("data:image"):
            url = u
            break
    if not url:
        raise SystemExit(f"no image in response; keys={list(msg.keys())} text={str(msg.get('content'))[:200]}")
    b64 = url.split(",", 1)[1]
    Path(dst).write_bytes(base64.b64decode(b64))
    print(f"OK {dst} ({len(b64) // 1024} KB b64)")


if __name__ == "__main__":
    main()
