// Values that change per campaign. The build script can override them:
//   node tools/build.mjs --amount=125 --unit="giros gratis" --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  bonusAmount: 125, // counts up from 0 when the card is revealed
  bonusUnit: "giros gratis", // "125 GIROS GRATIS"
  clickUrl: "https://example.com/", // placeholder landing / store URL
  locale: "es-MX", // number format of the amount

  // On-screen copy. The legal footer lives in index.html.
  text: {
    title: "Saca<br>tu carta",
    cardTop: "Bono:", // above the amount on the card face
    plate: "Tu bono:", // "TU BONO: 125 GIROS GRATIS" under the card
    cta: "Reclamar bono",
  },
};
