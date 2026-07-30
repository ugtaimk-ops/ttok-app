from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets-src")
os.makedirs(OUT_DIR, exist_ok=True)

BG = (79, 70, 229)  # indigo
FG = (255, 255, 255)

def make_icon(size, path, text="똑"):
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    font_size = int(size * 0.5)
    font = None
    for candidate in [
        "malgun.ttf",
        "C:\\Windows\\Fonts\\malgun.ttf",
        "C:\\Windows\\Fonts\\malgunbd.ttf",
    ]:
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, fill=FG, font=font)
    img.save(path, "PNG")

def make_splash(size, path, text="똑"):
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    font_size = int(size * 0.18)
    font = None
    for candidate in ["malgun.ttf", "C:\\Windows\\Fonts\\malgun.ttf", "C:\\Windows\\Fonts\\malgunbd.ttf"]:
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, fill=FG, font=font)
    img.save(path, "PNG")

make_icon(1024, os.path.join(OUT_DIR, "icon.png"))
make_splash(2732, os.path.join(OUT_DIR, "splash.png"))
print("done")
