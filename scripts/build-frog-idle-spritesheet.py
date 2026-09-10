#!/usr/bin/env python3

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import av
import numpy as np
from PIL import Image


VIDEO_PATH = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/idle-aggressive-confused-imagine-1.5-raw.mp4"
)
OUTPUT_PATH = Path(
    "/Users/datamole/little-math-adventure/public/assets/sprites/"
    "silverpond/frog-enemy-idle.webp"
)
METADATA_PATH = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/frog-enemy-idle-selection.json"
)

TARGET_TIMES = (1.0, 1.2, 1.4, 1.6, 1.8)
FRAME_SIZE = 512
BACKGROUND_BORDER = 8
BACKGROUND_DISTANCE_LIMIT = 175.0
WEBP_QUALITY = 88


def decode_nearest_frames() -> tuple[list[np.ndarray], list[float]]:
    container = av.open(str(VIDEO_PATH))
    stream = container.streams.video[0]
    selected: list[np.ndarray | None] = [None] * len(TARGET_TIMES)
    selected_times = [0.0] * len(TARGET_TIMES)
    selected_distances = [float("inf")] * len(TARGET_TIMES)

    for frame in container.decode(stream):
        if frame.pts is None:
            continue
        timestamp = float(frame.pts * frame.time_base)
        for index, target in enumerate(TARGET_TIMES):
            distance = abs(timestamp - target)
            if distance < selected_distances[index]:
                selected[index] = frame.to_ndarray(format="rgb24")
                selected_times[index] = timestamp
                selected_distances[index] = distance

    container.close()
    if any(frame is None for frame in selected):
        raise RuntimeError("Could not decode every requested Sorceress video frame")
    return [frame for frame in selected if frame is not None], selected_times


def estimate_background(rgb: np.ndarray) -> np.ndarray:
    border = BACKGROUND_BORDER
    edge_pixels = np.concatenate(
        (
            rgb[:border, :, :].reshape(-1, 3),
            rgb[-border:, :, :].reshape(-1, 3),
            rgb[:, :border, :].reshape(-1, 3),
            rgb[:, -border:, :].reshape(-1, 3),
        ),
        axis=0,
    )
    return np.median(edge_pixels, axis=0).astype(np.float32)


def border_connected_mask(candidate: np.ndarray) -> np.ndarray:
    height, width = candidate.shape
    connected = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if candidate[0, x]:
            connected[0, x] = True
            queue.append((0, x))
        if candidate[height - 1, x]:
            connected[height - 1, x] = True
            queue.append((height - 1, x))
    for y in range(height):
        if candidate[y, 0]:
            connected[y, 0] = True
            queue.append((y, 0))
        if candidate[y, width - 1]:
            connected[y, width - 1] = True
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if (
                0 <= next_y < height
                and 0 <= next_x < width
                and candidate[next_y, next_x]
                and not connected[next_y, next_x]
            ):
                connected[next_y, next_x] = True
                queue.append((next_y, next_x))
    return connected


def remove_background(rgb: np.ndarray) -> tuple[Image.Image, list[int]]:
    background = estimate_background(rgb)
    difference = rgb.astype(np.float32) - background
    distance = np.linalg.norm(difference, axis=2)
    connected = border_connected_mask(distance < BACKGROUND_DISTANCE_LIMIT)

    alpha = np.full(distance.shape, 255, dtype=np.uint8)
    alpha[connected] = 0
    color = rgb.copy()
    color[connected] = 0

    rgba = np.dstack((color, alpha))
    image = Image.fromarray(rgba, mode="RGBA")
    image = image.resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
    return image, [int(round(channel)) for channel in background]


def build_sheet() -> None:
    frames, actual_times = decode_nearest_frames()
    keyed_frames: list[Image.Image] = []
    backgrounds: list[list[int]] = []
    for frame in frames:
        keyed, background = remove_background(frame)
        keyed_frames.append(keyed)
        backgrounds.append(background)

    sheet = Image.new("RGBA", (FRAME_SIZE * len(keyed_frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(keyed_frames):
        sheet.alpha_composite(frame, (index * FRAME_SIZE, 0))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(
        OUTPUT_PATH,
        format="WEBP",
        quality=WEBP_QUALITY,
        method=6,
        lossless=False,
        exact=True,
    )

    metadata = {
        "sourceVideo": str(VIDEO_PATH),
        "source": "Sorceress imagine-1.5 image-to-video",
        "requestedTimesSeconds": list(TARGET_TIMES),
        "selectedTimesSeconds": actual_times,
        "uniqueFrames": len(keyed_frames),
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "sheetWidth": sheet.width,
        "sheetHeight": sheet.height,
        "runtimeSequence": [0, 1, 2, 3, 4, 3, 2, 1],
        "runtimeFrameRate": 6,
        "backgroundRgbPerFrame": backgrounds,
        "backgroundRemoval": "border-connected color distance with shared full-frame canvas",
        "webpQuality": WEBP_QUALITY,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(f"Saved {OUTPUT_PATH}")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    build_sheet()
