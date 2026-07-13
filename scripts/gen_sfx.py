#!/usr/bin/env python3
"""
Generate sound effects via the ElevenLabs sound-generation API.
Saves MP3 files to public/assets/sfx/ (decoded at runtime by WebAudio).

Key lookup order: ELEVENLABS_API_KEY env var, then ~/.codex/.env.
Usage: gen_sfx.py [key ...]     (no args = generate everything in SFX)
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/sfx"
OUT.mkdir(parents=True, exist_ok=True)

# name -> (prompt, seconds). Keep prompts concrete: subject + character + count.
# Horn/engine keys line up with vehicleCatalog.js (horn_*/engine_*).
SFX = {
    # world / interaction
    "pickup_bell": ("One bright old-fashioned brass service counter bell ding, cheerful and clean, short natural decay, no voices, no background noise", 1.2),
    "backup_beeper": ("One single gentle commercial vehicle reverse warning beep, rounded toddler-friendly tone, clean isolated sound, no engine or background noise", 0.8),
    "tow_clunk": ("A tow truck steel hook coupling securely with one satisfying padded clunk and a tiny chain jingle, clean isolated sound, no engine", 1.2),
    "siren_chirp": ("One very short friendly rescue vehicle siren chirp, two rising electronic notes, playful not alarming, clean isolated sound", 1.1),
    "alarm_chirp": ("A cute car alarm lock confirmation, exactly two short electronic chirps, friendly and clean, no siren and no background noise", 1.0),
    "confetti_pop": ("One soft festive party popper pop with fluttering paper confetti falling, gentle and celebratory, clean isolated sound, no voices", 1.5),
    "party_horns": ("A tiny joyful chorus of friendly vehicle horns celebrating together, three short harmonious honks with a cheerful finish, no music or voices", 2.8),
    "car_snore": ("A tiny cartoon car snoring softly, two gentle rounded snores with a little whistling exhale, cute and quiet, no background noise", 2.4),
    # stations
    "wash_brushes": ("Soft rotating automatic car wash brushes swishing rhythmically against a car, wet foam and plush bristles, steady looping texture, no voices", 4.0),
    "water_spray": ("A broad car wash water spray sweeping across a vehicle, bright droplets and gentle splashing, clean isolated sound, no voices", 2.8),
    "air_pump": ("A small garage tire inflator running with a steady friendly compressor hum and soft air hiss, ending with a happy squeak of a tire plumping full, no voices", 3.5),
    "charger_hum": ("A quiet futuristic electric vehicle charger humming steadily with subtle warm electronic pulses, seamless looping texture, no voices", 4.0),
    "charge_plug": ("A chunky electric charging plug clicking into a car socket with one satisfying soft clunk and a tiny electronic confirmation blip, clean isolated sound", 1.2),
    "lift_hydraulics": ("A garage hydraulic car lift rising smoothly, compact electric motor and gentle hydraulic whirr, ending with a soft stop, no voices", 3.2),
    "air_wrench": ("A mechanic air impact wrench tightening one wheel, six quick crisp rattles and a short pneumatic release, clean isolated sound", 1.8),
    # horns — one distinct personality per vehicle type
    "horn_sports": ("One short cheeky high bright horn toot from a tiny sporty car, friendly and clean, no engine or background noise", 1.0),
    "horn_pickup": ("One short warm medium-low horn toot from a friendly pickup truck, rounded and clean, no engine or background noise", 1.0),
    "horn_taxi": ("Two quick upbeat city taxi horn toots, friendly and musical without a melody, clean isolated sound, no traffic", 1.2),
    "horn_police": ("One short crisp friendly police car horn toot, authoritative but playful, clean isolated sound, no siren or engine", 1.0),
    "horn_fire": ("One short deep friendly fire truck air horn toot, powerful but soft-edged and not startling, clean isolated sound", 1.2),
    "horn_icecream": ("One whimsical two-note ice cream truck horn greeting, bright bell-like tones, not a recognizable song, clean isolated sound", 1.4),
    "horn_ev": ("One short soft futuristic electric car greeting chime, bright rounded two-note tone, clean isolated sound, no engine", 1.0),
    "horn_bus": ("One short deep school bus horn toot, warm rounded and child-friendly, clean isolated sound, no engine or traffic", 1.2),
    "horn_tow": ("One short sturdy tow truck horn toot, medium-low friendly tone with a tiny mechanical character, clean isolated sound", 1.1),
    # engines — shared by weight class (see vehicleCatalog.js engine keys)
    "engine_sports": ("A small sporty car engine giving one playful smooth rev up and settling down, polished and friendly, clean isolated sound", 2.8),
    "engine_pickup": ("A friendly pickup truck gasoline engine starting and giving one warm medium-low rev, smooth clean isolated sound", 3.0),
    "engine_small": ("A cheerful tiny four-cylinder car engine starting and idling lightly, soft steady looping texture, clean isolated sound", 3.5),
    "engine_heavy": ("A large bus or fire truck diesel engine starting and idling with a deep gentle rumble, steady looping texture, not harsh", 4.0),
    "engine_ev": ("A small electric vehicle accelerating with a soft rising motor whine and subtle futuristic shimmer, clean isolated sound", 2.8),
}


def api_key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if k:
        return k.strip()
    env = Path.home() / ".codex/.env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("ELEVENLABS_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("no ElevenLabs key (set ELEVENLABS_API_KEY or add it to ~/.codex/.env)")


def gen(key_name, prompt, seconds):
    body = {
        "text": prompt,
        "duration_seconds": seconds,
        "prompt_influence": 0.4,
    }
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/sound-generation",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        audio = res.read()
    out = OUT / f"{key_name}.mp3"
    out.write_bytes(audio)
    print(f"{key_name}: OK ({len(audio) // 1024} KB) — {prompt[:60]!r}")


def main():
    keys = sys.argv[1:] or list(SFX)
    for k in keys:
        try:
            prompt, seconds = SFX[k]
            gen(k, prompt, seconds)
        except Exception as e:
            print(f"{k}: FAIL — {e}")


if __name__ == "__main__":
    main()
