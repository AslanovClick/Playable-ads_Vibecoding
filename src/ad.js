// Thin adapter over the ad network SDKs. Whatever the network injects is used,
// otherwise it falls back to a plain browser (preview / landing page).
window.AD = (function () {
  var w = window;

  function onReady(cb) {
    var done = false;
    function go() { if (!done) { done = true; cb(); } }
    try {
      if (w.mraid) {
        if (w.mraid.getState() === "loading") w.mraid.addEventListener("ready", go);
        else go();
        return;
      }
      if (w.dapi) { // ironSource
        if (w.dapi.isReady()) go(); else w.dapi.addEventListener("ready", go);
        return;
      }
    } catch (e) { /* fall through */ }
    go();
  }

  function gameReady() { try { if (w.gameReady) w.gameReady(); } catch (e) {} } // Mintegral

  function gameEnd() { try { if (w.gameEnd) w.gameEnd(); } catch (e) {} } // Mintegral

  function click(url) {
    try {
      if (w.FbPlayableAd) return w.FbPlayableAd.onCTAClick(); // Meta
      if (w.ExitApi) return w.ExitApi.exit(); // Google Ads
      if (w.install) return w.install(); // Mintegral
      if (w.dapi && w.dapi.openStoreUrl) return w.dapi.openStoreUrl(); // ironSource
      if (w.mraid && w.mraid.open) return w.mraid.open(url); // AppLovin, Unity, Vungle, ...
    } catch (e) { /* fall through */ }
    w.open(url, "_blank");
  }

  return { onReady: onReady, gameReady: gameReady, gameEnd: gameEnd, click: click };
})();
