from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
SOURCE_DIR = HERE / "isolated-sources"
OUTPUT_DIR = REPO_ROOT / "public/assets/ui/story/forest-crystal-transition"

GEORGIA = "/System/Library/Fonts/Supplemental/Georgia.ttf"
GEORGIA_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"


def crop_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha_bbox = rgba.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise ValueError("Asset has no visible pixels")
    return rgba.crop(alpha_bbox)


def fit_on_canvas(image: Image.Image, size: tuple[int, int], padding: int) -> Image.Image:
    max_width = size[0] - padding * 2
    max_height = size[1] - padding * 2
    scale = min(max_width / image.width, max_height / image.height)
    fitted = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(
        fitted,
        ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2),
    )
    return canvas


def normalize_dialog_frame() -> Image.Image:
    raw = crop_alpha(Image.open(SOURCE_DIR / "zyx-dialog-frame-alpha-raw.png"))

    # Preserve the portrait medallion and the decorated right end. Stretch only
    # the undecorated center rail/inset so the result matches the wider mock.
    left_cut = round(raw.width * 0.38)
    right_cut = round(raw.width * 0.92)
    target_width = round(raw.height * 4.2)
    center_width = target_width - left_cut - (raw.width - right_cut)

    left = raw.crop((0, 0, left_cut, raw.height))
    center = raw.crop((left_cut, 0, right_cut, raw.height)).resize(
        (center_width, raw.height),
        Image.Resampling.LANCZOS,
    )
    right = raw.crop((right_cut, 0, raw.width, raw.height))

    stretched = Image.new("RGBA", (target_width, raw.height), (0, 0, 0, 0))
    stretched.alpha_composite(left, (0, 0))
    stretched.alpha_composite(center, (left.width, 0))
    stretched.alpha_composite(right, (left.width + center.width, 0))
    return fit_on_canvas(stretched, (1200, 320), 20)


def normalize_button() -> Image.Image:
    raw = crop_alpha(Image.open(SOURCE_DIR / "zyx-dialog-action-frame-alpha-raw.png"))
    return fit_on_canvas(raw, (480, 160), 20)


def normalize_crystal() -> Image.Image:
    raw = crop_alpha(Image.open(SOURCE_DIR / "forest-crystal-alpha-raw.png"))
    return fit_on_canvas(raw, (512, 512), 36)


def checkerboard(size: tuple[int, int], cell: int = 24) -> Image.Image:
    image = Image.new("RGBA", size, "#e7e7e7")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#bfc3c7")
    return image


def add_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    font: ImageFont.FreeTypeFont,
    color: str,
    *,
    anchor: str = "la",
    stroke_width: int = 1,
) -> None:
    draw.text(
        xy,
        value,
        font=font,
        fill=color,
        anchor=anchor,
        stroke_width=stroke_width,
        stroke_fill="#17120d",
    )


def build_preview(frame: Image.Image, button: Image.Image, crystal: Image.Image) -> None:
    preview = checkerboard((1400, 820))
    preview.alpha_composite(frame, (55, 55))
    preview.alpha_composite(button, (850, 250))

    zyx_sheet = Image.open(
        REPO_ROOT / "public/assets/sprites/spritesheet-zyx-transparent2.webp"
    ).convert("RGBA")
    zyx = zyx_sheet.crop((0, 0, 341, 341)).resize((205, 205), Image.Resampling.LANCZOS)
    preview.alpha_composite(zyx, (105, 112))

    draw = ImageDraw.Draw(preview)
    add_text(
        draw,
        (345, 143),
        "ZYX",
        ImageFont.truetype(GEORGIA_BOLD, 30),
        "#77dff1",
        stroke_width=2,
    )
    add_text(
        draw,
        (345, 190),
        "To je Krystal lesa! Přesně takovou energii",
        ImageFont.truetype(GEORGIA, 22),
        "#f3ead2",
    )
    add_text(
        draw,
        (345, 226),
        "potřebuje ovládací stroj.",
        ImageFont.truetype(GEORGIA, 22),
        "#f3ead2",
    )
    add_text(
        draw,
        (1055, 331),
        "UKÁZAT STROJ",
        ImageFont.truetype(GEORGIA_BOLD, 17),
        "#f7e7b0",
        anchor="mm",
        stroke_width=2,
    )

    preview.alpha_composite(crystal, (460, 315))
    preview.save(HERE / "isolated-assets-preview.png")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    frame = normalize_dialog_frame()
    button = normalize_button()
    crystal = normalize_crystal()

    frame.save(OUTPUT_DIR / "zyx-dialog-frame.png")
    button.save(OUTPUT_DIR / "zyx-dialog-action-frame.png")
    crystal.save(OUTPUT_DIR / "forest-crystal.png")
    build_preview(frame, button, crystal)


if __name__ == "__main__":
    main()
