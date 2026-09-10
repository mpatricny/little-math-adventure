#!/usr/bin/env python3

from pathlib import Path

from PIL import Image


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog"
)
FRAMES_DIR = ROOT / "autosprite3-every4-tolerance40-frames"
PREVIEW_PATH = ROOT / "autosprite3-every4-tolerance40-preview.webp"
CONTACT_PATH = ROOT / "autosprite3-every4-tolerance40-contact-dark.png"
FRAME_SIZE = 512


def main() -> None:
    frames = [
        Image.open(FRAMES_DIR / f"frame-{index:02d}.png").convert("RGBA")
        for index in range(25)
    ]
    frames[0].save(
        PREVIEW_PATH,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=167,
        loop=0,
        quality=88,
        method=4,
        lossless=False,
        exact=True,
    )

    contact = Image.new("RGB", (FRAME_SIZE * 5, FRAME_SIZE * 5), (45, 45, 53))
    for index, frame in enumerate(frames):
        tile = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (45, 45, 53, 255))
        tile.alpha_composite(frame)
        contact.paste(tile.convert("RGB"), ((index % 5) * FRAME_SIZE, (index // 5) * FRAME_SIZE))
    contact.save(CONTACT_PATH, format="PNG", optimize=True)

    print(f"Saved {PREVIEW_PATH}")
    print(f"Saved {CONTACT_PATH}")


if __name__ == "__main__":
    main()
