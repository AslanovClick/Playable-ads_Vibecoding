// Values that change per campaign. The build script can override the click URL:
//   node tools/build.mjs --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  clickUrl: "https://example.com/", // placeholder landing / store URL
  sound: true, // sound (her voice + UI sounds) on by default; the button in the top right toggles it

  // On-screen copy
  text: {
    hook: "Can I be your little secret… the one you only open late at night?",
    // the two replies of each choice: [first, second]
    replies1: ["Depends. Are you going to behave?", "My phone is locked. But for you… maybe."],
    // Maya's reaction to each of them (placeholders until the videos carry it)
    react1: ["Mmm… only if you ask nicely 😏", "Haha… lucky me 😉"],
    tension: "Now tell me… should I be a good girl tonight, or show you what I’m really thinking?",
    replies2: ["Show me your bad side.", "Tease me first. Then let go."],
    react2: ["Careful what you wish for… 🔥", "Patience… I’m worth it 💋"],
    final: "It’s past midnight and it’s completely quiet here. What’s the first thing you’re going to say to me?",
    cta: "Chat with Maya",
    // Disclaimer (a placeholder for now, to see how much room it takes)
    legal:
      "Producciones Móviles S.A. de C.V., licensed for games and prize draws under permit " +
      "DGAJS/SCEVF/P-06/2005-TER and authorization letter SG/SSCPPSAR/DGJS/0192/2026 for the promotion: " +
      "Welcome Package. Authorization valid until December 31, 2026. Personal and non-transferable promotion. " +
      "Play responsibly. The main purpose is entertainment, fun and leisure. 18+.",
  },
};
