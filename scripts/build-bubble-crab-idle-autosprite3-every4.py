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


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-bubble-crab"
)
VIDEO_PATH = ROOT / "idle-aggressive-imagine-1.5-raw.mp4"
OUTPUT_DIR = ROOT / "autosprite3-every4-source-rgb-frames"
PREVIEW_PATH = ROOT / "autosprite3-every4-source-rgb-preview.webp"
CONTACT_DARK_PATH = ROOT / "autosprite3-every4-source-rgb-contact-dark.png"
CONTACT_LIGHT_PATH = ROOT / "autosprite3-every4-source-rgb-contact-light.png"
METADATA_PATH = ROOT / "autosprite3-every4-source-rgb.json"

CORRIDOR_URL = "http://127.0.0.1:8100/process"
SAMPLE_EVERY = 4
FRAME_SIZE = 512
HINT_TOLERANCE = 24.0
CORE_TOLERANCE = 48.0


def image_to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def decode_result(data_url: str) -> Image.Image:
    return Image.open(
        io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))
    ).convert("RGBA")


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


def make_alpha_hint(
    source: Image.Image,
) -> tuple[Image.Image, np.ndarray, list[int]]:
    rgb = np.asarray(source.convert("RGB"), dtype=np.uint8)
    background = estimate_background(rgb)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)

    # Wide hint for thin antennae and claw tips; CorridorKey refines the edge.
    hinted_subject = np.where(distance > HINT_TOLERANCE, 255, 0).astype(np.uint8)
    hint = (
        Image.fromarray(hinted_subject, mode="L")
        .filter(ImageFilter.MaxFilter(size=7))
        .filter(ImageFilter.GaussianBlur(radius=6.0))
    )

    # Definitely-not-green pixels are always retained. This prevents isolated
    # neural mask holes without expanding the final silhouette into the matte.
    core = np.where(distance > CORE_TOLERANCE, 255, 0).astype(np.uint8)
    background_rgb = [int(round(channel)) for channel in background]
    return hint, core, background_rgb


def corridor_alpha(source: Image.Image, hint: Image.Image) -> tuple[np.ndarray, float]:
    payload = json.dumps(
        {
            "image": image_to_data_url(source.convert("RGB")),
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
    keyed = decode_result(result["processed"])
    return np.asarray(keyed.getchannel("A"), dtype=np.uint8), float(
        result["processing_time_s"]
    )


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
    container = av.open(str(VIDEO_PATH))
    stream = container.streams.video[0]
    source_rate = float(stream.average_rate)
    output_rate = source_rate / SAMPLE_EVERY

    frames: list[Image.Image] = []
    timestamps: list[float] = []
    backgrounds: list[list[int]] = []
    processing_times: list[float] = []

    for source_index, video_frame in enumerate(container.decode(stream)):
        if source_index % SAMPLE_EVERY != 0:
            continue
        timestamp = (
            float(video_frame.pts * video_frame.time_base)
            if video_frame.pts is not None
            else source_index / source_rate
        )
        source = video_frame.to_image().convert("RGB").resize(
            (FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS
        )
        hint, core, background = make_alpha_hint(source)
        auto_alpha, processing_time = corridor_alpha(source, hint)
        final_alpha = np.maximum(auto_alpha, core)

        # Preserve the source video's RGB exactly. AutoSprite contributes only
        # its alpha estimate, avoiding the palette shift seen on the frog.
        rgba = np.dstack(
            (
                np.asarray(source, dtype=np.uint8),
                final_alpha,
            )
        )
        keyed = Image.fromarray(rgba, mode="RGBA")
        keyed.save(
            OUTPUT_DIR / f"frame-{len(frames):02d}.png",
            format="PNG",
            optimize=True,
        )
        frames.append(keyed)
        timestamps.append(timestamp)
        backgrounds.append(background)
        processing_times.append(processing_time)
        print(
            f"Processed {len(frames):02d} at {timestamp:.3f}s "
            f"in {processing_time:.2f}s",
            flush=True,
        )
    container.close()

    if not frames:
        raise RuntimeError("No Every 4 frames were extracted")

    frames[0].save(
        PREVIEW_PATH,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=round(1000.0 / output_rate),
        loop=0,
        quality=88,
        method=4,
        lossless=False,
        exact=True,
    )
    composite_contact(frames, (45, 45, 53), CONTACT_DARK_PATH)
    composite_contact(frames, (232, 232, 228), CONTACT_LIGHT_PATH)

    metadata = {
        "sourceVideo": str(VIDEO_PATH),
        "pipeline": "AutoSprite V3 local CorridorKey alpha with source-video RGB",
        "sampleEvery": SAMPLE_EVERY,
        "sourceFps": source_rate,
        "outputFps": output_rate,
        "frameCount": len(frames),
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "hintTolerance": HINT_TOLERANCE,
        "coreTolerance": CORE_TOLERANCE,
        "rgbPreservedFromSource": True,
        "timestampsSeconds": timestamps,
        "backgroundRgbPerFrame": backgrounds,
        "processingSecondsPerFrame": processing_times,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Saved preview: {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
