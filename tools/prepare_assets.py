"""Converts raw Figma exports (figma-src/) into optimized game sprites (src/assets/).

Run: python tools/prepare_assets.py
"""
import os
import re

import numpy as np
from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "figma-src")
OUT = os.path.join(ROOT, "src", "assets")

# The four pinata stages (whole, 1-3 strikes) are exported on the same 1024x1536 canvas and
# shown at 660x990 (Figma). Stages 1-3 sit 2 px higher than the whole one.
PINATA_SCALE = 660 / 1024
PINATA_CROP = (100, 0, 992, 1290)  # union of the stages' visible pixels
# Single coins falling out of the bursting pinata art (boxes in pinata_final.png): they become
# the coin particles, so the flying coins are the same coins as in the picture.
COIN_BOXES = [(24, 1124, 164, 1268), (194, 1182, 324, 1317), (384, 1172, 503, 1317),
              (462, 1284, 632, 1482), (644, 1149, 796, 1331), (786, 1304, 904, 1446),
              (746, 1084, 874, 1217), (84, 675, 194, 763), (874, 811, 956, 921)]
COIN_CELL = 192


def src(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def save(img, name, quality=82):
    path = os.path.join(OUT, name)
    img.save(path, "WEBP", quality=quality, method=6)
    print(f"{name:20s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024} KB")


def scaled(img, k):
    return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)


def clean_svg(name):
    s = open(os.path.join(SRC, name), encoding="utf-8").read()
    s = re.sub(r' (style="display: block;"|overflow="visible"|preserveAspectRatio="none")', "", s)
    open(os.path.join(OUT, name), "w", encoding="utf-8").write(s)
    print(f"{name:20s} svg  {len(s) // 1024} KB")


def largest_blob(mask):
    """Largest 4-connected region of a boolean mask."""
    h, w = mask.shape
    lab = np.zeros(mask.shape, np.int32)
    best, best_n, n = 0, 0, 0
    for y, x in zip(*np.nonzero(mask)):
        if lab[y, x]:
            continue
        n += 1
        lab[y, x] = n
        q, cnt = deque([(y, x)]), 0
        while q:
            cy, cx = q.popleft()
            cnt += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    q.append((ny, nx))
        if cnt > best:
            best, best_n = cnt, n
    return lab == best_n


def hull(points):
    """Convex hull (monotone chain) of (x, y) points."""
    pts = sorted(set(points))
    def half(seq):
        out = []
        for p in seq:
            while len(out) >= 2 and (out[-1][0] - out[-2][0]) * (p[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (p[0] - out[-2][0]) <= 0:
                out.pop()
            out.append(p)
        return out
    lo, hi = half(pts), half(pts[::-1])
    return lo[:-1] + hi[:-1]


def coin_sheet(art):
    """Cut the single flying coins out of the burst art: the gold pixels of the box, its
    largest blob, filled out to its convex outline (a coin is convex), on a strip of cells."""
    sheet = Image.new("RGBA", (COIN_CELL * len(COIN_BOXES), COIN_CELL), (0, 0, 0, 0))
    for i, box in enumerate(COIN_BOXES):
        c = art.crop(box)
        a = np.asarray(c).astype(np.float32)
        r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
        mx = a[..., :3].max(2)
        sat = (mx - a[..., :3].min(2)) / np.maximum(mx, 1)
        gold = (r >= g) & (g >= b * 0.9) & (al > 128) & (((sat > 0.3) & (mx > 70)) | (mx > 235))
        blob = largest_blob(gold)
        ys, xs = np.nonzero(blob)
        m = Image.new("L", c.size, 0)
        ImageDraw.Draw(m).polygon(hull(list(zip(xs.tolist(), ys.tolist()))), fill=255)
        m = ImageChops.multiply(m.filter(ImageFilter.GaussianBlur(0.7)), c.getchannel("A"))
        c.putalpha(m)
        c = c.crop(c.getbbox())
        sheet.alpha_composite(c, (i * COIN_CELL + (COIN_CELL - c.width) // 2, (COIN_CELL - c.height) // 2))
    return sheet


def ends(img):
    """Grip end (bottom-left extreme) and head tip (top-right extreme) of a diagonal weapon,
    as fractions of the sprite box."""
    a = np.asarray(img.getchannel("A")) > 128
    ys, xs = np.nonzero(a)
    g, t = np.argmin(xs - ys), np.argmax(xs - ys)
    return (xs[g] / img.width, ys[g] / img.height), (xs[t] / img.width, ys[t] / img.height)


def crack_layers(base, stage, k):
    """What a strike adds to the pinata: the changed pixels of the stage (cracks, chips,
    debris) as an overlay over the whole pinata, and a soft glow of its hot, glowing cracks."""
    b = np.asarray(base).astype(np.int16)
    s = np.asarray(stage).astype(np.int16)
    diff = np.abs(s[..., :3] - b[..., :3]).max(2) * (s[..., 3] > 0) + np.abs(s[..., 3] - b[..., 3])
    m = Image.fromarray(((diff > 42) * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(2.5))
    over = stage.copy()
    over.putalpha(ImageChops.multiply(stage.getchannel("A"), m))
    save(over, f"crack{k}.webp", 86)

    # the art's cracks glow yellow-orange inside: light them up a bit more, additively
    # (only freshly changed, very bright warm pixels: not the yellow stripes or the rope)
    hot = (s[..., 0] > 240) & (s[..., 1] > 180) & (s[..., 2] < 150) & (diff > 90)
    hot = Image.fromarray((hot * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    g = hot.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(9))
    ga = np.minimum(255, np.asarray(g).astype(np.float32) * 2.2).astype(np.uint8)
    glow = Image.new("RGBA", stage.size, (255, 196, 64, 0))
    glow.putalpha(Image.fromarray(ga))
    save(scaled(glow, 0.5), f"glow{k}.webp", 80)


def main():
    os.makedirs(OUT, exist_ok=True)

    # Background: 1089x1950 in Figma, exported at 937x1678 (same ratio), shown stretched
    save(Image.open(os.path.join(SRC, "bg.png")).convert("RGB"), "bg.webp", 74)

    rope = src("rope.png")
    rope = rope.crop(rope.getbbox())
    save(scaled(rope, 0.5), "rope.webp", 82)

    # Pinata: whole + crack overlays for strikes 1-3, all on one crop box at display size
    whole = src("pinata_0.png")
    whole = ImageChops.offset(whole, 0, -2)  # align with the struck stages
    base = scaled(whole.crop(PINATA_CROP), PINATA_SCALE)
    save(base, "pinata.webp", 86)
    for k in (1, 2, 3):
        crack_layers(base, scaled(src(f"pinata_{k}.png").crop(PINATA_CROP), PINATA_SCALE), k)

    # 4th strike: the bursting pinata with coins pouring out (its last state)
    burst = src("pinata_final.png")
    print("  burst bbox", burst.getbbox())
    save(scaled(burst.crop(burst.getbbox()), 700 / 1024), "burst.webp", 84)
    save(coin_sheet(burst), "coin.webp", 86)

    # Weapons: cropped; grip end and head tip printed for the swing pivot in game.js
    for name, frame in (("bat", 1271), ("golf", 1254), ("hammer", 1254)):
        w = src(name + ".png")
        bb = w.getbbox()
        w = w.crop(bb)
        g, t = ends(w)
        print(f"  {name}: bbox {bb} of {frame}, grip {g[0]:.3f},{g[1]:.3f} tip {t[0]:.3f},{t[1]:.3f}")
        save(scaled(w, 0.5), name + ".webp", 86)

    # Pointer hand with its Figma drop shadow (0 15px 25px rgba(0,0,0,.5) at 284 px) baked in
    p = src("pointer.png")
    k = 300 / p.width
    p = scaled(p.crop(p.getbbox()), k)
    pad = 40
    shadow = Image.new("L", (p.width + 2 * pad, p.height + 2 * pad), 0)
    shadow.paste(p.getchannel("A").point(lambda v: v // 2), (pad, pad + 16))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    hand = Image.new("RGBA", shadow.size, (0, 0, 0, 0))
    hand.putalpha(shadow)
    hand.alpha_composite(p, (pad, pad))
    a = np.asarray(p.getchannel("A")) > 128
    ys, xs = np.nonzero(a)
    tip = (xs[np.argmin(ys)] + pad, ys.min() + pad)
    print(f"  pointer {hand.size}, fingertip {tip}")
    save(hand, "hand.webp", 86)

    save(scaled(src("coins.png"), 640 / 1536), "coins.webp", 84)
    # Golden dust: sparkles on black, shown with "lighten" in Figma. Turn the black into
    # transparency (alpha = brightness, colour un-premultiplied) so no blend mode is needed.
    d = np.asarray(src("golden_dust.png").convert("RGB")).astype(np.float32)
    a = d.max(2)
    a = np.where(a < 16, 0, a)  # drop the near-black noise
    rgb = np.where(a[..., None] > 0, d * 255 / np.maximum(a, 1)[..., None], 0)
    dust = Image.fromarray(np.dstack([rgb, a]).clip(0, 255).astype(np.uint8), "RGBA")
    save(scaled(dust, 0.5), "dust.webp", 80)
    clean_svg("logo.svg")


if __name__ == "__main__":
    main()
