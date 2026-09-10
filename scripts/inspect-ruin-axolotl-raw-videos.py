#!/usr/bin/env python3

from pathlib import Path

import av
from PIL import Image


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-ruin-axolotl"
)
ACTIONS = ("idle", "attack", "defend", "defeat")


def main() -> None:
    tile_size = 300
    for action in ACTIONS:
        video_path = ROOT / f"{action}-imagine-1.5-raw.mp4"
        container = av.open(str(video_path))
        stream = container.streams.video[0]
        frames = [frame.to_image().convert("RGB") for frame in container.decode(stream)]
        rate = float(stream.average_rate)
        container.close()

        selected = [round(index * (len(frames) - 1) / 8) for index in range(9)]
        contact = Image.new("RGB", (tile_size * 3, tile_size * 3), (32, 32, 38))
        for output_index, source_index in enumerate(selected):
            tile = frames[source_index].resize(
                (tile_size, tile_size), Image.Resampling.LANCZOS
            )
            contact.paste(
                tile,
                ((output_index % 3) * tile_size, (output_index // 3) * tile_size),
            )

        contact_path = ROOT / f"{action}-raw-contact.png"
        contact.save(contact_path, format="PNG", optimize=True)
        print(
            f"{action}: frames={len(frames)} fps={rate:.3f} "
            f"duration={len(frames) / rate:.3f}s size={frames[0].size} "
            f"selected={selected} saved={contact_path}"
        )


if __name__ == "__main__":
    main()
