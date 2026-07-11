#!/usr/bin/env python3
"""
Process raw generated art into game-ready sprites.

Two sprite classes live here:

- VEHICLES — strict top-down toy vehicles, generated nose-right on a chroma
  screen. After keying and trimming, the painted body is scaled (allowing a
  slight non-uniform correction) to exactly `length x width` world units and
  centered on a canvas that adds OVERHANG world units of transparent margin on
  every side so feathered edges never clip. The game then draws the sprite at
  (-length/2 - OVERHANG, -width/2 - OVERHANG) with size
  (length + 2*OVERHANG, width + 2*OVERHANG), which makes the painted body and
  the collision footprint coincide exactly at any heading. The length/width
  numbers MUST mirror src/game/entities/vehicleCatalog.js — check:assets
  verifies the output pixel sizes against the catalog.

- SPRITES — environment art at fixed orientations. Keyed (or kept opaque),
  trimmed, padded to the aspect the game draws them at, robotgame-style.

Chroma keying floods ALL candidate pixels (not just edge-connected ones) so
enclosed holes key out too. Vehicles that are themselves green/teal are
generated on magenta instead of green; red/orange vehicles on green.

Usage: process_art.py [name ...]     (no args = everything present in art/raw)
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "art/raw"
OUT = ROOT / "public/assets/sprites"
OUT.mkdir(parents=True, exist_ok=True)

# World units -> sprite pixels. 2px per unit keeps the biggest vehicle sprite
# under 500px wide while staying crisp on retina at in-game scale.
PX_PER_UNIT = 2
# Transparent world-unit margin around the registered body for soft edges.
# Game code must draw vehicle sprites with this same overhang (Vehicle.js).
OVERHANG = 6

# name -> (length, width, key color, rotate degrees CCW applied before keying)
# length/width mirror vehicleCatalog.js. All vehicles are generated nose-right;
# rotate fixes strays without touching game code.
VEHICLES = {
    "vehicle_sports": (156, 80, "green", 0),
    "vehicle_pickup": (174, 90, "magenta", 0),
    "vehicle_taxi": (164, 85, "green", 0),
    "vehicle_police": (166, 100, "green", 0),
    "vehicle_fire": (196, 95, "green", 0),
    "vehicle_icecream": (184, 102, "magenta", 0),
    "vehicle_ev": (146, 81, "magenta", 0),
    "vehicle_bus": (226, 114, "green", 0),
    "vehicle_tow": (190, 89, "green", 0),
}

# name -> (aspect w/h or None to keep trim aspect, max long side, key color)
SPRITES = {
    "title_logo": (None, 1100, "green"),
    "pet_sit": (None, 320, "green"),
    "pet_walk": (None, 320, "green"),
    "pet_sleep": (None, 320, "green"),
}

# Static UI portraits (3/4 beauty shots for the pickup photo bubble). Trimmed
# and padded to square so the bubble can draw any of them identically.
PORTRAITS = {f"portrait_{k.removeprefix('vehicle_')}": ("magenta",) for k in VEHICLES}


def is_key(r, g, b, key):
    if key == "green":
        return g > 125 and g - max(r, b) > 48 and r < 205 and b < 205
    # magenta
    return r > 125 and b > 105 and g < 155 and (r - g) > 45 and (b - g) > 35


def key_image(img: Image.Image, key: str) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    px = img.load()

    bg = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = px[x, y]
            if is_key(r, g, b, key):
                bg[row + x] = 1

    out = Image.new("RGBA", (w, h))
    opx = out.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = px[x, y]
            if bg[row + x]:
                opx[x, y] = (0, 0, 0, 0)
            else:
                edge = False
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and bg[ny * w + nx]:
                        edge = True
                        break
                if edge:
                    if key == "green":
                        g = min(g, max(r, b) + 12)
                    else:
                        r = min(r, g + 30)
                        b = min(b, g + 30)
                    opx[x, y] = (r, g, b, 165)
                else:
                    opx[x, y] = (r, g, b, 255)
    return out


def register_vehicle(img: Image.Image, length: int, width: int) -> Image.Image:
    """Scale the trimmed body to the collision footprint and center it on the
    overhang canvas. Returns the exact-size sprite the game will draw."""
    bbox = img.getbbox()
    if not bbox:
        raise ValueError("keyed image is empty")
    body = img.crop(bbox)
    target_w = length * PX_PER_UNIT
    target_h = width * PX_PER_UNIT
    body = body.resize((target_w, target_h), Image.LANCZOS)
    canvas_w = (length + 2 * OVERHANG) * PX_PER_UNIT
    canvas_h = (width + 2 * OVERHANG) * PX_PER_UNIT
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    canvas.paste(body, (OVERHANG * PX_PER_UNIT, OVERHANG * PX_PER_UNIT), body)
    return canvas


def trim_pad(img: Image.Image, aspect, max_side: int, pad_frac=0.03) -> Image.Image:
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    pad = int(max(w, h) * pad_frac)
    w2, h2 = w + pad * 2, h + pad * 2
    if aspect:
        if w2 / h2 < aspect:
            w2 = int(h2 * aspect)
        else:
            h2 = int(w2 / aspect)
    canvas = Image.new("RGBA", (w2, h2), (0, 0, 0, 0))
    canvas.paste(img, ((w2 - img.width) // 2, (h2 - img.height) // 2))
    if max(w2, h2) > max_side:
        scale = max_side / max(w2, h2)
        canvas = canvas.resize((max(1, int(w2 * scale)), max(1, int(h2 * scale))), Image.LANCZOS)
    return canvas


def process(name: str) -> bool:
    src = RAW / f"{name}.png"
    if not src.exists():
        print(f"{name}: missing raw render, skip")
        return False
    img = Image.open(src)
    if name in VEHICLES:
        length, width, key, rotate = VEHICLES[name]
        if rotate:
            img = img.rotate(rotate, expand=True)
        final = register_vehicle(key_image(img, key), length, width)
    elif name in SPRITES:
        aspect, max_side, key = SPRITES[name]
        final = trim_pad(key_image(img, key), aspect, max_side)
    elif name in PORTRAITS:
        (key,) = PORTRAITS[name]
        final = trim_pad(key_image(img, key), 1.0, 512)
    else:
        print(f"{name}: not in any registry, skip")
        return False
    final.save(OUT / f"{name}.png", optimize=True)
    print(f"{name}: OK {final.size}")
    return True


def main():
    names = sys.argv[1:]
    if not names:
        names = [p.stem for p in sorted(RAW.glob("*.png"))
                 if p.stem in VEHICLES or p.stem in SPRITES or p.stem in PORTRAITS]
    for name in names:
        process(name)


if __name__ == "__main__":
    main()
