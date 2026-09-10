#!/usr/bin/env python3

from pathlib import Path

import av
from PIL import Image


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-bubble-crab"
)
VIDEO_PATH = ROOT / "idle-aggressive-imagine-1.5-raw.mp4"
CONTACT_PATH = ROOT / "idle-aggressive-imagine-1.5-raw-contact.png"


def main() -> None:
    container = av.open(str(VIDEO_PATH))
    stream = container.streams.video[0]
    frames = [frame.to_image().convert("RGB") for frame in container.decode(stream)]
    rate = float(stream.average_rate)
    container.close()

    selected_indices = [
        round(index * (len(frames) - 1) / 11)
        for index in range(12)
    ]
    tile_size = 320
    contact = Image.new("RGB", (tile_size * 4, tile_size * 3), (32, 32, 38))
    for slot, source_index in enumerate(selected_indices):
        tile = frames[source_index].resize(
            (tile_size, tile_size), Image.Resampling.LANCZOS
        )
        contact.paste(tile, ((slot % 4) * tile_size, (slot // 4) * tile_size))
    contact.save(CONTACT_PATH, format="PNG", optimize=True)

    print(
        f"frames={len(frames)} fps={rate:.3f} "
        f"duration={len(frames) / rate:.3f}s size={frames[0].size}"
    )
    print(f"selected={selected_indices}")
    print(f"saved={CONTACT_PATH}")


if __name__ == "__main__":
    main()
