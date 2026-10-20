// Values that change per campaign. The build script can override them:
//   node tools/build.mjs --amount=125 --unit="giros gratis" --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  bonusAmount: 125, // the prize in the pop-up
  bonusUnit: "giros gratis", // "TU BONO: 125 GIROS GRATIS"
  clickUrl: "https://example.com/", // placeholder landing / store URL
  locale: "es-MX", // number format of the amount

  // On-screen copy. The legal footer lives in index.html.
  text: {
    title: "¡Rompe<br><small>la piñata!</small>",
    choose: "¡Elige tu arma!", // above the weapon panel
    // under the pinata: before the 1st strike, then after strikes 1, 2 and 3
    hits: ["¡Toca para smash!", "¡Dale otra vez!", "¡Más fuerte!", "¡Un golpe más!"],
    bonus: "Tu bono:", // "TU BONO: / 125 GIROS GRATIS" in the pop-up
    cta: "Reclamar bono",
  },
};
