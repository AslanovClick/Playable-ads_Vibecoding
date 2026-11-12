// Values that change per campaign. The build script can override the click URL:
//   node tools/build.mjs --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  clickUrl: "https://example.com/", // placeholder: the EVA AI website / store link
  sound: true, // light UI sounds (WebAudio, after the first tap)

  text: {
    // Step 1: choose your style
    styleTitle: "Choose your style",
    styleSub: "Two beautiful styles,\nthe same meaningful conversations.",
    styles: { real: "REALISTIC", anime: "ANIME" },
    next: "Continue",
    // Step 2: the four girls
    girlsTitle: "Who catches your eye?",
    girlsSub: "Pick the one you like and see how she reacts",
    role: "AI character",
    choose: "Choose her",
    // Step 3: the match
    cta: "Start chatting",
  },

  // The four girls, in the order of the thumbnails. line: her bubble while you browse (step 2);
  // greet: what she says when you have chosen her (step 3).
  girls: [
    { id: "jade", name: "Jade", line: "Know what you want? I like that.",
      greet: "Hey there! I think we'll have fun together." },
    { id: "mia", name: "Mia", line: "Can't take your eyes off me? 😉",
      greet: "Hey! I've been waiting for you!" },
    { id: "scarlett", name: "Scarlett", line: "Some secrets are worth the wait…",
      greet: "Well, look who I found..." },
    { id: "yuna", name: "Yuna", line: "I'm shy… but I'd love to talk ☺️",
      greet: "Hi! It's so nice to meet you!" },
  ],
};
