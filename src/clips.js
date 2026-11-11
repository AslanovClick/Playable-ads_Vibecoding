// The clips, one per beat of the story (re-encoded from the animator's delivery by
// `python tools/prepare_assets.py --only video`; DELIVERY there says which file is which).
// The build inlines them; at runtime game.js turns each one into a blob: URL.
window.PLAYABLE_CLIPS = {
  hook: "video/hook.mp4", // S1: tucks her hair behind her ear, "Can I be your little secret…" (voice)
  idle1: "video/idle1.mp4", // S1: holds eye contact while you choose (loop)
  behave: "video/behave.mp4", // S2: raises an eyebrow, amused half-smirk ("Depends. Are you going to behave?")
  maybe: "video/maybe.mp4", // S2: quiet breathy laugh, leans closer ("My phone is locked…") (voice)
  tension: "video/tension.mp4", // S3: the camera eases in, "Now tell me… should I be a good girl tonight…" (voice)
  idle2: "video/idle2.mp4", // S3: chest and face, waits for the second reply (loop)
  bad: "video/bad.mp4", // S4: steady eye contact ("Show me your bad side.")
  tease: "video/tease.mp4", // S4: fingertips on the collarbone, head tilt ("Tease me first…")
  final: "video/final.mp4", // S5: chin on her hand, "It's past midnight…" (voice)
  cta: "video/cta.mp4", // S5: soft magnetic smile (loop)
};
