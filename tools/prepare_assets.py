"""Converts raw Figma exports (figma-src/) into optimized game sprites (src/assets/).

Run: python tools/prepare_assets.py
"""
import os
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "figma-src")
OUT = os.path.join(ROOT, "src", "assets")

# The card front is exported tilted; Figma's final state rotates it back by -11.38deg.
FRONT_TILT = 11.38
# Inner face of the upright front (inside the gold frame and the thin inner line), in pixels
# of the upright 505x670 card: left, top, right, bottom insets and corner radius.
FACE_INSET = (46, 42, 43, 40)
FACE_RADIUS = 20


def src(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def save(img, name, quality=82):
    path = os.path.join(OUT, name)
    img.save(path, "WEBP", quality=quality, method=6)
    print(f"{name:22s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024} KB")


def cover(img, w, h):
    """Same as CSS object-fit: cover."""
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((l, t, l + w, t + h))


def clean_svg(name):
    s = open(os.path.join(SRC, name), encoding="utf-8").read()
    s = re.sub(r' (style="display: block;"|overflow="visible"|preserveAspectRatio="none")', "", s)
    open(os.path.join(OUT, name), "w", encoding="utf-8").write(s)
    print(f"{name:22s} svg  {len(s) // 1024} KB")


def main():
    os.makedirs(OUT, exist_ok=True)

    # Figma BG box 1158x2074, object-cover
    save(cover(Image.open(os.path.join(SRC, "bg.jpeg")).convert("RGB"), 1158, 2074), "bg.webp", 72)

    # Card back: crop to the visible card (the export has a transparent margin)
    back = src("card_back.png")
    back = back.crop(back.getbbox())
    save(back.resize((520, round(520 * back.height / back.width)), Image.LANCZOS), "card_back.webp", 86)

    # Card front: rotate upright, crop, and cut out the inner face. The face (glow + rays + the
    # "BONO: 5000 MXN" lettering baked into the art) is rebuilt in CSS so the amount is live text.
    front = src("card_front.png").rotate(FRONT_TILT, resample=Image.BICUBIC, expand=True)
    front = front.crop(front.getbbox())
    l, t, r, b = FACE_INSET
    hole = Image.new("L", front.size, 0)
    ImageDraw.Draw(hole).rounded_rectangle((l, t, front.width - r, front.height - b), FACE_RADIUS, fill=255)
    hole = hole.filter(ImageFilter.GaussianBlur(1))
    a = np.asarray(front.getchannel("A"), np.float32) * (1 - np.asarray(hole, np.float32) / 255)
    front.putalpha(Image.fromarray(a.astype(np.uint8)))
    save(front, "card_frame.webp", 88)
    print(f"  upright front card {front.size}")

    save(src("button.png"), "button.webp", 90)
    save(src("hand.png"), "hand.webp", 88)
    clean_svg("plate.svg")
    clean_svg("logo.svg")


if __name__ == "__main__":
    main()
