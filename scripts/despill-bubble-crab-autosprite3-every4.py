#!/usr/bin/env python3

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-bubble-crab"
)
INPUT_DIR = ROOT / "autosprite3-every4-source-rgb-frames"
OUTPUT_DIR = ROOT / "autosprite3-every4-despill-frames"
PREVIEW_PATH = ROOT / "autosprite3-every4-despill-preview.webp"
PINGPONG_PREVIEW_PATH = ROOT / "autosprite3-every4-despill-pingpong-preview.webp"
CONTACT_DARK_PATH = ROOT / "autosprite3-every4-despill-contact-dark.png"
CONTACT_LIGHT_PATH = ROOT / "autosprite3-every4-despill-contact-light.png"
METADATA_PATH = ROOT / "autosprite3-every4-despill.json"

FRAME_SIZE = 512
CHROMA_ZERO_DISTANCE = 10.0
CHROMA_OPAQUE_DISTANCE = 92.0
GREEN_EXCESS_START = 6.0
GREEN_EXCESS_TRANSPARENT = 72.0
MIN_ALPHA_COMPONENT_PIXELS = 24


def estimate_background(rgb: np.ndarray) -> np.ndarray:
    border = 6
    pixels = np.concatenate(
        (
            rgb[:border].reshape(-1, 3),
            rgb[-border:].reshape(-1, 3),
            rgb[:, :border].reshape(-1, 3),
            rgb[:, -border:].reshape(-1, 3),
        ),
        axis=0,
    )
    return np.median(pixels, axis=0).astype(np.float32)


def smoothstep(value: np.ndarray) -> np.ndarray:
    value = np.clip(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def remove_tiny_alpha_components(alpha: np.ndarray) -> np.ndarray:
    foreground = alpha > (8.0 / 255.0)
    visited = np.zeros(foreground.shape, dtype=bool)
    height, width = foreground.shape
    cleaned = alpha.copy()

    for start_y, start_x in np.argwhere(foreground):
        if visited[start_y, start_x]:
            continue
        queue: deque[tuple[int, int]] = deque([(int(start_y), int(start_x))])
        visited[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            for offset_y in (-1, 0, 1):
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_y = y + offset_y
                    neighbor_x = x + offset_x
                    if not (0 <= neighbor_y < height and 0 <= neighbor_x < width):
                        continue
                    if visited[neighbor_y, neighbor_x] or not foreground[neighbor_y, neighbor_x]:
                        continue
                    visited[neighbor_y, neighbor_x] = True
                    queue.append((neighbor_y, neighbor_x))
        if len(component) < MIN_ALPHA_COMPONENT_PIXELS:
            for y, x in component:
                cleaned[y, x] = 0.0
    return cleaned


def despill(frame: Image.Image) -> tuple[Image.Image, list[int]]:
    rgba = np.asarray(frame.convert("RGBA"), dtype=np.uint8)
    observed = rgba[:, :, :3].astype(np.float32)
    model_alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    background = estimate_background(rgba[:, :, :3])

    distance = np.linalg.norm(observed - background, axis=2)
    chroma_alpha = smoothstep(
        (distance - CHROMA_ZERO_DISTANCE)
        / (CHROMA_OPAQUE_DISTANCE - CHROMA_ZERO_DISTANCE)
    )
    green_excess = observed[:, :, 1] - np.maximum(
        observed[:, :, 0], observed[:, :, 2]
    )
    green_alpha = 1.0 - smoothstep(
        (green_excess - GREEN_EXCESS_START)
        / (GREEN_EXCESS_TRANSPARENT - GREEN_EXCESS_START)
    )
    final_alpha = np.minimum(np.minimum(model_alpha, chroma_alpha), green_alpha)
    final_alpha = remove_tiny_alpha_components(final_alpha)

    # Recover edge RGB from C_observed = a*C_subject + (1-a)*C_green.
    # Fully opaque subject pixels remain byte-for-byte unchanged.
    safe_alpha = np.maximum(chroma_alpha, 0.08)[:, :, None]
    recovered = (
        observed - (1.0 - chroma_alpha[:, :, None]) * background[None, None, :]
    ) / safe_alpha
    recovered = np.clip(recovered, 0.0, 255.0)
    edge_weight = np.clip((0.98 - chroma_alpha) / 0.90, 0.0, 1.0)[:, :, None]
    corrected_rgb = observed * (1.0 - edge_weight) + recovered * edge_weight

    # A second, hue-aware guard removes green video spill that Euclidean
    # distance alone would retain (for example yellow-green compression flecks).
    neutral_rgb = corrected_rgb.copy()
    neutral_rgb[:, :, 1] = np.minimum(
        neutral_rgb[:, :, 1],
        np.maximum(neutral_rgb[:, :, 0], neutral_rgb[:, :, 2]) + 4.0,
    )
    spill_weight = smoothstep((green_excess - 2.0) / 30.0)[:, :, None]
    corrected_rgb = (
        corrected_rgb * (1.0 - spill_weight) + neutral_rgb * spill_weight
    )

    output = np.dstack(
        (
            np.rint(corrected_rgb).astype(np.uint8),
            np.rint(final_alpha * 255.0).astype(np.uint8),
        )
    )
    return Image.fromarray(output, mode="RGBA"), [
        int(round(channel)) for channel in background
    ]


def composite_contact(frames: list[Image.Image], color: tuple[int, int, int], path: Path) -> None:
    columns = 5
    rows = (len(frames) + columns - 1) // columns
    contact = Image.new("RGB", (FRAME_SIZE * columns, FRAME_SIZE * rows), color)
    for index, frame in enumerate(frames):
        tile = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (*color, 255))
        tile.alpha_composite(frame)
        contact.paste(
            tile.convert("RGB"),
            ((index % columns) * FRAME_SIZE, (index // columns) * FRAME_SIZE),
        )
    contact.save(path, format="PNG", optimize=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    backgrounds: list[list[int]] = []
    for index in range(13):
        source = Image.open(INPUT_DIR / f"frame-{index:02d}.png").convert("RGBA")
        corrected, background = despill(source)
        corrected.save(
            OUTPUT_DIR / f"frame-{index:02d}.png",
            format="PNG",
            optimize=True,
        )
        frames.append(corrected)
        backgrounds.append(background)

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
    pingpong_frames = frames + list(reversed(frames[1:-1]))
    pingpong_frames[0].save(
        PINGPONG_PREVIEW_PATH,
        format="WEBP",
        save_all=True,
        append_images=pingpong_frames[1:],
        duration=167,
        loop=0,
        quality=88,
        method=4,
        lossless=False,
        exact=True,
    )
    composite_contact(frames, (45, 45, 53), CONTACT_DARK_PATH)
    composite_contact(frames, (232, 232, 228), CONTACT_LIGHT_PATH)
    METADATA_PATH.write_text(
        json.dumps(
            {
                "sourceFrames": str(INPUT_DIR),
                "frameCount": len(frames),
                "sampleEvery": 4,
                "outputFps": 6,
                "frameWidth": FRAME_SIZE,
                "frameHeight": FRAME_SIZE,
                "chromaZeroDistance": CHROMA_ZERO_DISTANCE,
                "chromaOpaqueDistance": CHROMA_OPAQUE_DISTANCE,
                "greenExcessStart": GREEN_EXCESS_START,
                "greenExcessTransparent": GREEN_EXCESS_TRANSPARENT,
                "minimumAlphaComponentPixels": MIN_ALPHA_COMPONENT_PIXELS,
                "rgbPolicy": "source RGB; edge-only green unmix; opaque pixels unchanged",
                "backgroundRgbPerFrame": backgrounds,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Saved preview: {PREVIEW_PATH}")
    print(f"Saved ping-pong preview: {PINGPONG_PREVIEW_PATH}")


if __name__ == "__main__":
    main()
