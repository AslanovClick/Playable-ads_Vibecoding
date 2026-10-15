// Values that change per campaign. The build script can override them:
//   node tools/build.mjs --amount=125 --unit="giros gratis" --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  bonusAmount: 125, // the full prize on the 3rd card
  bonusUnit: "giros gratis", // "125 GIROS GRATIS"
  clickUrl: "https://example.com/", // placeholder landing / store URL
  locale: "es-MX", // number format of the amount

  // On-screen copy. The legal footer lives in index.html.
  text: {
    title: "Saca<br>tu carta",
    retry: "¡Prueba<br>otra vez!", // title after the 1st (empty) card
    oneMore: "¡La suerte<br>está cerca!", // title after the 2nd (half) card: teases, promises nothing
    win: "¡Felicidades!<br>¡Ganaste!", // title once the 3rd card shows the full prize
    cardTop: "Bono:", // above the amount on the card face
    loseAmount: "0", // 1st card: "BONO: 0 GIROS GRATIS" in grey
    halfAmount: "50%", // 2nd card: "BONO: 50% DEL PREMIO"
    halfUnit: "del premio",
    plate: "Tu bono:", // "TU BONO: 125 GIROS GRATIS" under the card
    cta: "Reclamar bono",
  },
};
