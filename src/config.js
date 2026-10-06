// Values that change per campaign. The build script can override them:
//   node tools/build.mjs --amount=5000 --url=https://example.com/landing
window.PLAYABLE_CONFIG = {
  bonusAmount: 10000, // placeholder, the real "[Amount]" goes here
  currency: "MXN",
  clickUrl: "https://example.com/", // placeholder landing / store URL
  locale: "es-MX", // number format of the amount: 10,000
};
