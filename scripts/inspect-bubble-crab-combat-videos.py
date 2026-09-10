#!/usr/bin/env python3

from pathlib import Path

import av
from PIL import Image


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-bubble-crab"
)
ACTIONS = ("attack", "defend", "defeat")
CONTACT_PATH = ROOT / "combat-imagine-1.5-raw-contact.png"


def main() -> None:
    tile_size = 300
    contact = Image.new("RGB", (tile_size * 6, tile_size * 3), (32, 32, 38))

    for row, action in enumerate(ACTIONS):
        video_path = ROOT / f"{action}-imagine-1.5-raw.mp4"
        container = av.open(str(video_path))
        stream = container.streams.video[0]
        frames = [frame.to_image().convert("RGB") for frame in container.decode(stream)]
        rate = float(stream.average_rate)
        container.close()
        selected = [round(index * (len(frames) - 1) / 5) for index in range(6)]
        for column, source_index in enumerate(selected):
            tile = frames[source_index].resize(
                (tile_size, tile_size), Image.Resampling.LANCZOS
            )
            contact.paste(tile, (column * tile_size, row * tile_size))
        print(
            f"{action}: frames={len(frames)} fps={rate:.3f} "
            f"duration={len(frames) / rate:.3f}s size={frames[0].size} "
            f"selected={selected}"
        )

    contact.save(CONTACT_PATH, format="PNG", optimize=True)
    print(f"saved={CONTACT_PATH}")


if __name__ == "__main__":
    main()
