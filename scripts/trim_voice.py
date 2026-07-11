#!/usr/bin/env python3
"""Trim leading/trailing silence from the generated voice WAVs (in place)."""
import struct
import sys
from pathlib import Path

VOICE = Path(__file__).resolve().parents[1] / "public/assets/voice"
THRESH = 400  # int16 amplitude considered silence
PAD = 0.06    # seconds kept around the speech


def trim(path: Path):
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[36:40] != b"data":
        print(f"{path.name}: unexpected layout, skip")
        return
    rate = struct.unpack("<I", data[24:28])[0]
    pcm = data[44:]
    n = len(pcm) // 2
    samples = struct.unpack(f"<{n}h", pcm[: n * 2])
    start, end = 0, n
    for i, s in enumerate(samples):
        if abs(s) > THRESH:
            start = i
            break
    for i in range(n - 1, -1, -1):
        if abs(samples[i]) > THRESH:
            end = i + 1
            break
    pad = int(rate * PAD)
    start = max(0, start - pad)
    end = min(n, end + pad)
    if end <= start:
        print(f"{path.name}: all silence?! skip")
        return
    out = pcm[start * 2 : end * 2]
    header = (
        b"RIFF" + struct.pack("<I", 36 + len(out)) + b"WAVE"
        + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
        + b"data" + struct.pack("<I", len(out)) + out
    )
    path.write_bytes(header)
    print(f"{path.name}: {n / rate:.2f}s -> {(end - start) / rate:.2f}s")


for f in sorted(VOICE.glob("*.wav")):
    trim(f)
