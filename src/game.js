(function () {
  "use strict";

  var CFG = window.PLAYABLE_CONFIG;
  var W = 1089, H = 1920; // Figma frame
  var TAPS = 3;

  // Stage-space coordinates of interesting points
  var DIAL = { x: 665, y: 803 }; // visual centre of the dial (bezel), not the off-centre logo
  var PANEL = { x: 101, y: 1060 };
  var SLOT_X = [148, 443, 738], SLOT_Y = 186; // inside panel
  // Tap 1 always "breaks" the first disc (illusion of chance), taps 2 and 3 succeed and
  // the broken disc gets repaired on the last one.
  var BAR_W = [0, 0, 443, 887]; // revealed progress bar width after each tap
  var DIAL_ANGLE = [0, 0, 360, 720]; // full turns keep the painted lighting correct at rest

  var EASE_OUT = "cubic-bezier(.22,.8,.3,1)";
  var EASE_BACK = "cubic-bezier(.3,1.45,.5,1)";

  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), safe = $("safe"), dial = $("dial"), dialSpr = $("dialSpr"), dialHub = $("dialHub"), broken = $("broken");
  var hand = $("hand"), label = $("label"), barWrap = $("barWrap"), fx = $("fx"), tapText = $("tapText");
  var popup = $("popup"), popHand = $("popHand");
  var coins = stage.querySelectorAll(".coin"), checks = stage.querySelectorAll(".check");

  // ---------------------------------------------------------------- layout
  // The stage always keeps the Figma frame proportions and is fitted (contain) into the screen.
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / W, vh / H);
    stage.style.transform = "translate(" + (vw - W * s) / 2 + "px," + (vh - H * s) / 2 + "px) scale(" + s + ")";
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", function () { setTimeout(fit, 120); });
  fit();

  // Gradient text = outline layer + gradient fill layer
  $("popText").setAttribute("data-html", "Your bonus:<br><span class='amount'>0</span> " + CFG.currency);
  function setGradText(el, h) {
    el.innerHTML = '<span class="s">' + h + '</span><span class="f">' + h + "</span>";
  }
  Array.prototype.forEach.call(stage.querySelectorAll(".gt"), function (el) {
    setGradText(el, el.getAttribute("data-html"));
  });

  // ---------------------------------------------------------------- helpers
  function anim(el, frames, opt) {
    var o = { fill: "forwards" };
    for (var k in opt) o[k] = opt[k];
    return el.animate(frames, o);
  }
  // Entrance animation that ends on the element's CSS state: drop it afterwards so CSS loops can run.
  function animIn(el, frames, opt) {
    var o = { fill: "both" };
    for (var k in opt) o[k] = opt[k];
    var a = el.animate(frames, o);
    a.onfinish = function () { a.cancel(); };
    return a;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function sparks(x, y, n, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var s = document.createElement("div");
      s.className = "spark" + (o.cls ? " " + o.cls : "");
      s.style.left = x + (o.jx ? rnd(-o.jx, o.jx) : 0) + "px";
      s.style.top = y + (o.jy ? rnd(-o.jy, o.jy) : 0) + "px";
      var ang = (o.angle || 0) + rnd(-0.5, 0.5) * (o.spread != null ? o.spread : Math.PI * 2);
      var d = (o.dist || 170) * rnd(0.45, 1.15);
      var sc = (o.size || 1) * rnd(0.6, 1.5);
      var dx = Math.cos(ang) * d, dy = Math.sin(ang) * d + (o.gravity || 40);
      fx.appendChild(s);
      var a = s.animate([
        { transform: "translate(0,0) scale(" + sc + ")", opacity: 1 },
        { transform: "translate(" + dx + "px," + dy + "px) scale(0)", opacity: 0.3 }
      ], { duration: (o.dur || 700) * rnd(0.7, 1.3), delay: (o.delay || 0) + rnd(0, o.stagger || 0), easing: "cubic-bezier(.15,.7,.3,1)", fill: "backwards" });
      a.onfinish = s.remove.bind(s);
    }
  }

  function ripple(x, y, scale) {
    var r = document.createElement("div");
    r.className = "ripple";
    r.style.left = x + "px";
    r.style.top = y + "px";
    fx.appendChild(r);
    var a = r.animate([
      { transform: "scale(0.3)", opacity: 1 },
      { transform: "scale(" + (scale || 2.2) + ")", opacity: 0 }
    ], { duration: 550, easing: "ease-out" });
    a.onfinish = r.remove.bind(r);
  }

  // ---------------------------------------------------------------- hint (idle) state
  var hintTimer = 0;
  function setIdle(on) {
    stage.classList.toggle("idle", on);
    hand.className = "abs img hand " + (on ? "on" : "off");
  }
  function scheduleHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { if (!ended) setIdle(true); }, 2500);
  }

  // ---------------------------------------------------------------- game
  var taps = 0, busy = false, queued = 0, ended = false, started = false, tryTimer = 0;

  function onPress(e) {
    if (!started || ended) return;
    if (e && e.cancelable) e.preventDefault();
    if (taps + queued >= TAPS) return;
    if (busy) { queued++; return; }
    doTap();
  }

  function doTap() {
    busy = true;
    taps++;
    var k = taps;
    setIdle(false);
    scheduleHint();

    animIn(dialHub, [{ transform: "scale(1)" }, { transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration: 220 });
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300, easing: EASE_OUT });
    var left = TAPS - k;
    label.textContent = left > 0 ? "Taps left: " + left : "OPEN";
    anim(barWrap, [{ width: BAR_W[k - 1] + "px" }, { width: BAR_W[k] + "px" }], { duration: 420, easing: EASE_OUT });

    if (k === 1) failTap(); else okTap(k);

    setTimeout(function () {
      busy = false;
      if (taps === TAPS) { openSafe(); return; }
      if (queued) { queued--; doTap(); }
    }, k === TAPS ? 850 : k === 1 ? 750 : 600);
  }

  // The lock jams, the first disc cracks.
  function failTap() {
    anim(dialSpr, [
      { transform: "rotate(0deg)", easing: "ease-out" },
      { transform: "rotate(70deg)", offset: 0.35, easing: "ease-in" },
      { transform: "rotate(52deg)", offset: 0.5 },
      { transform: "rotate(62deg)", offset: 0.6, easing: "ease-in-out" },
      { transform: "rotate(-8deg)", offset: 0.85 },
      { transform: "rotate(0deg)" }
    ], { duration: 750 });
    animIn(safe, [
      { transform: "none" },
      { transform: "translateX(-10px)" }, { transform: "translateX(9px)" },
      { transform: "translateX(-6px)" }, { transform: "translateX(4px)" },
      { transform: "none" }
    ], { duration: 420, delay: 220, easing: "ease-out" });
    sparks(DIAL.x, DIAL.y, 10, { dist: 160, cls: "dust", delay: 220, dur: 700, gravity: 90 });

    animIn(label, [
      { transform: "translateX(0)", color: "#ff7a5c" },
      { transform: "translateX(-12px)", color: "#ff7a5c" }, { transform: "translateX(10px)" },
      { transform: "translateX(-6px)" }, { transform: "translateX(0)", color: "#ffbb58" }
    ], { duration: 450, easing: "ease-out" });
    anim(broken, [
      { opacity: 0, transform: "scale(0.2) rotate(-90deg)" },
      { opacity: 1, transform: "scale(1.15) rotate(8deg)", offset: 0.5 },
      { opacity: 1, transform: "scale(1) rotate(-6deg)", offset: 0.7 },
      { opacity: 1, transform: "scale(1) rotate(4deg)", offset: 0.85 },
      { opacity: 1, transform: "scale(1) rotate(0deg)" }
    ], { duration: 600, delay: 120, easing: "ease-out" });
    var sx = PANEL.x + SLOT_X[0], sy = PANEL.y + SLOT_Y;
    sparks(sx, sy, 12, { dist: 130, cls: "dust", delay: 380, dur: 650, gravity: 80 });

    // "Tap to unlock" -> "Try again!" for a moment
    setGradText(tapText, "Try again!");
    clearTimeout(tryTimer);
    tryTimer = setTimeout(function () { setGradText(tapText, "Tap to Unlock"); }, 1600);
  }

  function okTap(k) {
    clearTimeout(tryTimer);
    setGradText(tapText, "Tap to Unlock");
    anim(dialSpr, [
      { transform: "rotate(" + DIAL_ANGLE[k - 1] + "deg)" },
      { transform: "rotate(" + DIAL_ANGLE[k] + "deg)" }
    ], { duration: k === TAPS ? 900 : 650, easing: EASE_BACK });
    animIn(safe, [
      { transform: "none" },
      { transform: "translate(-6px,2px) rotate(-0.5deg)" },
      { transform: "translate(5px,-2px) rotate(0.4deg)" },
      { transform: "translate(-2px,1px) rotate(-0.2deg)" },
      { transform: "none" }
    ], { duration: 320, easing: "ease-out" });
    ripple(DIAL.x, DIAL.y, 2.6);
    sparks(DIAL.x, DIAL.y, 14, { dist: 230, size: 1.2, dur: 650 });
    animIn(label, [{ transform: "scale(1.3)", color: "#fff3c4" }, { transform: "scale(1)", color: "#ffbb58" }], { duration: 380, easing: EASE_OUT });

    fillSlot(k - 1, 160);
    if (k === TAPS) {
      // the cracked disc is repaired: flash, then it turns into a good one
      anim(broken, [
        { opacity: 1, transform: "scale(1)", filter: "brightness(1)" },
        { opacity: 1, transform: "scale(1.15)", filter: "brightness(2.2)", offset: 0.5 },
        { opacity: 0, transform: "scale(1.3)", filter: "brightness(3)" }
      ], { duration: 420, delay: 260, easing: "ease-out" });
      fillSlot(0, 440);
    }
  }

  function fillSlot(i, delay) {
    anim(coins[i], [
      { opacity: 0, transform: "scale(0.2) rotate(-90deg)" },
      { opacity: 1, transform: "scale(1.22) rotate(10deg)", offset: 0.6 },
      { opacity: 1, transform: "scale(1) rotate(0deg)" }
    ], { duration: 460, delay: delay, easing: "ease-out" });
    anim(checks[i], [
      { opacity: 0, transform: "scale(2.2) rotate(-14deg)" },
      { opacity: 1, transform: "scale(0.9) rotate(0deg)", offset: 0.7 },
      { opacity: 1, transform: "scale(1)" }
    ], { duration: 320, delay: delay + 360, easing: "ease-in" });
    var sx = PANEL.x + SLOT_X[i], sy = PANEL.y + SLOT_Y;
    sparks(sx, sy, 12, { dist: 150, delay: delay + 140, dur: 600 });
    setTimeout(function () { ripple(sx, sy, 1.6); }, delay);
  }

  function openSafe() {
    ended = true;
    clearTimeout(hintTimer);
    setIdle(false);

    // rattle, then the door swings open with a burst of golden light
    anim(safe, [
      { transform: "none" },
      { transform: "translate(-8px,0) rotate(-0.8deg)" },
      { transform: "translate(8px,0) rotate(0.8deg)" },
      { transform: "translate(-6px,0) rotate(-0.5deg)" },
      { transform: "translate(6px,0) rotate(0.5deg)" },
      { transform: "none" }
    ], { duration: 420, easing: "ease-in-out" });

    wait(380).then(function () {
      stage.classList.add("open");
      anim($("safeOpen"), [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
      anim(dial, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
      anim(dialHub, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
      anim(safe, [{ transform: "scale(1)" }, { transform: "scale(1.04)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 650, easing: "ease-out" });
      anim($("flash"), [{ opacity: 0 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0 }], { duration: 1000, easing: "ease-out" });
      anim($("doorGlow"), [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
      anim($("glowBack"), [{ opacity: 0 }, { opacity: 0.85 }], { duration: 700 });
      anim($("rays"), [{ opacity: 0 }, { opacity: 0.7 }], { duration: 900 });
      anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      // light pouring out of the door gap (left edge) + burst from the lock
      sparks(232, 900, 34, { jx: 10, jy: 330, angle: Math.PI, spread: 1.6, dist: 260, size: 1.3, dur: 1100, stagger: 500, gravity: -60 });
      sparks(DIAL.x, DIAL.y, 26, { dist: 420, size: 1.6, dur: 1000 });
      return wait(1050);
    }).then(showPopup);
  }

  function showPopup() {
    popup.classList.add("show");
    AD.gameEnd();

    animIn($("popBox"), [
      { opacity: 0, transform: "scale(0.6)" },
      { opacity: 0.9, transform: "scale(1.03)", offset: 0.7 },
      { opacity: 0.9, transform: "scale(1)" }
    ], { duration: 480, easing: "ease-out" });
    anim($("popRays"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 700, delay: 350 });
    animIn($("popGold"), [
      { opacity: 0, transform: "translateY(-260px) scale(0.6)" },
      { opacity: 1, transform: "translateY(18px) scale(1.06)", offset: 0.65 },
      { opacity: 1, transform: "none" }
    ], { duration: 650, delay: 220, easing: "ease-out" });
    sparks(530, 664, 22, { dist: 300, size: 1.4, delay: 640, dur: 900 });
    animIn($("popText"), [
      { opacity: 0, transform: "scale(0.5)" },
      { opacity: 1, transform: "scale(1.1)", offset: 0.7 },
      { opacity: 1, transform: "scale(1)" }
    ], { duration: 450, delay: 420, easing: "ease-out" });
    animIn($("popBtn"), [
      { opacity: 0, transform: "translateY(90px) scale(0.8)" },
      { opacity: 1, transform: "none" }
    ], { duration: 480, delay: 800, easing: EASE_BACK });

    // amount counts up
    var amounts = popup.querySelectorAll(".amount");
    var target = CFG.bonusAmount, t0 = 0, DUR = 1000;
    function fmt(v) { return Math.round(v).toLocaleString(CFG.locale); }
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / DUR);
      var e = 1 - Math.pow(1 - p, 3);
      for (var i = 0; i < amounts.length; i++) amounts[i].textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(step);
    }
    setTimeout(function () { requestAnimationFrame(step); }, 550);

    setTimeout(function () {
      popup.classList.add("cta");
      popHand.className = "abs img hand on";
    }, 1400);
  }

  function onCta(e) {
    if (e) e.stopPropagation();
    AD.click(CFG.clickUrl);
  }

  // ---------------------------------------------------------------- input & start
  if (window.PointerEvent) stage.addEventListener("pointerdown", onPress);
  else {
    stage.addEventListener("touchstart", onPress, { passive: false });
    stage.addEventListener("mousedown", onPress);
  }
  $("popBtn").addEventListener("click", onCta);
  $("popGold").addEventListener("click", onCta);
  $("popBox").addEventListener("click", onCta);

  function start() {
    if (started) return;
    started = true;
    fit();
    stage.classList.remove("loading");
    setIdle(true);
    AD.gameReady();
  }

  AD.onReady(function () {
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var loaded = document.readyState === "complete" ? Promise.resolve() : new Promise(function (r) { window.addEventListener("load", r); });
    Promise.all([fonts, loaded]).then(start, start);
    setTimeout(start, 2500); // never get stuck on a slow font load
  });

  // debug hook for QA: ?state=1..3 or ?state=popup
  var m = /[?&]state=(\w+)/.exec(location.search);
  if (m) setTimeout(function () {
    var n = m[1] === "popup" ? TAPS : parseInt(m[1], 10) || 0;
    (function next() { if (taps < n) { if (!busy) doTap(); setTimeout(next, 120); } })();
  }, 400);
})();
