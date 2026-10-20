"""Repack the existing 45 frames as lossless WebP without changing their pixels.

Usage: python scripts/repack-rune-fox.py
The 7 x 7 output fits GPUs capped at 4096; the original 5 x 9 did not.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'public/assets/sprites/catacombs/rune-fox.png').convert('RGBA')
output = Image.new('RGBA', (7 * 512, 7 * 512))
for index in range(45):
    x, y = index % 5 * 512, index // 5 * 512
    frame = source.crop((x, y, x + 512, y + 512))
    output.paste(frame, (index % 7 * 512, index // 7 * 512))
target = root / 'public/assets/sprites/catacombs/rune-fox-compact.webp'
output.save(target, format='WEBP', lossless=True, exact=True, method=6)
decoded = Image.open(target).convert('RGBA')
assert decoded.tobytes() == output.tobytes(), 'WebP must preserve all RGBA pixels'
for index in range(45):
    x, y = index % 5 * 512, index // 5 * 512
    dx, dy = index % 7 * 512, index // 7 * 512
    assert source.crop((x, y, x + 512, y + 512)).tobytes() == output.crop((dx, dy, dx + 512, dy + 512)).tobytes()
print(f'45 frames preserved pixel-for-pixel; atlas 3584 x 3584; {target.stat().st_size} bytes')
