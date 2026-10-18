#!/usr/bin/env python3
"""Generate the Abu Raghwa PWA icon family from one square source image.

Customization:
- Replace design/abu-raghwa-icon-source.png with another square source.
- Adjust SAFE_SCALE and BACKGROUND below before running.

Run from the repository root:
    python3 scripts/generate-pwa-icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design" / "abu-raghwa-icon-source.png"
PUBLIC = ROOT / "client" / "public"
SAFE_SCALE = 0.82  # Keep the visual mark inside the adaptive-icon safe area.
BACKGROUND = (8, 22, 79, 255)  # Deep blue; avoids white edges under any mask.

OUTPUTS = {
    "icon-192x192.png": 192,
    "icon-512x512.png": 512,
    "apple-touch-icon.png": 180,
    "abu-raghwa-icon-192.png": 192,
    "abu-raghwa-icon-512.png": 512,
}


def make_icon(source: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    safe_size = max(1, round(size * SAFE_SCALE))
    mark = source.resize((safe_size, safe_size), Image.Resampling.LANCZOS)
    offset = ((size - safe_size) // 2, (size - safe_size) // 2)
    canvas.alpha_composite(mark, offset)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source image: {SOURCE}")
    source = Image.open(SOURCE).convert("RGBA")
    if source.width != source.height:
        raise SystemExit("The source image must be square.")
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for filename, size in OUTPUTS.items():
        make_icon(source, size).save(PUBLIC / filename, format="PNG", optimize=True)

    # Multi-size ICO for browser and desktop contexts.
    ico_sizes = (16, 32, 48, 64, 128, 256)
    ico = make_icon(source, 256)
    ico.save(PUBLIC / "favicon.ico", format="ICO", sizes=[(s, s) for s in ico_sizes])
    print(f"Generated {len(OUTPUTS)} PNG files and favicon.ico from {SOURCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
