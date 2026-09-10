#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
from pathlib import Path


PIPELINE_PATH = Path(__file__).with_name("build-mill-turtle-autosprite3-every4.py")
SPEC = importlib.util.spec_from_file_location("autosprite3_pipeline", PIPELINE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load AutoSprite V3 pipeline: {PIPELINE_PATH}")
PIPELINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PIPELINE)

PIPELINE.ROOT = Path(
    "/Users/datamole/little-math-adventure/artifacts/sorceress/"
    "silverpond-ruin-axolotl"
)
PIPELINE.ACTION_WINDOWS = {
    "idle": {"start": 0, "end": 48, "expected": 13},
    "attack": {"start": 12, "end": 36, "expected": 7},
    "defend": {"start": 24, "end": 48, "expected": 7},
    "defeat": {"start": 8, "end": 32, "expected": 7},
}


if __name__ == "__main__":
    PIPELINE.main()
