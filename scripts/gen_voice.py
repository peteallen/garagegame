#!/usr/bin/env python3
"""
Generate spoken car voice lines via OpenRouter audio-capable models.
Saves WAV files to public/assets/voice/.

Cars speak in three registers so big and small vehicles sound different:
bright (sports, taxi, ev, icecream), warm (pickup, police) and deep (bus,
fire, tow truck). Shared lines exist once per register with a suffix; the
game maps a vehicle type to its register in Voice.js.

Usage: gen_voice.py [--test] [key ...]
"""
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/voice"
OUT.mkdir(parents=True, exist_ok=True)

# openai/gpt-audio is the audio-output model that actually exists on OpenRouter
# (gpt-4o-audio-preview is NOT a valid OpenRouter model ID and 400s).
# See "Models" in README.md before changing.
MODEL = os.environ.get("VOICE_MODEL", "openai/gpt-audio")

REGISTERS = {
    "bright": {
        "voice": "shimmer",
        "persona": "a tiny happy toy car with a small bright cheerful voice, quick and playful",
    },
    "warm": {
        "voice": "coral",
        "persona": "a friendly toy car with a warm medium voice, kind and upbeat",
    },
    "deep": {
        "voice": "ash",
        "persona": "a big gentle toy truck with a low cozy voice, slow and warm-hearted",
    },
}

# Lines every car can say — one file per register: <key>_<register>.wav
SHARED_LINES = {
    "hello_park": "Hello! Can I park here, please?",
    "nice_spot": "Thank you! What a cozy spot!",
    "thats_me": "That's me! Thank you! Bye-bye!",
    "wash_time": "Time for a wash!",
    "wash_done": "All clean and shiny!",
    "charge_time": "Time to charge up!",
    "charge_done": "All charged up!",
    "air_time": "My tire needs some air!",
    "air_done": "My tires feel great!",
    "lift_time": "Up I go!",
    "lift_done": "That tickles! All checked!",
    "flat_help": "Help! My tire is flat!",
    "battery_help": "Help! My battery is low!",
    "fixed_thanks": "All fixed! Thank you, tow truck!",
}

# One-off lines with a fixed register.
SOLO_LINES = {
    "garage_welcome": ("Welcome to Beep Beep Garage!", "warm"),
    "tow_rescue": ("Tow truck to the rescue!", "deep"),
    "hooray_all_done": ("All done! Beep beep hooray!", "warm"),
    "good_night": ("Good night, little cars!", "warm"),
}

# key -> (text, register). This is what verify_voice.py checks against.
LINES = {}
for _key, _text in SHARED_LINES.items():
    for _register in REGISTERS:
        LINES[f"{_key}_{_register}"] = (_text, _register)
for _key, (_text, _register) in SOLO_LINES.items():
    LINES[_key] = (_text, _register)


def api_key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k:
        return k.strip()
    p = Path.home() / ".config/openrouter/key"
    if p.exists():
        return p.read_text().strip()
    raise SystemExit("no OpenRouter key")


def wav_wrap(pcm: bytes, rate=24000, channels=1, sampwidth=2) -> bytes:
    import struct
    byte_rate = rate * channels * sampwidth
    block_align = channels * sampwidth
    return (
        b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVE"
        + b"fmt " + struct.pack("<IHHIIHH", 16, 1, channels, rate, byte_rate, block_align, sampwidth * 8)
        + b"data" + struct.pack("<I", len(pcm)) + pcm
    )


def gen(key, text, register):
    # OpenRouter requires streaming for audio output; PCM16 chunks arrive as
    # base64 deltas which we concatenate and wrap in a WAV header.
    spec = REGISTERS[register]
    body = {
        "model": MODEL,
        "modalities": ["text", "audio"],
        "audio": {"voice": spec["voice"], "format": "pcm16"},
        "stream": True,
        "messages": [
            {
                "role": "system",
                "content": "You are a text-to-speech engine, NOT an assistant. You never converse, "
                           "never acknowledge, never respond, never add words like 'Understood' or "
                           "'You're welcome'. You receive a script line between « » and speak ONLY "
                           f"that line aloud, verbatim. Character voice: {spec['persona']}. "
                           "This is dialogue for a toddler's video game.",
            },
            {"role": "user", "content": f"«{text}»"},
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
        },
    )
    pcm = bytearray()
    with urllib.request.urlopen(req, timeout=180) as res:
        for raw in res:
            line = raw.decode("utf-8", "ignore").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if "error" in chunk:
                raise RuntimeError(chunk["error"])
            for ch in chunk.get("choices", []):
                audio = (ch.get("delta") or {}).get("audio") or {}
                data = audio.get("data")
                if data:
                    pcm.extend(base64.b64decode(data))
    if not pcm:
        raise RuntimeError("stream contained no audio deltas")
    out = OUT / f"{key}.wav"
    out.write_bytes(wav_wrap(bytes(pcm)))
    print(f"{key}: OK ({len(pcm) // 1024} KB pcm) — {text!r} [{register}]")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    keys = args or list(LINES)
    if "--test" in sys.argv:
        keys = keys[:1]
    for k in keys:
        try:
            text, register = LINES[k]
            gen(k, text, register)
        except Exception as e:
            print(f"{k}: FAIL — {e}")


if __name__ == "__main__":
    main()
