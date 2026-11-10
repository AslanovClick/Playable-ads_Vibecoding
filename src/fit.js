// Scales the 1080x1920 stage (the Figma frame) to fit the screen, letterboxed, never stretched.
// It runs right after the markup and before the heavy scripts (the inlined videos take a moment to
// parse), and the stage stays hidden until it is laid out, so the first frame is never unscaled.
window.VIEW = (function () {
  var W = 1080, H = 1920;
  var stage = document.getElementById("stage");
  var view = { s: 1, ox: 0, oy: 0 }; // updated in place: game.js keeps this same object
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return; // some ad webviews report 0x0 before they are shown
    view.s = Math.min(vw / W, vh / H);
    view.ox = (vw - W * view.s) / 2;
    view.oy = (vh - H * view.s) / 2;
    stage.style.transform = "translate(" + view.ox + "px," + view.oy + "px) scale(" + view.s + ")";
    stage.style.visibility = "visible";
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", function () { setTimeout(fit, 120); });
  fit();
  return view;
})();
