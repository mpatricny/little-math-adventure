from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]

GEORGIA = "/System/Library/Fonts/Supplemental/Georgia.ttf"
GEORGIA_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

CREAM = "#f3ead2"
GOLD = "#f7e7b0"
CYAN = "#77dff1"
INK = "#17120d"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    typeface: ImageFont.FreeTypeFont,
    fill: str,
    *,
    anchor: str = "mm",
    stroke_width: int = 2,
) -> None:
    draw.text(
        xy,
        value,
        font=typeface,
        fill=fill,
        anchor=anchor,
        stroke_width=stroke_width,
        stroke_fill=INK,
    )


def base(name: str) -> Image.Image:
    return Image.open(HERE / name).convert("RGBA").resize((1280, 720), Image.Resampling.LANCZOS)


def render_reward() -> None:
    image = base("01-forest-crystal-reward-concept.png")
    draw = ImageDraw.Draw(image)

    text(draw, (640, 49), "KRYSTAL LESA", font(GEORGIA_BOLD, 34), GOLD)
    text(
        draw,
        (635, 580),
        "Síla lesa se spojila do jediného krystalu.",
        font(GEORGIA, 22),
        CREAM,
    )
    text(draw, (635, 617), "Zanes ho Zyxovi.", font(GEORGIA, 21), CREAM)
    text(draw, (1095, 662), "DÁLE", font(ARIAL_BOLD, 18), GOLD)

    image.save(HERE / "01-forest-crystal-reward-mock.png")


def zyx_portrait() -> Image.Image:
    sheet = Image.open(REPO_ROOT / "public/assets/sprites/spritesheet-zyx-transparent2.webp").convert("RGBA")
    portrait = sheet.crop((0, 0, 341, 341)).resize((132, 132), Image.Resampling.LANCZOS)
    mask = Image.new("L", portrait.size, 0)
    ImageDraw.Draw(mask).ellipse((1, 1, 130, 130), fill=255)
    portrait.putalpha(Image.composite(portrait.getchannel("A"), Image.new("L", portrait.size, 0), mask))
    return portrait


def render_rocket() -> None:
    image = base("02-zyx-rocket-interlude-concept.png")
    image.alpha_composite(zyx_portrait(), (158, 511))
    draw = ImageDraw.Draw(image)

    text(draw, (325, 553), "ZYX", font(GEORGIA_BOLD, 26), CYAN, anchor="lm")
    text(
        draw,
        (325, 589),
        "To je Krystal lesa! Přesně takovou energii",
        font(GEORGIA, 20),
        CREAM,
        anchor="lm",
        stroke_width=1,
    )
    text(
        draw,
        (325, 620),
        "potřebuje ovládací stroj.",
        font(GEORGIA, 20),
        CREAM,
        anchor="lm",
        stroke_width=1,
    )
    text(draw, (906, 664), "UKÁZAT STROJ", font(ARIAL_BOLD, 15), GOLD)

    image.save(HERE / "02-zyx-rocket-interlude-mock.png")


def render_machine() -> None:
    image = base("03-crystal-machine-puzzle-concept.png")
    draw = ImageDraw.Draw(image)

    text(draw, (640, 40), "OVLÁDACÍ JÁDRO", font(GEORGIA_BOLD, 31), GOLD)

    for position, value in [((397, 366), "8"), ((638, 366), "6"), ((872, 366), "4")]:
        text(draw, position, value, font(ARIAL_BOLD, 46), CREAM)

    text(draw, (510, 366), "+", font(ARIAL_BOLD, 34), "#8fe8ff")
    text(draw, (755, 366), "−", font(ARIAL_BOLD, 34), "#8fe8ff")
    text(draw, (1005, 366), "=", font(ARIAL_BOLD, 29), "#8fe8ff")
    text(draw, (1105, 366), "10", font(ARIAL_BOLD, 38), GOLD)

    for position, value in [((412, 605), "4"), ((552, 605), "6"), ((690, 605), "8"), ((824, 605), "9")]:
        text(draw, position, value, font(ARIAL_BOLD, 32), CREAM)

    text(draw, (1102, 608), "AKTIVOVAT", font(ARIAL_BOLD, 17), GOLD)

    image.save(HERE / "03-crystal-machine-puzzle-mock.png")


if __name__ == "__main__":
    render_reward()
    render_rocket()
    render_machine()
