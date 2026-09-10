#!/usr/bin/env python3

from pathlib import Path

from PIL import Image


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-ruin-axolotl"
)
OUTPUT_DIR = Path(
    "/Users/datamole/little-math-adventure/public/assets/sprites/silverpond"
)
FRAME_SIZE = 512
ACTIONS = {
    "idle": (ROOT / "autosprite3-idle-every4-frames", 13),
    "attack": (ROOT / "autosprite3-attack-every4-frames", 7),
    "defend": (ROOT / "autosprite3-defend-every4-frames", 7),
    "defeat": (ROOT / "autosprite3-defeat-every4-frames", 7),
}


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for action, (frames_dir, frame_count) in ACTIONS.items():
        sheet = Image.new(
            "RGBA", (FRAME_SIZE * frame_count, FRAME_SIZE), (0, 0, 0, 0)
        )
        for index in range(frame_count):
            frame = Image.open(frames_dir / f"frame-{index:02d}.png").convert("RGBA")
            if frame.size != (FRAME_SIZE, FRAME_SIZE):
                raise RuntimeError(
                    f"{action} frame {index} is {frame.size}, expected 512x512"
                )
            sheet.alpha_composite(frame, (index * FRAME_SIZE, 0))

        output_path = OUTPUT_DIR / f"ruin-axolotl-{action}.webp"
        sheet.save(
            output_path,
            format="WEBP",
            quality=88,
            method=6,
            lossless=False,
            exact=True,
        )
        print(
            f"Saved {output_path} "
            f"({sheet.width}x{sheet.height}, {frame_count} frames)"
        )


if __name__ == "__main__":
    main()
