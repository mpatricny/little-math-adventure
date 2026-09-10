#!/usr/bin/env python3

from pathlib import Path

from PIL import Image


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-lake-fairy"
)
OUTPUT_DIR = Path(
    "/Users/datamole/little-math-adventure/public/assets/sprites/silverpond"
)
FRAME_SIZE = 512
SOURCE_COLS = 8
SOURCE_FRAME_COUNT = 15
SELECTIONS = {
    "idle": list(range(15)),
    "give": list(range(3, 11)),
}


def extract_frames(action: str) -> list[Image.Image]:
    sheet = Image.open(ROOT / f"autosprite3-{action}-every4.png").convert("RGBA")
    frames: list[Image.Image] = []
    for index in range(SOURCE_FRAME_COUNT):
        x = (index % SOURCE_COLS) * FRAME_SIZE
        y = (index // SOURCE_COLS) * FRAME_SIZE
        frames.append(sheet.crop((x, y, x + FRAME_SIZE, y + FRAME_SIZE)))
    return frames


def save_contact(frames: list[Image.Image], action: str) -> None:
    columns = 5
    rows = (len(frames) + columns - 1) // columns
    for label, color in (("dark", (36, 42, 52)), ("light", (232, 235, 238))):
        contact = Image.new("RGBA", (columns * FRAME_SIZE, rows * FRAME_SIZE), (*color, 255))
        for index, frame in enumerate(frames):
            contact.alpha_composite(
                frame,
                ((index % columns) * FRAME_SIZE, (index // columns) * FRAME_SIZE),
            )
        contact.convert("RGB").save(
            ROOT / f"production-{action}-contact-{label}.png",
            format="PNG",
            optimize=True,
        )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for action, selection in SELECTIONS.items():
        source_frames = extract_frames(action)
        frames = [source_frames[index] for index in selection]
        sheet = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
        for output_index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (output_index * FRAME_SIZE, 0))

        output_path = OUTPUT_DIR / f"lake-fairy-{action}.webp"
        sheet.save(
            output_path,
            format="WEBP",
            quality=88,
            method=6,
            lossless=False,
            exact=True,
        )
        preview_frames = frames
        if action == "idle":
            preview_frames = frames + frames[-2:0:-1]
        preview_frames[0].save(
            ROOT / f"production-{action}-preview.webp",
            format="WEBP",
            save_all=True,
            append_images=preview_frames[1:],
            duration=133,
            loop=0 if action == "idle" else 1,
            quality=88,
            method=6,
            lossless=False,
            exact=True,
        )
        save_contact(frames, action)
        print(
            f"Saved {output_path} ({sheet.width}x{sheet.height}, "
            f"{len(frames)} frames, {output_path.stat().st_size} bytes)"
        )


if __name__ == "__main__":
    main()
