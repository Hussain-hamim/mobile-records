"""Generate our original, offline two-note enrollment success chime."""

import math
from pathlib import Path
import struct
import wave

sample_rate = 44100
duration = 0.72
notes = [(0.0, 659.25, 0.34), (0.18, 987.77, 0.50)]
output = Path(__file__).resolve().parents[1] / "assets/sounds/enrollment-success.wav"
output.parent.mkdir(parents=True, exist_ok=True)
frames = bytearray()
for i in range(round(sample_rate * duration)):
    sample = 0.0
    for start, frequency, length in notes:
        t = i / sample_rate - start
        if 0 <= t < length:
            attack = min(1.0, t / 0.012)
            release = min(1.0, (length - t) / 0.06)
            envelope = attack * release * math.exp(-5 * t)
            tone = math.sin(2 * math.pi * frequency * t)
            tone += 0.12 * math.sin(4 * math.pi * frequency * t)
            sample += 0.28 * envelope * tone
    frames.extend(struct.pack("<h", round(max(-1, min(1, sample)) * 32767)))

with wave.open(str(output), "wb") as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(sample_rate)
    audio.writeframes(frames)
