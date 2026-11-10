// Values that change per campaign. The build script can override the click URL:
//   node tools/build.mjs --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  clickUrl: "https://example.com/", // placeholder landing / store URL
  sound: true, // UI sounds (WebAudio), only after the first tap

  // On-screen copy
  text: {
    name: "Ruby",
    role: "AI character",
    online: "Online now",
    hello: "Hi! I’m Ruby!",
    start: "Tap to start",
    chooseTitle: "Tap dress to choose",
    chooseAsk: "Will you help me choose a new look? Which dress should I wear?",
    wear: "Try it on",
    dresses: { black: "Black dress", burgundy: "Burgundy dress", red: "Red dress" },
    amazing: "It looks amazing on me…",
    zipper: "…but the zipper’s stuck in the back. Care to help? 😉",
    swipeTitle: "Swipe down to unzip",
    final: "It’s getting crowded out here… Come join me in private, I’m waiting 💋",
    cta: "Reply to Ruby",
    legal:
      "Producciones Móviles S.A. de C.V., licensed for games and prize draws under permit " +
      "DGAJS/SCEVF/P-06/2005-TER and authorization letter SG/SSCPPSAR/DGJS/0192/2026 for the promotion: " +
      "Welcome Package. Authorization valid until December 31, 2026. Personal and non-transferable promotion. " +
      "Play responsibly. The main purpose is entertainment, fun and leisure. 18+.",
  },
};
