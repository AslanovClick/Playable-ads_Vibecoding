"""Prepares everything the playable embeds, from the animator's delivery.

    python tools/prepare_assets.py                 # clips + images
    python tools/prepare_assets.py --only video --width 720 --crf 33
    python tools/prepare_assets.py --only images

Videos: the clips in src/EVA AI Playable Ads #3/ (or a file named after the slot in
src/animations/, which wins) are re-encoded to src/video/<slot>.mp4 (720 px, H.264; the voiced
ones keep their audio as mono AAC, 48 kbit/s). DELIVERY below says which file fills which slot.

Images: the first frame of the intro clip becomes src/assets/poster.webp (shown under the videos
until the first frame is decoded), and her face from the close-up idle becomes the round chat
avatar maya_ava.webp.

Needs ffmpeg: on PATH or from `pip install imageio-ffmpeg`.
"""
import argparse, shutil, subprocess
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ANIM = ROOT / "src" / "animations"
OUT_A = ROOT / "src" / "assets"
OUT_V = ROOT / "src" / "video"

DELIVERED = ROOT / "src" / "EVA AI Playable Ads #3"
# slot: (file in the delivery, without " CRF 30.mp4"; keep its audio)
DELIVERY = {
    "intro": ("Step_1_shh loop_no sound", False),       # start: "shh", finger on her lips (loop); the first tap lets the sound in
    "hook": ("Step_1_hair tuck_sound", True),          # S1: hair behind the ear, "Can I be your little secret…"
    "idle1": ("Step_1_idle loop_no sound", False),     # S1: waits for the first reply
    "behave": ("Step_2-1_eyebrow raise_no sound", False),
    "maybe": ("Step_2-2_laugh lean_sound", True),      # a quiet laugh, leans in
    "tension": ("Step_2-3_good girl line_sound", True),  # pushes in: "Now tell me… should I be a good girl…"
    "idle2": ("Step_2-4_idle loop_no sound", False),   # chest and face, waits for the second reply
    "bad": ("Step_3-1_bad side look_no sound", False),
    "tease": ("Step_3-2_collarbone tease_no sound", False),
    "final": ("Step_4-1_midnight line_sound", True),   # chin on hand: "It's past midnight…"
    "cta": ("Step_4-2_idle loop_sound", False),        # the take that follows the voiced midnight line (it has no audio)
}
SLOTS = list(DELIVERY)


def ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def frame(src, t):
    raw = subprocess.run([ffmpeg(), "-v", "error", "-ss", str(t), "-i", str(src), "-frames:v", "1",
                          "-f", "image2pipe", "-c:v", "png", "-"], capture_output=True, check=True).stdout
    import io
    return Image.open(io.BytesIO(raw)).convert("RGB")


def clip_src(slot):
    own = ANIM / f"{slot}.mp4"
    return own if own.exists() else DELIVERED / f"{DELIVERY[slot][0]} CRF 30.mp4"


def prepare_images():
    OUT_A.mkdir(parents=True, exist_ok=True)
    # poster: the very first frame of the intro, so the stage never shows empty while the video starts
    im = frame(clip_src("intro"), 0)
    im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
    im.save(OUT_A / "poster.webp", quality=70, method=6)
    print("  poster.webp", im.size, (OUT_A / "poster.webp").stat().st_size // 1024, "KB")
    # chat avatar: her face from the first frame of the close-up idle (1090 x 1920 source), round
    im = frame(clip_src("idle2"), 0)
    k = im.width / 1090  # face box measured on the 1090 px wide source: centre (548, 600), 760 px
    box = [round((548 - 380) * k), round((600 - 380) * k), round((548 + 380) * k), round((600 + 380) * k)]
    face = im.crop(box).resize((180, 180), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (720, 720), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 719, 719], fill=255)
    face.putalpha(mask.resize((180, 180), Image.LANCZOS))
    face.save(OUT_A / "maya_ava.webp", quality=85, method=6)
    print("  maya_ava.webp", (OUT_A / "maya_ava.webp").stat().st_size // 1024, "KB")


def encode_videos(width, crf):
    """Each slot's clip from the animator's delivery (src/EVA AI Playable Ads #3/), or a file named
    after the slot in src/animations/. The "_sound" renders are separate takes (lip-synced, so the
    picture differs from the silent take); they are the ones that carry her voice and chain together."""
    OUT_V.mkdir(parents=True, exist_ok=True)
    ff = ffmpeg()
    total = 0
    for slot in SLOTS:
        audio = DELIVERY[slot][1]
        src = clip_src(slot)
        if not src.exists():
            print(f"  {slot:8s} missing ({src.name})")
            continue
        out = OUT_V / f"{slot}.mp4"
        a = ["-c:a", "aac", "-b:a", "48k", "-ac", "1"] if audio else ["-an"]
        subprocess.run([ff, "-v", "error", "-y", "-i", str(src),
                        # a light denoise takes out the source's own compression noise (it costs bits and
                        # shows nothing); x264 at its most thorough, one keyframe per clip (they are short)
                        "-vf", f"hqdn3d=1.2:1.2:3:3,scale={width}:-2:flags=lanczos,setsar=1",
                        "-c:v", "libx264", "-preset", "veryslow", "-crf", str(crf),
                        "-x264-params", "keyint=240:min-keyint=240:bframes=6:ref=6:aq-mode=3:aq-strength=0.9:deblock=-1,-1",
                        "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p", *a,
                        "-movflags", "+faststart", str(out)], check=True)
        total += out.stat().st_size
        print(f"  {slot:8s} {out.stat().st_size / 1024:7.0f} KB  <- {src.name}")
    print(f"  total {total / 1048576:.2f} MB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=720)
    ap.add_argument("--crf", type=int, default=33)  # the whole playable stays under 5 MB
    ap.add_argument("--only", choices=["video", "images"])
    a = ap.parse_args()
    if a.only != "video":
        prepare_images()
    if a.only != "images":
        encode_videos(a.width, a.crf)
