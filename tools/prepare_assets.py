"""Prepares everything the playable embeds: re-encoded video clips and the UI images.

    python tools/prepare_assets.py                 # 720 px wide, CRF 29 (~6.7 MB of video)
    python tools/prepare_assets.py --width 540 --crf 31   # fits a 5 MB network limit, softer
    python tools/prepare_assets.py --only images   # skip the (slow) video encode

Sources:
  src/animations/*.mp4  the clips from the animator, "1-<scene> - Choose My Look - <dress>"
                        scene: 1 intro, 2 wears the dress, 3 turns around, 4 back loop (not used),
                               5 unzip, 6 final loop for the chat
                        dress: 1 red, 2 black, 3 burgundy (scene 1 has two clips: 1 intro, 2 choose)
  figma-src/            dress pictures, Ruby's portrait and the logo exported from Figma

Needs ffmpeg: either on PATH or the one from `pip install imageio-ffmpeg`.
"""
import argparse, re, shutil, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ANIM = ROOT / "src" / "animations"
FIG = ROOT / "figma-src"
OUT_V = ROOT / "src" / "video"
OUT_A = ROOT / "src" / "assets"

DRESSES = {"1": "red", "2": "black", "3": "burgundy"}
# the swipe scrubs the first ~1.7 s, then it plays on at normal speed for 1.5 s, then the fade to the chat
UNZIP_SECONDS = 4.2  # with a margin, so the last frame never freezes before the cut
SCENES = {"2": "wear", "3": "turn", "5": "unzip", "6": "chat"}  # 4 (idle with her back turned) is not used


def ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def clips():
    """(source file, output name) for every clip."""
    for f in sorted(ANIM.glob("*.mp4")):
        m = re.match(r"1-(\d) - Choose My Look - (\d)", f.name)
        if not m:
            continue
        scene, n = m.groups()
        if scene == "4":
            continue
        if scene == "1":
            yield f, "intro" if n == "1" else "choose"
        else:
            yield f, f"{SCENES[scene]}_{DRESSES[n]}"


def encode_videos(width, crf, only=None):
    OUT_V.mkdir(parents=True, exist_ok=True)
    ff = ffmpeg()
    total = 0
    for src, name in clips():
        if only and not name.startswith(only):
            continue
        out = OUT_V / f"{name}.mp4"
        args = [ff, "-v", "error", "-y", "-i", str(src), "-an",
                "-vf", f"scale={width}:-2:flags=lanczos,setsar=1",
                "-c:v", "libx264", "-preset", "slow", "-tune", "film", "-crf", str(crf),
                "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart"]
        if name.startswith("unzip"):
            # scrubbed by the finger: a keyframe every 6 frames keeps seeking cheap
            args += ["-t", str(UNZIP_SECONDS), "-g", "6", "-keyint_min", "1", "-bf", "0"]
        subprocess.run(args + [str(out)], check=True)
        size = out.stat().st_size
        total += size
        print(f"  {name:16s} {size / 1024:7.0f} KB")
    print(f"video total {total / 1024:.0f} KB")

    # first frame of the intro: shown until the video starts (and if autoplay is blocked)
    subprocess.run([ff, "-v", "error", "-y", "-i", str(OUT_V / "intro.mp4"), "-frames:v", "1",
                    str(OUT_A / "_poster.png")], check=True)
    Image.open(OUT_A / "_poster.png").save(OUT_A / "poster.webp", quality=70, method=6)
    (OUT_A / "_poster.png").unlink()


def prepare_images():
    OUT_A.mkdir(parents=True, exist_ok=True)

    # dresses: trimmed to their pixels, fitted into the card picture box (2x of 270x340)
    for name in ("black", "burgundy", "red"):
        im = Image.open(FIG / f"dress_{name}.png").convert("RGBA")
        im = im.crop(im.getbbox())
        im.thumbnail((540, 680), Image.LANCZOS)
        im.save(OUT_A / f"dress_{name}.webp", quality=82, method=6)
        print("  dress", name, im.size)

    # Ruby's avatar: the face circle of the Figma mask (59 px circle on a 111x196 picture at 31,17)
    src = Image.open(FIG / "ruby.png").convert("RGB")
    k = src.width / 111
    box = [round(31 * k), round(17 * k), round(90 * k), round(76 * k)]
    face = src.crop(box).resize((180, 180), Image.LANCZOS)
    mask = Image.new("L", (720, 720), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 719, 719], fill=255)
    mask = mask.resize((180, 180), Image.LANCZOS)
    face.putalpha(mask)
    face.save(OUT_A / "ruby.webp", quality=85, method=6)

    # logo: keep only the "EVA AI" wordmark and the eye, white, without the Figma canvas around it
    svg = (FIG / "logo.svg").read_text(encoding="utf-8")
    comp = svg[svg.index('<g id="Component 1">'):]
    paths = re.findall(r'<path[^>]*?\sd="([^"]+)"', comp)
    body = "".join(f'<path fill="#fff" fill-rule="evenodd" d="{d}"/>' for d in paths)
    (OUT_A / "logo.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 426 100">{body}</svg>', encoding="utf-8")
    print("  logo paths", len(paths))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=720)
    ap.add_argument("--crf", type=int, default=29)
    ap.add_argument("--only", choices=["video", "images", "unzip"])  # unzip: just the zipper clips
    a = ap.parse_args()
    if a.only not in ("video", "unzip"):
        prepare_images()
    if a.only not in ("images",):
        encode_videos(a.width, a.crf, "unzip" if a.only == "unzip" else None)
