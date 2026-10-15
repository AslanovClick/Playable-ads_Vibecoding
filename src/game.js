(function () {
  "use strict";

  var CFG = window.PLAYABLE_CONFIG, T = CFG.text;
  var W = 1089, H = 1920; // Figma frame

  // Fan of card backs (Figma frame 1): centre and rotation of each card, left to right.
  var FAN = [
    { x: 304.1, y: 952.4, r: -24.12 },
    { x: 432.0, y: 919.9, r: -14.12 },
    { x: 534.5, y: 917.4, r: -4.12 },
    { x: 655.0, y: 907.4, r: 5.88 },
    { x: 802.8, y: 949.8, r: 15.88 }
  ];
  var HINT = 4; // the hand points at the right-most card
  var BACK_W = 397, BACK_H = 541.4; // visible card back in the fan
  var HERO_W = 507, HERO_H = 674; // upright card front (its native size = Figma frame 3)
  // Chosen card poses: frame 3 (revealed, tilted) and frame 4 (final, upright, bigger)
  var REVEAL = { x: 577.5, y: 993.5, r: 11.38, sx: 1, sy: 1 };
  var FINAL = { x: 544.7, y: 897.3, r: 0, sx: 1.2013, sy: 1.2013 };

  var HOLD = /[?&]hold=1/.test(location.search);

  var EASE_OUT = "cubic-bezier(.22,.8,.3,1)";
  var PATH_MS = 1600; // pick -> final pose, one continuous move

  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), fanEl = $("fan"), hero = $("hero"), flip = hero.querySelector(".flip");
  var hand = $("hand"), fx = $("fx");

  // ---------------------------------------------------------------- layout
  var view = { s: 1, ox: 0, oy: 0 };
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / W, vh / H);
    view = { s: s, ox: (vw - W * s) / 2, oy: (vh - H * s) / 2 };
    stage.style.transform = "translate(" + view.ox + "px," + view.oy + "px) scale(" + s + ")";
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", function () { setTimeout(fit, 120); });
  fit();

  // ---------------------------------------------------------------- text
  function setGradText(el, h) {
    el.innerHTML = '<span class="s">' + h + '</span><span class="f">' + h + "</span>";
    fitText(el);
  }
  // Longer copy shrinks to the width given in data-max instead of overflowing.
  function fitText(el) {
    var max = parseFloat(el.getAttribute("data-max"));
    var inner = el.querySelector(".f") || el.firstElementChild;
    if (!max || !inner) return;
    el.style.fontSize = "";
    var w = inner.offsetWidth;
    if (w > max) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * max / w + "px";
  }
  var unitHtml = CFG.bonusUnit.split(" ").join("<br>"); // "giros<br>gratis" on the card
  $("title").setAttribute("data-html", T.title);
  hero.querySelector(".c1").setAttribute("data-html", T.cardTop);
  hero.querySelector(".c3").setAttribute("data-html", unitHtml);
  // the amount is part of the card face and set once, so nothing re-renders while the card flies
  var amount = CFG.bonusAmount.toLocaleString(CFG.locale);
  hero.querySelector(".c2").setAttribute("data-html", amount);
  $("plateText").firstElementChild.innerHTML = T.plate + " " + amount + " " + CFG.bonusUnit;
  $("btnText").firstElementChild.innerHTML = T.cta;
  var gts = stage.querySelectorAll(".gt");
  Array.prototype.forEach.call(gts, function (el) { setGradText(el, el.getAttribute("data-html")); });
  var fitted = [$("plateText"), $("btnText")];

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
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pose(p, w, h) {
    return "translate(" + (p.x - w / 2) + "px," + (p.y - h / 2) + "px) rotate(" + p.r + "deg) scale(" + (p.sx || 1) + "," + (p.sy || 1) + ")";
  }

  // cubic-bezier easing as a function (same curve CSS would use)
  function bezier(x1, y1, x2, y2) {
    function at(a, b, t) { return 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t; }
    return function (x) {
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
      return at(y1, y2, t);
    };
  }
  var EASE = bezier(0.32, 0, 0.18, 1); // gentle start, long soft landing

  // Smooth Catmull-Rom curve through card poses, sampled by length (position, rotation and
  // scale all count), so it can be walked at an even, eased speed. mark[i] = where pose i is.
  function curve(pts) {
    var keys = ["x", "y", "r", "sx", "sy"], samples = [], mark = [0];
    function get(i) { return pts[Math.max(0, Math.min(pts.length - 1, i))]; }
    for (var j = 0; j < pts.length - 1; j++) {
      var p0 = get(j - 1), p1 = get(j), p2 = get(j + 1), p3 = get(j + 2);
      for (var s = (j ? 1 : 0); s <= 24; s++) {
        var t = s / 24, o = {};
        keys.forEach(function (k) {
          var a = p0[k], b = p1[k], c = p2[k], d = p3[k];
          o[k] = 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
        });
        samples.push(o);
      }
    }
    var len = [0];
    for (var i = 1; i < samples.length; i++) {
      var A = samples[i - 1], B = samples[i];
      len.push(len[i - 1] + Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2) +
        Math.pow((B.r - A.r) * 4, 2) + Math.pow((B.sx - A.sx) * 400, 2)));
    }
    var total = len[len.length - 1];
    for (j = 1; j < pts.length; j++) mark.push(len[j * 24] / total);
    return {
      mark: mark,
      at: function (u) {
        var d = u * total, i = 1;
        while (i < len.length - 1 && len[i] < d) i++;
        var f = (d - len[i - 1]) / ((len[i] - len[i - 1]) || 1), o = {};
        keys.forEach(function (k) { o[k] = samples[i - 1][k] + (samples[i][k] - samples[i - 1][k]) * f; });
        return o;
      }
    };
  }

  function sparks(x, y, n, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var s = document.createElement("div");
      s.className = "spark";
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

  // ---------------------------------------------------------------- fan
  var cards = FAN.map(function (p, i) {
    var c = document.createElement("div");
    c.className = "abs card" + (i === HINT ? " hint" : "");
    c.style.transform = pose(p, BACK_W, BACK_H);
    // breathing wave: card i peaks a bit before the next one, the hinted card on the hand press
    var peak = 0.48 - (HINT - i) * 0.07; // fraction of the shared loop
    c.style.setProperty("--d", ((peak - 0.3) - 1) * 1.6 + "s");
    c.innerHTML = '<i class="glow"></i><div class="cin"></div>';
    c.setAttribute("data-i", i);
    fanEl.appendChild(c);
    return c;
  });

  function setIdle(on) {
    stage.classList.toggle("idle", on);
    hand.className = "abs img hand " + (on ? "on" : "off");
  }

  // ---------------------------------------------------------------- pick
  var started = false, picked = false;

  function toStage(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (t.clientX - view.ox) / view.s, y: (t.clientY - view.oy) / view.s };
  }

  function onPress(e) {
    if (!started || picked) return;
    if (e.cancelable) e.preventDefault();
    var c = e.target.closest ? e.target.closest(".card") : null;
    var i;
    if (c) i = +c.getAttribute("data-i");
    else { // tap outside the cards: take the nearest one
      var p = toStage(e), best = 1e9;
      FAN.forEach(function (f, k) {
        var d = (f.x - p.x) * (f.x - p.x) + (f.y - p.y) * (f.y - p.y);
        if (d < best) { best = d; i = k; }
      });
    }
    pick(i);
  }

  function pick(i) {
    picked = true;
    setIdle(false);
    var f = FAN[i];

    // the chosen card becomes the hero card, exactly where it was
    cards[i].style.visibility = "hidden";
    var start = { x: f.x, y: f.y, r: f.r, sx: BACK_W / HERO_W, sy: BACK_H / HERO_H };
    var rad = f.r * Math.PI / 180;
    var lift = { x: f.x + Math.sin(rad) * 70, y: f.y - Math.cos(rad) * 70, r: f.r, sx: start.sx * 1.08, sy: start.sy * 1.08 };
    hero.style.visibility = "visible";
    hero.style.transform = pose(start, HERO_W, HERO_H);
    anim(hero.querySelector(".back .glow"), [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 800 });

    // the others drift away and sink into the shadows. Opacity goes on the whole fan as one
    // layer, so the faded cards don't show through each other.
    cards.forEach(function (c, k) {
      if (k === i) return;
      var p = FAN[k], dir = k < i ? -1 : 1;
      var away = { x: p.x + dir * 60, y: p.y + 30, r: p.r + dir * 4, sx: 0.94, sy: 0.94 };
      anim(c, [{ transform: pose(p, BACK_W, BACK_H) }, { transform: pose(away, BACK_W, BACK_H) }], { duration: 420, easing: EASE_OUT });
    });
    anim(fanEl, [{ opacity: 1 }, { opacity: 0.35, offset: 0.25 }, { opacity: 0.35, offset: 0.6 }, { opacity: HOLD ? 0.35 : 0.15 }], { duration: PATH_MS, easing: "linear" });

    // One continuous move along a smooth curve: lift -> through the frame-3 pose (where it
    // flips) -> straight into the final frame-4 pose, with a single ease over the whole length,
    // so the speed never jumps between the states.
    var way = HOLD ? [start, lift, REVEAL] : [start, lift, REVEAL, FINAL];
    var path = curve(way);
    var dur = HOLD ? PATH_MS * 0.6 : PATH_MS;
    var frames = [], N = 48, flipAt = 1;
    for (var k = 0; k <= N; k++) {
      var t = k / N, e = EASE(t);
      frames.push({ transform: pose(path.at(e), HERO_W, HERO_H), offset: t });
    }
    for (var q = 0; q <= 1000; q++) if (EASE(q / 1000) >= path.mark[2]) { flipAt = q / 1000; break; }
    anim(hero, frames, { duration: dur, easing: "linear" });
    heroMove = { path: path, dur: dur, t0: performance.now() }; // the light swirl follows it

    // fast 2D flip on the way, centred on the moment it passes the frame-3 pose
    setTimeout(function () {
      var a = anim(flip, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 140, easing: "ease-in" });
      a.onfinish = function () {
        hero.querySelector(".back").style.visibility = "hidden";
        hero.querySelector(".front").style.visibility = "visible";
        anim(flip, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 200, easing: "ease-out" });
        reveal();
      };
    }, Math.max(0, dur * flipAt - 140));
  }

  // ---------------------------------------------------------------- light swirl
  // A comet of golden light orbiting the card on an ellipse that follows the card's live pose
  // (position, tilt, size), with a tapering tail and sparks shed from its head. Drawn on a
  // canvas behind the card, additive blending, ~1.4 s, then the canvas is cleared.
  var heroMove = null;
  var swirl = { cv: $("swirl"), ctx: null, k: 1, parts: [], t0: 0, last: 0 };
  var SWIRL_MS = 1400, TAU = Math.PI * 2;
  var dot = (function () { // soft glowing particle sprite
    var c = document.createElement("canvas"), g;
    c.width = c.height = 64;
    g = c.getContext("2d").createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,245,1)");
    g.addColorStop(0.25, "rgba(255,230,150,0.9)");
    g.addColorStop(0.6, "rgba(255,170,50,0.35)");
    g.addColorStop(1, "rgba(255,140,0,0)");
    c.getContext("2d").fillStyle = g;
    c.getContext("2d").fillRect(0, 0, 64, 64);
    return c;
  })();

  function heroPose(now) {
    if (!heroMove) return REVEAL;
    return heroMove.path.at(EASE(Math.min(1, (now - heroMove.t0) / heroMove.dur)));
  }

  function swirlStart() {
    var dpr = window.devicePixelRatio || 1;
    swirl.k = Math.min(1, view.s * dpr); // device-pixel resolution, never above stage pixels
    swirl.cv.width = Math.round(W * swirl.k);
    swirl.cv.height = Math.round(H * swirl.k);
    swirl.ctx = swirl.cv.getContext("2d");
    swirl.parts = [];
    swirl.t0 = swirl.last = performance.now();
    requestAnimationFrame(swirlFrame);
  }

  function swirlFrame(now) {
    var t = (now - swirl.t0) / SWIRL_MS, dt = Math.min(50, now - swirl.last);
    swirl.last = now;
    var ctx = swirl.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, swirl.cv.width, swirl.cv.height);
    ctx.setTransform(swirl.k, 0, 0, swirl.k, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    var p = heroPose(now), rot = p.r * Math.PI / 180, cos = Math.cos(rot), sin = Math.sin(rot);
    var rx = HERO_W / 2 * p.sx * 1.42, ry = HERO_H / 2 * p.sy * 1.2;
    function at(a, off) { // point on the card-aligned ellipse, with a slight organic wobble
      var w = 1 + (off || 0) + 0.035 * Math.sin(a * 3 + t * 7 + (off || 0) * 40);
      var ex = Math.cos(a) * rx * w, ey = Math.sin(a) * ry * w;
      return { x: p.x + ex * cos - ey * sin, y: p.y + ex * sin + ey * cos, a: a };
    }

    if (t < 1) {
      var env = t < 0.12 ? t / 0.12 : t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
      var head = 0.2 * Math.PI + 1.45 * Math.PI * (1 - Math.pow(1 - t, 2.2)); // fast in, eases out; fades upper-left
      var grow = Math.min(1, t / 0.3) * (t > 0.7 ? Math.max(0.05, (1 - t) / 0.3) : 1);
      // three strands of light (radius offset, tail length, strength), like the Figma swirl.
      // Each strand is a dense chain of soft glow sprites (even spacing = smooth band, no beads).
      [[0, 2.0, 1], [0.075, 1.45, 0.55], [-0.065, 1.1, 0.45]].forEach(function (st, si) {
        var tail = 0.15 + st[1] * grow, M = 90, core = [];
        for (var j = 0; j <= M; j++) {
          var f = 1 - j / M, q = at(head - tail * j / M, st[0]), c = ctx; // f: 1 at the head
          var g = 150 * st[2] * p.sx * (0.3 + 0.7 * f);
          c.globalAlpha = 0.16 * st[2] * env * Math.pow(f, 1.2);
          c.drawImage(dot, q.x - g / 2, q.y - g / 2, g, g);
          var w = 34 * st[2] * p.sx * (0.25 + 0.75 * f);
          c.globalAlpha = 0.36 * env * Math.pow(f, 1.4);
          c.drawImage(dot, q.x - w / 2, q.y - w / 2, w, w);
          if (si === 0 && j <= M * 0.6) core.push(q);
        }
        // thin white-hot thread along the main strand
        if (si === 0) {
          ctx.globalAlpha = 0.55 * env;
          ctx.strokeStyle = "rgb(255,250,232)";
          ctx.lineWidth = 4 * p.sx;
          ctx.beginPath();
          core.forEach(function (q, n) { if (n) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      var h0 = at(head, 0), h1 = at(head - 0.06, 0);
      var hs = 170 * p.sx * env; // bright core at the head
      ctx.globalAlpha = env;
      ctx.drawImage(dot, h0.x - hs / 2, h0.y - hs / 2, hs, hs);
      ctx.globalAlpha = 1;
      // sparks shed from the head, thrown along its direction of travel
      var n = Math.round(5 * env + Math.random());
      for (var e = 0; e < n; e++) {
        var tx = h0.x - h1.x, ty = h0.y - h1.y, tl = Math.hypot(tx, ty) || 1;
        var sp = rnd(0.04, 0.26);
        swirl.parts.push({
          x: h0.x + rnd(-14, 14), y: h0.y + rnd(-14, 14),
          vx: tx / tl * sp + rnd(-0.07, 0.07), vy: ty / tl * sp + rnd(-0.07, 0.07),
          life: rnd(450, 1000), age: 0, size: rnd(10, 28)
        });
      }
    }

    var i;
    for (i = swirl.parts.length - 1; i >= 0; i--) {
      var q = swirl.parts[i];
      q.age += dt;
      if (q.age >= q.life) { swirl.parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.00012 * dt; q.vx *= 0.985; q.vy *= 0.985;
      var k = 1 - q.age / q.life, sz = q.size * (0.4 + 0.6 * k);
      ctx.globalAlpha = 0.85 * k;
      ctx.drawImage(dot, q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    if (t < 1 || swirl.parts.length) requestAnimationFrame(swirlFrame);
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, swirl.cv.width, swirl.cv.height); }
  }

  // ---------------------------------------------------------------- prize
  function reveal() {
    hero.classList.add("won");
    anim($("flash"), [{ opacity: 0 }, { opacity: 0.7, offset: 0.2 }, { opacity: 0 }], { duration: 800, easing: "ease-out" });
    // the burst of light on the face is a plain overlay fading out (no filter repaint)
    anim(hero.querySelector(".burst"), [{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: "ease-out" });
    swirlStart(); // the arc of light wraps around the card while it settles
    sparks(REVEAL.x, REVEAL.y, 26, { dist: 420, size: 1.5, dur: 1000 });

    // "TU BONO: 125 GIROS GRATIS" slides in as the card settles
    setTimeout(function () {
      $("plate").style.opacity = 1;
      animIn($("plate"), [
        { opacity: 0, transform: "translateY(50px) scale(0.85)" },
        { opacity: 1, transform: "none" }
      ], { duration: 420, easing: "cubic-bezier(.2,.9,.3,1.1)" });
    }, HOLD ? 150 : 380);

    if (!HOLD) setTimeout(finale, 650);
  }

  function finale() {
    stage.classList.add("end");
    AD.gameEnd();
    var btn = $("btn");
    btn.style.opacity = 1;
    animIn(btn, [
      { opacity: 0, transform: "translateY(50px) scale(0.92)" },
      { opacity: 1, transform: "none" }
    ], { duration: 420, easing: "cubic-bezier(.2,.9,.3,1.12)" });
    sparks(FINAL.x, FINAL.y, 18, { dist: 380, size: 1.3, delay: 150, dur: 900 });
    setTimeout(function () {
      stage.classList.add("cta");
      hand.className = "abs img hand final on";
    }, 500);
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
  $("btn").addEventListener("click", onCta);
  $("plate").addEventListener("click", onCta);

  function start() {
    if (started) return;
    started = true;
    fit();
    Array.prototype.forEach.call(gts, fitText); // re-measure with the web font loaded
    fitted.forEach(fitText);
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

  // QA hooks: ?pick=0..4 picks that card automatically, &hold=1 stops on the revealed card
  var m = /[?&]pick=(\d)/.exec(location.search);
  if (m) setTimeout(function () { if (started && !picked) pick(+m[1] % 5); }, 900);
  // QA: window.__swirlAt(0..1) draws one frame of the light swirl at that moment of its life
  if (m) window.__swirlAt = function (t) {
    if (!swirl.ctx) swirlStart();
    var now = performance.now();
    swirl.t0 = now - t * SWIRL_MS;
    swirl.last = now - 16;
    swirlFrame(now);
  };
})();
