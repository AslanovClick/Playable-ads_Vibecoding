// Video clips (made by tools/prepare_assets.py). The build inlines them; at runtime game.js turns
// each one into a blob: URL, which plays everywhere (iOS does not play data: URLs).
window.PLAYABLE_CLIPS = {
  intro: "video/intro.mp4", // 1-1 #1: Ruby says hi (loop)
  choose: "video/choose.mp4", // 1-1 #2: waits for the dress (loop)

  wear_red: "video/wear_red.mp4", // 1-2: in the new dress, looks herself over
  wear_black: "video/wear_black.mp4",
  wear_burgundy: "video/wear_burgundy.mp4",

  turn_red: "video/turn_red.mp4", // 1-3: turns around, shows the zipper
  turn_black: "video/turn_black.mp4",
  turn_burgundy: "video/turn_burgundy.mp4",

  unzip_red: "video/unzip_red.mp4", // 1-5: waits on its first frame after the turn, then the swipe scrubs the zipper down
  unzip_black: "video/unzip_black.mp4",
  unzip_burgundy: "video/unzip_burgundy.mp4",

  chat_red: "video/chat_red.mp4", // 1-6: behind the final chat (loop)
  chat_black: "video/chat_black.mp4",
  chat_burgundy: "video/chat_burgundy.mp4",
};
