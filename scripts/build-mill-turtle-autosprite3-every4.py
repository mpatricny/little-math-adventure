#!/usr/bin/env python3

from __future__ import annotations

import base64
import io
import json
import urllib.request
from collections import deque
from pathlib import Path

import av
import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-mill-turtle"
)
ACTION_WINDOWS = {
    "idle": {"start": 0, "end": 48, "expected": 13},
    "attack": {"start": 16, "end": 40, "expected": 7},
    "defend": {"start": 4, "end": 28, "expected": 7},
    "defeat": {"start": 4, "end": 28, "expected": 7},
}
CORRIDOR_URL = "http://127.0.0.1:8100/process"
SAMPLE_EVERY = 4
FRAME_SIZE = 512
HINT_TOLERANCE = 24.0
CORE_TOLERANCE = 48.0
CHROMA_ZERO_DISTANCE = 10.0
CHROMA_OPAQUE_DISTANCE = 92.0
GREEN_EXCESS_START = 8.0
GREEN_EXCESS_TRANSPARENT = 78.0
MIN_ALPHA_COMPONENT_PIXELS = 4


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


def make_hint_and_core(source: Image.Image) -> tuple[Image.Image, np.ndarray]:
    rgb = np.asarray(source.convert("RGB"), dtype=np.uint8)
    background = estimate_background(rgb)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)
    hinted_subject = np.where(distance > HINT_TOLERANCE, 255, 0).astype(np.uint8)
    hint = (
        Image.fromarray(hinted_subject, mode="L")
        .filter(ImageFilter.MaxFilter(size=7))
        .filter(ImageFilter.GaussianBlur(radius=6.0))
    )
    core = np.where(distance > CORE_TOLERANCE, 255, 0).astype(np.uint8)
    return hint, core


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


def conservative_key(source: Image.Image, model_alpha_u8: np.ndarray) -> Image.Image:
    observed_u8 = np.asarray(source.convert("RGB"), dtype=np.uint8)
    observed = observed_u8.astype(np.float32)
    model_alpha = model_alpha_u8.astype(np.float32) / 255.0
    background = estimate_background(observed_u8)

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

    # Keep the model video's turquoise, cyan, purple and gold RGB intact. Only
    # translucent edge pixels with obvious green excess receive local despill.
    corrected_rgb = observed.copy()
    neutral_green = np.maximum(observed[:, :, 0], observed[:, :, 2]) + 6.0
    edge_weight = smoothstep((0.98 - final_alpha) / 0.45)
    spill_weight = smoothstep((green_excess - 18.0) / 48.0)
    correction_weight = (edge_weight * spill_weight)[:, :, None]
    neutral_rgb = observed.copy()
    neutral_rgb[:, :, 1] = np.minimum(neutral_rgb[:, :, 1], neutral_green)
    corrected_rgb = corrected_rgb * (1.0 - correction_weight) + neutral_rgb * correction_weight

    output = np.dstack(
        (
            np.rint(corrected_rgb).astype(np.uint8),
            np.rint(final_alpha * 255.0).astype(np.uint8),
        )
    )
    return Image.fromarray(output, mode="RGBA")


def composite_contact(frames: list[Image.Image], color: tuple[int, int, int], path: Path) -> None:
    columns = 5 if len(frames) > 7 else 4
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


def process_action(action: str, window: dict[str, int]) -> dict[str, object]:
    video_path = ROOT / f"{action}-imagine-1.5-raw.mp4"
    output_dir = ROOT / f"autosprite3-{action}-every4-frames"
    output_dir.mkdir(parents=True, exist_ok=True)
    container = av.open(str(video_path))
    stream = container.streams.video[0]
    source_rate = float(stream.average_rate)

    frames: list[Image.Image] = []
    timestamps: list[float] = []
    processing_times: list[float] = []
    source_indices: list[int] = []
    for source_index, video_frame in enumerate(container.decode(stream)):
        if source_index < window["start"] or source_index > window["end"]:
            continue
        if (source_index - window["start"]) % SAMPLE_EVERY != 0:
            continue
        source = video_frame.to_image().convert("RGB").resize(
            (FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS
        )
        hint, core = make_hint_and_core(source)
        auto_alpha, processing_time = corridor_alpha(source, hint)
        protected_alpha = np.maximum(auto_alpha, core)
        keyed = conservative_key(source, protected_alpha)
        keyed.save(
            output_dir / f"frame-{len(frames):02d}.png",
            format="PNG",
            optimize=True,
        )
        frames.append(keyed)
        source_indices.append(source_index)
        timestamps.append(source_index / source_rate)
        processing_times.append(processing_time)
        print(
            f"{action} {len(frames):02d}: source={source_index:02d} "
            f"time={source_index / source_rate:.3f}s process={processing_time:.2f}s",
            flush=True,
        )
    container.close()

    if len(frames) != window["expected"]:
        raise RuntimeError(
            f"Expected {window['expected']} {action} frames, got {len(frames)}"
        )

    preview_frames = frames
    if action == "idle":
        preview_frames = frames + frames[-2:0:-1]
    preview_path = ROOT / f"autosprite3-{action}-every4-preview.webp"
    preview_frames[0].save(
        preview_path,
        format="WEBP",
        save_all=True,
        append_images=preview_frames[1:],
        duration=167,
        loop=0,
        quality=88,
        method=4,
        lossless=False,
        exact=True,
    )
    composite_contact(
        frames,
        (45, 45, 53),
        ROOT / f"autosprite3-{action}-every4-contact-dark.png",
    )
    composite_contact(
        frames,
        (232, 232, 228),
        ROOT / f"autosprite3-{action}-every4-contact-light.png",
    )
    return {
        "video": str(video_path),
        "window": window,
        "sampleEvery": SAMPLE_EVERY,
        "sourceIndices": source_indices,
        "timestampsSeconds": timestamps,
        "frameCount": len(frames),
        "outputFps": source_rate / SAMPLE_EVERY,
        "processingSecondsPerFrame": processing_times,
        "outputFrames": str(output_dir),
        "preview": str(preview_path),
    }


def main() -> None:
    metadata = {
        "pipeline": "AutoSprite V3 CorridorKey alpha + conservative local despill + source RGB",
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "sharedCanvasAndTransform": True,
        "actions": {},
    }
    for action, window in ACTION_WINDOWS.items():
        metadata["actions"][action] = process_action(action, window)
    metadata_path = ROOT / "autosprite3-every4.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Saved metadata: {metadata_path}")


if __name__ == "__main__":
    main()
