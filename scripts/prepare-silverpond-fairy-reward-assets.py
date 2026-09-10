#!/usr/bin/env python3

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path("/Users/datamole/little-math-adventure")
SOURCE = ROOT / "docs/design-drafts/silverpond-fairy-reward/sources"
UI_OUTPUT = ROOT / "public/assets/ui/story/silverpond-fairy-reward"


def smoothstep(value: np.ndarray) -> np.ndarray:
    value = np.clip(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def green_to_alpha(source: Image.Image) -> Image.Image:
    rgb = np.asarray(source.convert("RGB"), dtype=np.uint8)
    observed = rgb.astype(np.float32)
    background = np.median(
        np.concatenate(
            (rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3),
             rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)),
            axis=0,
        ),
        axis=0,
    ).astype(np.float32)

    distance = np.linalg.norm(observed - background, axis=2)
    chroma_alpha = smoothstep((distance - 12.0) / 82.0)
    green_excess = observed[:, :, 1] - np.maximum(observed[:, :, 0], observed[:, :, 2])
    green_alpha = 1.0 - smoothstep((green_excess - 10.0) / 70.0)
    alpha = np.minimum(chroma_alpha, green_alpha)

    corrected = observed.copy()
    neutral_green = np.maximum(observed[:, :, 0], observed[:, :, 2]) + 5.0
    edge_weight = smoothstep((0.98 - alpha) / 0.42)
    spill_weight = smoothstep((green_excess - 16.0) / 46.0)
    weight = (edge_weight * spill_weight)[:, :, None]
    neutral = observed.copy()
    neutral[:, :, 1] = np.minimum(neutral[:, :, 1], neutral_green)
    corrected = corrected * (1.0 - weight) + neutral * weight

    rgba = np.dstack(
        (np.rint(corrected).astype(np.uint8), np.rint(alpha * 255.0).astype(np.uint8))
    )
    return Image.fromarray(rgba, mode="RGBA")


def checker_to_alpha(source: Image.Image) -> Image.Image:
    rgb = np.asarray(source.convert("RGB"), dtype=np.uint8)
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    background_candidate = (minimum >= 185) & ((maximum - minimum) <= 22)
    height, width = background_candidate.shape
    exterior = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if background_candidate[0, x]:
            exterior[0, x] = True
            queue.append((0, x))
        if background_candidate[-1, x]:
            exterior[-1, x] = True
            queue.append((height - 1, x))
    for y in range(height):
        if background_candidate[y, 0]:
            exterior[y, 0] = True
            queue.append((y, 0))
        if background_candidate[y, -1]:
            exterior[y, -1] = True
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                ny, nx = y + dy, x + dx
                if not (0 <= ny < height and 0 <= nx < width):
                    continue
                if exterior[ny, nx] or not background_candidate[ny, nx]:
                    continue
                exterior[ny, nx] = True
                queue.append((ny, nx))

    alpha = np.where(exterior, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack((rgb, alpha)), mode="RGBA")


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise RuntimeError("Asset has no visible pixels")
    return bbox


def fit_on_canvas(image: Image.Image, canvas: tuple[int, int], padding: int) -> Image.Image:
    crop = image.crop(visible_bbox(image))
    max_width = canvas[0] - padding * 2
    max_height = canvas[1] - padding * 2
    scale = min(max_width / crop.width, max_height / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", canvas, (0, 0, 0, 0))
    output.alpha_composite(
        resized,
        ((canvas[0] - resized.width) // 2, (canvas[1] - resized.height) // 2),
    )
    return output


def save_webp(image: Image.Image, path: Path) -> None:
    image.save(path, format="WEBP", quality=88, method=6, lossless=False, exact=True)


def prepare_character_and_scale() -> None:
    fairy = green_to_alpha(Image.open(SOURCE / "lake-fairy-green.png"))
    save_webp(fit_on_canvas(fairy, (512, 512), 18), UI_OUTPUT / "lake-fairy-static.webp")

    scale = green_to_alpha(Image.open(SOURCE / "water-breathing-scale-green.png"))
    save_webp(fit_on_canvas(scale, (512, 512), 32), UI_OUTPUT / "water-breathing-scale.webp")


def prepare_frames() -> None:
    keyed = checker_to_alpha(Image.open(SOURCE / "story-frame-sheet.png"))
    title = keyed.crop((55, 90, 1200, 405))
    reward = keyed.crop((25, 470, 1228, 1150))
    save_webp(fit_on_canvas(title, (1100, 260), 18), UI_OUTPUT / "title-frame.webp")
    save_webp(fit_on_canvas(reward, (1160, 620), 18), UI_OUTPUT / "reward-frame.webp")


def prepare_button_pair() -> None:
    keyed = green_to_alpha(Image.open(SOURCE / "action-button-pair-green.png"))
    cell_width = keyed.width // 2
    cells = [
        keyed.crop((0, 0, cell_width, keyed.height)),
        keyed.crop((cell_width, 0, keyed.width, keyed.height)),
    ]
    boxes = [visible_bbox(cell) for cell in cells]
    left = min(box[0] for box in boxes)
    top = min(box[1] for box in boxes)
    right_margin = min(cell_width - box[2] for box in boxes)
    bottom_margin = min(keyed.height - box[3] for box in boxes)
    shared = (left, top, cell_width - right_margin, keyed.height - bottom_margin)

    for name, cell in zip(("normal", "active"), cells, strict=True):
        cropped = cell.crop(shared)
        save_webp(
            fit_on_canvas(cropped, (640, 240), 18),
            UI_OUTPUT / f"action-{name}.webp",
        )


def main() -> None:
    UI_OUTPUT.mkdir(parents=True, exist_ok=True)
    prepare_character_and_scale()
    prepare_frames()
    prepare_button_pair()
    for path in sorted(UI_OUTPUT.glob("*.webp")):
        with Image.open(path) as image:
            print(f"{path}: {image.width}x{image.height} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
