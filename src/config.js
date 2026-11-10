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
    // Disclaimer at the bottom: off for now. Its area (y 1734-1900) stays reserved, nothing moves into
    // it; put the text back here to show it again.
    legal: "",
  },
};
