#!/usr/bin/env python3

from __future__ import annotations

import base64
import io
import json
import urllib.request
from pathlib import Path

import av
import numpy as np
from PIL import Image, ImageFilter


VIDEO_PATH = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/idle-aggressive-confused-imagine-1.5-raw.mp4"
)
OUTPUT_PATH = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/autosprite3-every4-tolerance40-frames/frame-10-retry.png"
)
CORRIDOR_URL = "http://127.0.0.1:8100/process"
SOURCE_FRAME_INDEX = 40
FRAME_SIZE = 512


def image_to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def decode_result(data_url: str) -> Image.Image:
    return Image.open(
        io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))
    ).convert("RGBA")


def main() -> None:
    container = av.open(str(VIDEO_PATH))
    stream = container.streams.video[0]
    source = next(
        frame.to_image().convert("RGB")
        for index, frame in enumerate(container.decode(stream))
        if index == SOURCE_FRAME_INDEX
    ).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
    container.close()

    rgb = np.asarray(source, dtype=np.uint8)
    border = 6
    border_pixels = np.concatenate(
        (
            rgb[:border].reshape(-1, 3),
            rgb[-border:].reshape(-1, 3),
            rgb[:, :border].reshape(-1, 3),
            rgb[:, -border:].reshape(-1, 3),
        ),
        axis=0,
    )
    background = np.median(border_pixels, axis=0).astype(np.float32)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)

    # Preserve a wider corridor around fine toes and leaf edges than the batch pass.
    subject = np.where(distance > 24.0, 255, 0).astype(np.uint8)
    hint = (
        Image.fromarray(subject, mode="L")
        .filter(ImageFilter.MaxFilter(size=11))
        .filter(ImageFilter.GaussianBlur(radius=10.0))
    )

    payload = json.dumps(
        {
            "image": image_to_data_url(source),
            "alpha_hint": image_to_data_url(hint),
            "resolution": FRAME_SIZE,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        CORRIDOR_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        result = json.loads(response.read().decode("utf-8"))
    repaired = decode_result(result["processed"])
    repaired.save(OUTPUT_PATH, format="PNG", optimize=True)
    print(f"Saved {OUTPUT_PATH} in {float(result['processing_time_s']):.2f}s")


if __name__ == "__main__":
    main()
