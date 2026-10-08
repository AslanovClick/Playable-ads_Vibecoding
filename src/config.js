// Values that change per campaign. The build script can override them:
//   node tools/build.mjs --amount=125 --unit="giros gratis" --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  bonusAmount: 125, // counts up from 0 in the final pop-up
  bonusUnit: "giros gratis", // shown after the amount: "125 GIROS GRATIS"
  clickUrl: "https://example.com/", // placeholder landing / store URL
  locale: "es-MX", // number format of the amount

  // All on-screen copy (rendered uppercase). The legal footer lives in index.html.
  text: {
    title: "Abre la caja fuerte<br>y obtén un bono",
    tap: "Toca para abrir",
    tryAgain: "¡Inténtalo de nuevo!",
    tapsLeft: "Toques restantes: ",
    open: "¡Abierta!",
    bonus: "Tu bono:",
    cta: "Reclama y juega",
  },
};
