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
OUTPUT_DIR = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/autosprite3-every4-tolerance40-frames"
)
PREVIEW_PATH = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/autosprite3-every4-tolerance40-preview.webp"
)
CONTACT_PATH = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/autosprite3-every4-tolerance40-contact-dark.png"
)
METADATA_PATH = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-frog/autosprite3-every4-tolerance40-local.json"
)

CORRIDOR_URL = "http://127.0.0.1:8100/process"
SAMPLE_EVERY = 4
FRAME_SIZE = 512
TOLERANCE = 40.0
HINT_BLUR_RADIUS = 8.0


def image_to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def data_url_to_image(data_url: str) -> Image.Image:
    payload = data_url.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGBA")


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


def make_alpha_hint(image: Image.Image) -> tuple[Image.Image, list[int]]:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    background = estimate_background(rgb)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)
    subject = np.where(distance > TOLERANCE, 255, 0).astype(np.uint8)
    hint = Image.fromarray(subject, mode="L").filter(
        ImageFilter.GaussianBlur(radius=HINT_BLUR_RADIUS)
    )
    return hint, [int(round(channel)) for channel in background]


def corridor_key(image: Image.Image, hint: Image.Image) -> tuple[Image.Image, float]:
    payload = json.dumps(
        {
            "image": image_to_data_url(image.convert("RGB")),
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
    return data_url_to_image(result["processed"]), float(result["processing_time_s"])


def build_contact_sheet(frames: list[Image.Image]) -> None:
    columns = 5
    rows = (len(frames) + columns - 1) // columns
    background = Image.new(
        "RGBA",
        (columns * FRAME_SIZE, rows * FRAME_SIZE),
        (45, 45, 53, 255),
    )
    for index, frame in enumerate(frames):
        x = (index % columns) * FRAME_SIZE
        y = (index // columns) * FRAME_SIZE
        background.alpha_composite(frame, (x, y))
    background.convert("RGB").save(CONTACT_PATH, format="PNG", optimize=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    container = av.open(str(VIDEO_PATH))
    stream = container.streams.video[0]
    source_rate = float(stream.average_rate)
    output_rate = source_rate / SAMPLE_EVERY

    keyed_frames: list[Image.Image] = []
    timestamps: list[float] = []
    backgrounds: list[list[int]] = []
    processing_times: list[float] = []

    for source_index, frame in enumerate(container.decode(stream)):
        if source_index % SAMPLE_EVERY != 0:
            continue
        timestamp = float(frame.pts * frame.time_base) if frame.pts is not None else source_index / source_rate
        image = frame.to_image().convert("RGB").resize(
            (FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS
        )
        hint, background = make_alpha_hint(image)
        keyed, processing_time = corridor_key(image, hint)
        output_path = OUTPUT_DIR / f"frame-{len(keyed_frames):02d}.png"
        keyed.save(output_path, format="PNG", optimize=True)
        keyed_frames.append(keyed)
        timestamps.append(timestamp)
        backgrounds.append(background)
        processing_times.append(processing_time)
        print(
            f"Processed {len(keyed_frames):02d} at {timestamp:.3f}s "
            f"in {processing_time:.2f}s",
            flush=True,
        )

    container.close()
    if not keyed_frames:
        raise RuntimeError("No Every 4 frames were extracted")

    duration_ms = round(1000.0 / output_rate)
    keyed_frames[0].save(
        PREVIEW_PATH,
        format="WEBP",
        save_all=True,
        append_images=keyed_frames[1:],
        duration=duration_ms,
        loop=0,
        quality=90,
        method=6,
        lossless=False,
        exact=True,
    )
    build_contact_sheet(keyed_frames)

    metadata = {
        "sourceVideo": str(VIDEO_PATH),
        "pipeline": "AutoSprite V3 local CorridorKey fallback",
        "sampleEvery": SAMPLE_EVERY,
        "sourceFps": source_rate,
        "outputFps": output_rate,
        "frameCount": len(keyed_frames),
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "tolerance": TOLERANCE,
        "alphaHintBlurRadius": HINT_BLUR_RADIUS,
        "timestampsSeconds": timestamps,
        "backgroundRgbPerFrame": backgrounds,
        "processingSecondsPerFrame": processing_times,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Saved preview: {PREVIEW_PATH}")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
