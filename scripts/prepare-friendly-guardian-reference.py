"""Deterministic chroma/padding preparation of the existing approved calm artwork."""
from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parents[1]
folder = project / 'artifacts/sorceress/underwater-friendly-guardian'
folder.mkdir(parents=True, exist_ok=True)
source = Image.open(project / 'public/assets/images/underwater/guardian-calm.webp').convert('RGBA')
source = source.crop(source.getchannel('A').getbbox())
source.thumbnail((650, 650), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (1024, 1024), '#00ff00')
canvas.alpha_composite(source, ((1024-source.width)//2, (1024-source.height)//2))
canvas.convert('RGB').save(folder / 'guardian-canonical-green.png')
print('Prepared canonical calm guardian with uniform padding; no generated motion yet.')
