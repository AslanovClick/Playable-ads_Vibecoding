"""Converts raw Figma exports (figma-src/) into optimized game sprites (src/assets/).

Run: python tools/prepare_assets.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "figma-src")
OUT = os.path.join(ROOT, "src", "assets")

# Panel ("element") size in stage pixels, as placed in Figma.
PANEL_W, PANEL_H = 887, 393
# Slot centres inside the panel, measured from the empty panel holes.
SLOTS = [(148, 186), (443, 186), (738, 186)]
COIN_R = 100  # coin + orange halo radius
CHECK_BOX = lambda sx, sy: (sx + 5, sy - 125, sx + 115, sy - 28)  # noqa: E731
BROKEN_R = 74  # cracked coin body radius

# Lock dial inside safe_closed.png (native pixels). The dial is painted in perspective:
# the dial face (tick ring + spokes) is an ellipse fitted on the tick marks, while the raised
# hub with the logo sits off that centre. The face rotates, the hub stays.
FACE_CX, FACE_CY = 354.6, 280.0
FACE_RX, FACE_RY = 84.4, 92.1  # ellipse through the middle of the tick marks
FACE_OUT = 1.16  # outer cut = dark groove behind the ticks
HUB_CX, HUB_CY, HUB_RX, HUB_RY = 371.0, 281.5, 63.0, 73.0
SPOKE_ANGLES = (-85.5, 28.0, 135.8)  # where the spokes leave the hub, around the face centre


def src(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def save(img, name, quality=82, lossless=False):
    path = os.path.join(OUT, name)
    img.save(path, "WEBP", quality=quality, method=6, lossless=lossless)
    print(f"{name:22s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024} KB")


def cover(img, w, h):
    """Same as CSS object-fit: cover."""
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((l, t, l + w, t + h))


def circle_mask(size, cx, cy, r_out, feather=2.5, r_in=None):
    """Anti-aliased (annulus) mask with soft edges."""
    m = Image.new("L", size, 0)
    px = m.load()
    for y in range(size[1]):
        for x in range(size[0]):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            a = min(1.0, max(0.0, (r_out - d) / feather))
            if r_in is not None:
                a *= min(1.0, max(0.0, (d - r_in) / feather))
            px[x, y] = int(a * 255)
    return m


def isolate(full, base, k=40.0):
    """Returns a layer L such that `L over base == full`, transparent where they match."""
    fp, bp = full.load(), base.load()
    out = Image.new("RGBA", full.size)
    op = out.load()
    for y in range(full.height):
        for x in range(full.width):
            f, b = fp[x, y], bp[x, y]
            d = max(abs(f[i] - b[i]) for i in range(3))
            a = min(1.0, d / k)
            if a <= 0.02:
                op[x, y] = (0, 0, 0, 0)
                continue
            c = tuple(max(0, min(255, round(b[i] + (f[i] - b[i]) / a))) for i in range(3))
            op[x, y] = c + (round(a * 255),)
    return out


def bilinear(img, x, y):
    """Samples an HxWx4 float array at float coordinates (pixel centres at +0.5)."""
    x = np.clip(x - 0.5, 0, img.shape[1] - 1.001)
    y = np.clip(y - 0.5, 0, img.shape[0] - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def make_dial(closed):
    """face.webp: rotating dial face, un-skewed to a circle (CSS squeezes it back with scaleX).
    hub.webp: static raised hub with the logo, drawn on top of the face."""
    img = np.asarray(closed).astype(np.float32)
    k = FACE_RY / FACE_RX  # horizontal stretch that turns the face ellipse into a circle
    R = FACE_RY * FACE_OUT
    S = 2 * math.ceil(R + 4)
    j, i = np.mgrid[0:S, 0:S].astype(np.float32)
    u, v = i + 0.5 - S / 2, j + 0.5 - S / 2

    def to_img(u, v):
        return FACE_CX + u / k, FACE_CY + v

    def in_hub(x, y, grow):
        return ((x - HUB_CX) / (HUB_RX + grow)) ** 2 + ((y - HUB_CY) / (HUB_RY + grow)) ** 2 < 1

    # The part of the face hidden under the hub must look the same at any angle, otherwise it
    # peeks out eccentrically while the face turns. Work in polar coordinates around the face
    # centre: fill hidden pixels with the angular median of the recess at the same radius
    # (rotation-invariant), and only continue the three spokes radially under the hub.
    DR, NT = 0.5, 1440
    rs = np.arange(0, R + 2, DR, dtype=np.float32)
    ts = np.linspace(0, 2 * np.pi, NT, endpoint=False, dtype=np.float32)
    pr, pt = np.meshgrid(rs, ts, indexing="ij")
    px, py = to_img(pr * np.cos(pt), pr * np.sin(pt))
    P = bilinear(img, px, py)
    hidden = in_hub(px, py, 4)
    edge = np.argmax(~hidden, axis=0)  # first visible radius index per angle
    med = np.full((len(rs), 4), np.nan, np.float32)
    for ri in range(len(rs)):
        vis = ~hidden[ri]
        if vis.sum() >= 40:
            med[ri] = np.median(P[ri, vis], axis=0)
    first = int(np.argmax(~np.isnan(med[:, 0])))
    med[:first] = med[first]
    bi = np.minimum(edge + int(4 / DR), len(rs) - 1)
    boundary = P[bi, np.arange(NT)]
    spoke = np.zeros(NT, bool)  # angular width of the three spokes where they leave the hub
    for deg in SPOKE_ANGLES:
        spoke |= np.abs((np.degrees(ts) - deg + 180) % 360 - 180) < 7.5
    fill = np.where(spoke[None, :, None], boundary[None], med[:, None])
    # soften the step between the real recess and the fill near the hub edge
    w = np.clip((edge[None, :] - np.arange(len(rs))[:, None]) * DR / 6, 0, 1)[..., None]
    fill = boundary[None] * (1 - w) + fill * w
    Pf = np.where(hidden[..., None], fill, P)

    rho = np.hypot(u, v)
    theta = np.mod(np.arctan2(v, u), 2 * np.pi)
    face = bilinear(img, *to_img(u, v))
    ri, ti = rho / DR, theta / (2 * np.pi) * NT
    r0, t0 = np.floor(ri).astype(int), np.floor(ti).astype(int)
    fr, ft = (ri - r0)[..., None], (ti - t0)[..., None]
    r0 = np.clip(r0, 0, len(rs) - 2)
    t1 = (t0 + 1) % NT
    t0 %= NT
    polar = (Pf[r0, t0] * (1 - fr) * (1 - ft) + Pf[r0 + 1, t0] * fr * (1 - ft)
             + Pf[r0, t1] * (1 - fr) * ft + Pf[r0 + 1, t1] * fr * ft)
    face = np.where(in_hub(*to_img(u, v), 4)[..., None], polar, face)
    face[..., 3] *= np.clip((R - rho) / 3, 0, 1)
    save(Image.fromarray(face.round().astype(np.uint8), "RGBA"), "face.webp", quality=90)

    W, H = closed.size
    print(f"  #face  left {(FACE_CX - S / 2) / W * 100:.3f}%  top {(FACE_CY - S / 2) / H * 100:.3f}%"
          f"  width {S / W * 100:.3f}%  height {S / H * 100:.3f}%  scaleX({1 / k:.4f})")

    pad = 4
    box = (int(HUB_CX - HUB_RX - pad), int(HUB_CY - HUB_RY - pad),
           math.ceil(HUB_CX + HUB_RX + pad), math.ceil(HUB_CY + HUB_RY + pad))
    hub_img = closed.crop(box)
    yy, xx = np.mgrid[0:hub_img.height, 0:hub_img.width].astype(np.float32) + 0.5
    d = np.sqrt(((xx + box[0] - HUB_CX) / HUB_RX) ** 2 + ((yy + box[1] - HUB_CY) / HUB_RY) ** 2)
    a = np.clip((1 - d) * min(HUB_RX, HUB_RY) / 2.5, 0, 1)
    hub_img.putalpha(Image.fromarray((np.asarray(hub_img.getchannel("A")) * a).astype(np.uint8)))
    save(hub_img, "hub.webp", quality=90)
    print(f"  #hub   left {box[0] / W * 100:.3f}%  top {box[1] / H * 100:.3f}%"
          f"  width {(box[2] - box[0]) / W * 100:.3f}%  height {(box[3] - box[1]) / H * 100:.3f}%")


def main():
    os.makedirs(OUT, exist_ok=True)

    # --- background (Figma: 1150x2060 box, object-cover) ---
    bg = cover(Image.open(os.path.join(SRC, "bg.jpeg")).convert("RGB"), 1150, 2060)
    save(bg, "bg.webp", quality=72)

    # --- safe ---
    closed, opened = src("safe_closed.png"), src("safe_open.png")
    save(closed, "safe_closed.webp", quality=85)
    save(opened, "safe_open.webp", quality=85)

    make_dial(closed)

    # --- panel with 3 slots ---
    empty = cover(src("panel_empty.png"), PANEL_W, PANEL_H)
    full = cover(src("panel_full.png"), PANEL_W, PANEL_H)
    save(empty, "panel.webp", quality=85)

    layer = isolate(full, empty)
    lp = layer.load()
    # Green check marks (and their green glow) -> own layer, so they can "stamp" in.
    checks = Image.new("RGBA", layer.size)
    cp = checks.load()
    for y in range(layer.height):
        for x in range(layer.width):
            r, g, b, a = lp[x, y]
            green = (g - max(r, b)) / 60.0
            if a and green > 0:
                w = min(1.0, green)
                cp[x, y] = (r, g, b, round(a * w))
                lp[x, y] = (r, g, b, round(a * (1 - w)))
    # Keep only the check boxes (the rest is noise from slightly different panel crops).
    keep = Image.new("L", checks.size, 0)
    for sx, sy in SLOTS:
        ImageDraw.Draw(keep).rectangle(CHECK_BOX(sx, sy), fill=255)
    checks.putalpha(ImageChops.multiply(checks.getchannel("A"), keep))

    # The check covered the coin's top-right part: patch that bite with the mirrored
    # (top-left) half of the same coin, which is nearly symmetric.
    ckp = checks.load()
    for sx, sy in SLOTS:
        for y in range(sy - COIN_R, sy + 1):
            for x in range(sx, sx + COIN_R):
                if ckp[x, y][3] and math.hypot(x - sx, y - sy) < COIN_R:
                    mx = 2 * sx - x
                    lp[x, y] = lp[mx, y]

    # Coins (+ halo) vs. the glowing progress bar between them.
    coin_mask = Image.new("L", layer.size, 0)
    for sx, sy in SLOTS:
        coin_mask = ImageChops.lighter(coin_mask, circle_mask(layer.size, sx, sy, COIN_R, 14))
    coins = layer.copy()
    coins.putalpha(ImageChops.multiply(layer.getchannel("A"), coin_mask))
    # Bar = only the capsule track; the panel frame differs slightly between Figma variants.
    track = Image.new("L", layer.size, 0)
    ImageDraw.Draw(track).rounded_rectangle((22, 146, 866, 226), radius=40, fill=255)
    track = track.filter(ImageFilter.GaussianBlur(6))
    bar = layer.copy()
    bar.putalpha(ImageChops.multiply(ImageChops.multiply(layer.getchannel("A"), ImageChops.invert(coin_mask)), track))
    save(coins, "coins.webp", quality=88)
    save(checks, "checks.webp", quality=88)
    save(bar, "bar.webp", quality=88)

    # Broken (cracked) coin from the "Taps left: 1" variant, slot 1 only, coin body without halo.
    v2 = cover(src("panel_variant2.png"), PANEL_W, PANEL_H)
    broken = v2.copy()
    sx, sy = SLOTS[0]
    broken.putalpha(circle_mask(broken.size, sx, sy, BROKEN_R, 3))
    save(broken.crop((sx - COIN_R, sy - COIN_R, sx + COIN_R, sy + COIN_R)), "coin_broken.webp", quality=88)

    # --- props ---
    save(src("gold_stack.png"), "gold_stack.webp", quality=85)
    save(src("gold_bar.png"), "gold_bar.webp", quality=85)
    save(src("hand.png"), "hand.webp", quality=88)
    save(src("button.png"), "button.webp", quality=90)


if __name__ == "__main__":
    main()
