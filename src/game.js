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
  // mouse hover on a card (like Figma state 2): lift along the card's own axis + green glow, see CSS
  var HOVER = window.matchMedia ? matchMedia("(hover: hover) and (pointer: fine)") : { matches: false };
  var HOVER_LIFT = 48, HOVER_SCALE = 1;
  var BACK_W = 397, BACK_H = 541.4; // visible card back in the fan
  var HERO_W = 507, HERO_H = 674; // upright card front (its native size = Figma frame 3)
  // Chosen card poses: frame 3 (revealed, tilted) and frame 4 (final, upright, bigger)
  var REVEAL = { x: 577.5, y: 993.5, r: 11.38, sx: 1, sy: 1 };
  var FINAL = { x: 544.7, y: 897.3, r: 0, sx: 1.2013, sy: 1.2013 };

  // Three draws: an empty card, half the prize, then the full prize. Each of the first two
  // stops in front of the fan (SHOW) and then flies down into its result slot under the fan.
  var KINDS = ["lose", "half", "win"];
  var SHOW = [
    { x: 544.5, y: 940, r: -5, sx: 1, sy: 1 },
    { x: 544.5, y: 940, r: 5, sx: 1, sy: 1 }
  ];
  var PIP_S = 0.3, PIP_Y = 1478, PIP_X = [344.5, 544.5, 744.5]; // result slots (mini cards)
  var PLATE_C = { x: 544.5, y: 1340 }; // the slots melt into the prize plate here

  var HOLD = /[?&]hold=1/.test(location.search);

  var EASE_OUT = "cubic-bezier(.22,.8,.3,1)";
  var PATH_MS = 1600; // final pick -> final pose, one continuous move
  var SHOW_MS = 1000; // pick -> shown in front of the fan (draws 1 and 2)
  var LOOK_MS = [750, 1000]; // how long the shown card stays before it goes to its slot
  var TO_SLOT_MS = 680;

  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), fanEl = $("fan"), hero = $("hero"), flip = hero.querySelector(".flip");
  var front = hero.querySelector(".front"), back = hero.querySelector(".back");
  var halo = hero.querySelector(".halo"), burst = hero.querySelector(".burst");
  var hand = $("hand"), fx = $("fx"), title = $("title");

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
  function lines(s) { return s.split(" ").join("<br>"); } // "giros<br>gratis" on the card
  var c1 = hero.querySelector(".c1"), c2 = hero.querySelector(".c2"), c3 = hero.querySelector(".c3");
  var amount = CFG.bonusAmount.toLocaleString(CFG.locale);
  title.setAttribute("data-html", T.title);
  c1.setAttribute("data-html", T.cardTop);
  c2.setAttribute("data-html", amount);
  c3.setAttribute("data-html", lines(CFG.bonusUnit));
  $("plateText").firstElementChild.innerHTML = T.plate + " " + amount + " " + CFG.bonusUnit;
  $("btnText").firstElementChild.innerHTML = T.cta;
  var gts = stage.querySelectorAll(".gt");
  Array.prototype.forEach.call(gts, function (el) { setGradText(el, el.getAttribute("data-html")); });
  var fitted = [$("plateText"), $("btnText")];

  // The face of the next card to be drawn. It is set while the card is still face down, so
  // nothing re-renders once it is visible.
  function setFace(kind) {
    hero.classList.remove("k-lose", "k-half", "k-win");
    hero.classList.add("k-" + kind);
    setGradText(c1, T.cardTop);
    setGradText(c2, kind === "lose" ? T.loseAmount : kind === "half" ? T.halfAmount : amount);
    setGradText(c3, lines(kind === "half" ? T.halfUnit : CFG.bonusUnit));
  }
  function cloneFace() {
    var f = front.cloneNode(true);
    f.style.visibility = ""; // shown or hidden by its slot
    return f;
  }

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
  // drop the script animations left on an element (CSS loops keep running)
  function stopAnims(el) {
    if (!el.getAnimations) return;
    el.getAnimations().forEach(function (a) {
      if (window.CSSAnimation && a instanceof CSSAnimation) return;
      if (window.CSSTransition && a instanceof CSSTransition) return;
      a.cancel();
    });
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
  var EASE_IO = bezier(0.5, 0, 0.3, 1); // into a result slot

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
  // walk the hero card along a curve with one ease: dense linear keyframes
  function moveHero(path, dur, ease) {
    var frames = [], N = 48;
    for (var k = 0; k <= N; k++) frames.push({ transform: pose(path.at(ease(k / N)), HERO_W, HERO_H), offset: k / N });
    heroMove = { path: path, dur: dur, t0: performance.now(), ease: ease }; // the light swirl follows it
    return anim(hero, frames, { duration: dur, easing: "linear" });
  }

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

  function setTitle(h) {
    var out = anim(title, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.86)" }], { duration: 170, easing: "ease-in" });
    out.onfinish = function () {
      setGradText(title, h);
      animIn(title, [
        { opacity: 0, transform: "scale(1.22)" },
        { opacity: 1, transform: "scale(1)" }
      ], { duration: 420, easing: "cubic-bezier(.2,.9,.3,1.15)" });
      out.cancel();
    };
  }

  // ---------------------------------------------------------------- fan
  var cards = FAN.map(function (p, i) {
    var c = document.createElement("div");
    c.className = "abs card" + (i === HINT ? " hint" : "");
    c.style.transform = pose(p, BACK_W, BACK_H);
    // breathing wave: card i peaks a bit before the next one, the hinted card on the hand press
    var peak = 0.48 - (HINT - i) * 0.07; // fraction of the shared loop
    c.style.setProperty("--d", ((peak - 0.3) - 1) * 1.6 + "s");
    c.innerHTML = '<div class="lift"><i class="glow"></i><div class="cin"></div></div>';
    c.setAttribute("data-i", i);
    // while the mouse is on a card the hint (hand + glowing right card) steps aside
    c.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") stage.classList.add("hovering"); });
    c.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") stage.classList.remove("hovering"); });
    fanEl.appendChild(c);
    return c;
  });

  function setIdle(on) {
    stage.classList.toggle("idle", on);
    hand.className = "abs img hand " + (on ? "on" : "off");
  }

  // ---------------------------------------------------------------- result slots
  var pipsEl = $("pips");
  var pips = PIP_X.map(function (x, k) {
    var el = document.createElement("div");
    el.className = "pip abs" + (k === 0 ? " next" : "");
    var p = { x: x, y: PIP_Y, r: 0, sx: PIP_S, sy: PIP_S };
    el.style.transform = pose(p, HERO_W, HERO_H);
    el.innerHTML = '<i class="glow"></i><div class="pflip abs fill">' +
      '<div class="pback abs img fill"></div><div class="pres abs fill"></div><div class="pgold abs fill k-win"></div></div>';
    pipsEl.appendChild(el);
    return {
      el: el, p: p, flip: el.querySelector(".pflip"),
      res: el.querySelector(".pres"), gold: el.querySelector(".pgold")
    };
  });

  // the drawn card's face goes into slot k (a scaled copy of the hero face)
  function fillPip(k, kind) {
    var pp = pips[k];
    pp.res.className = "pres abs fill k-" + kind;
    pp.res.innerHTML = "";
    pp.res.appendChild(cloneFace());
    pp.el.classList.add("filled");
    pp.el.classList.remove("next");
    if (pips[k + 1]) pips[k + 1].el.classList.add("next");
  }

  // ---------------------------------------------------------------- pick
  var started = false, busy = true, round = 0;
  var fanAnim = null, away = [];

  function toStage(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (t.clientX - view.ox) / view.s, y: (t.clientY - view.oy) / view.s };
  }

  function onPress(e) {
    if (!started || busy) return;
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
    busy = true;
    setIdle(false);
    var kind = KINDS[round], last = kind === "win";
    var f = FAN[i];

    // the chosen card becomes the hero card, exactly where it was
    cards[i].style.visibility = "hidden";
    var start = { x: f.x, y: f.y, r: f.r, sx: BACK_W / HERO_W, sy: BACK_H / HERO_H };
    var rad = f.r * Math.PI / 180;
    // picked while hovered (mouse): start from the raised, glowing hover pose, not the fan pose
    var hovered = HOVER.matches && cards[i].matches(":hover");
    if (hovered) {
      start.x += Math.sin(rad) * HOVER_LIFT;
      start.y -= Math.cos(rad) * HOVER_LIFT;
      start.sx *= HOVER_SCALE;
      start.sy *= HOVER_SCALE;
    }
    var lift = { x: f.x + Math.sin(rad) * 70, y: f.y - Math.cos(rad) * 70, r: f.r, sx: start.sx * 1.08, sy: start.sy * 1.08 };
    hero.style.visibility = "visible";
    hero.style.transform = pose(start, HERO_W, HERO_H);
    anim(back.querySelector(".glow"), [{ opacity: hovered ? 1 : 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 800 });

    // the others drift away and sink into the shadows. Opacity goes on the whole fan as one
    // layer, so the faded cards don't show through each other.
    away = cards.map(function (c, k) {
      if (k === i) return null;
      var p = FAN[k], dir = k < i ? -1 : 1;
      var to = { x: p.x + dir * 60, y: p.y + 30, r: p.r + dir * 4, sx: 0.94, sy: 0.94 };
      return { to: to, a: anim(c, [{ transform: pose(p, BACK_W, BACK_H) }, { transform: pose(to, BACK_W, BACK_H) }], { duration: 420, easing: EASE_OUT }) };
    });
    var dim = last && !HOLD ? 0.15 : 0.35;
    fanAnim = anim(fanEl, [{ opacity: 1 }, { opacity: 0.35, offset: 0.25 }, { opacity: 0.35, offset: 0.6 }, { opacity: dim }], { duration: last ? PATH_MS : SHOW_MS, easing: "linear" });

    // One continuous move along a smooth curve: lift -> (draws 1-2) to the show pose, or
    // (last draw) through the frame-3 pose where it flips straight into the final frame-4 pose,
    // with a single ease over the whole length, so the speed never jumps between the states.
    var way, dur, flipMark;
    if (last) {
      way = HOLD ? [start, lift, REVEAL] : [start, lift, REVEAL, FINAL];
      dur = HOLD ? PATH_MS * 0.6 : PATH_MS;
    } else {
      way = [start, lift, SHOW[round]];
      dur = SHOW_MS;
    }
    var path = curve(way);
    flipMark = last ? path.mark[2] : path.mark[1] + (1 - path.mark[1]) * 0.72;
    var flipAt = 1;
    for (var q = 0; q <= 1000; q++) if (EASE(q / 1000) >= flipMark) { flipAt = q / 1000; break; }
    moveHero(path, dur, EASE);

    // fast 2D flip on the way, centred on the moment it passes the flip point
    setTimeout(function () {
      var a = anim(flip, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 140, easing: "ease-in" });
      a.onfinish = function () {
        back.style.visibility = "hidden";
        front.style.visibility = "visible";
        var o = anim(flip, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 200, easing: "ease-out" });
        reveal(kind, i, o);
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
    return heroMove.path.at(heroMove.ease(Math.min(1, (now - heroMove.t0) / heroMove.dur)));
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

  // ---------------------------------------------------------------- results
  function reveal(kind, i, opened) {
    hero.classList.add("shown");
    var at = kind === "win" ? REVEAL : SHOW[round];
    if (kind === "lose") {
      // an empty grey card: a dull knock and some dust, no light
      opened.onfinish = function () {
        anim(flip, [
          { transform: "rotate(0deg)" }, { transform: "rotate(-3.5deg)", offset: 0.25 },
          { transform: "rotate(2deg)", offset: 0.55 }, { transform: "rotate(0deg)" }
        ], { duration: 420, easing: "ease-out" });
      };
      sparks(at.x, at.y + 200, 14, { cls: "dust", dist: 160, jx: 160, size: 1.3, dur: 900, gravity: 60, angle: -Math.PI / 2, spread: 2.4 });
      setTitle(T.retry);
      setTimeout(function () { toSlot(i, kind); }, LOOK_MS[round]);
      return;
    }

    // the burst of light on the face is a plain overlay fading out (no filter repaint)
    anim(burst, [{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: "ease-out" });
    if (kind === "half") {
      // half the prize: real gold, but a smaller celebration that leaves you wanting the rest
      anim($("flash"), [{ opacity: 0 }, { opacity: 0.35, offset: 0.2 }, { opacity: 0 }], { duration: 700, easing: "ease-out" });
      sparks(at.x, at.y, 16, { dist: 330, size: 1.2, dur: 900 });
      setTitle(T.oneMore);
      setTimeout(function () { toSlot(i, kind); }, LOOK_MS[round]);
      return;
    }

    anim($("flash"), [{ opacity: 0 }, { opacity: 0.7, offset: 0.2 }, { opacity: 0 }], { duration: 800, easing: "ease-out" });
    swirlStart(); // the arc of light wraps around the card while it settles
    sparks(REVEAL.x, REVEAL.y, 26, { dist: 420, size: 1.5, dur: 1000 });
    setTitle(T.win);
    jackpot();
  }

  // Draws 1-2: the shown card shrinks down into its slot under the fan, while the fan comes
  // back to life with a fresh card dealt into the gap.
  function toSlot(i, kind) {
    var k = round, from = SHOW[k], to = pips[k].p;
    var lean = to.x < from.x ? -7 : to.x > from.x ? 7 : 0;
    var mid = { x: from.x + (to.x - from.x) * 0.4, y: from.y + (to.y - from.y) * 0.45, r: lean, sx: 0.62, sy: 0.62 };
    var a = moveHero(curve([from, mid, to]), TO_SLOT_MS, EASE_IO);
    anim(halo, [{ opacity: getComputedStyle(halo).opacity }, { opacity: 0 }], { duration: 260 });
    setTimeout(function () { fanBack(i); }, 120);
    a.onfinish = function () {
      fillPip(k, kind);
      resetHero();
      animIn(pips[k].flip, [{ transform: "scale(1)" }, { transform: "scale(1.14)", offset: 0.35 }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
      if (kind === "lose") sparks(to.x, to.y, 8, { cls: "dust", dist: 110, size: 0.9, dur: 700 });
      else sparks(to.x, to.y, 12, { dist: 170, size: 0.9, dur: 750 });
      round++;
      setFace(KINDS[round]);
      setTimeout(function () {
        busy = false;
        setIdle(true);
        autoPick();
      }, 120);
    };
  }

  function fanBack(i) {
    var op = getComputedStyle(fanEl).opacity;
    if (fanAnim) fanAnim.cancel();
    animIn(fanEl, [{ opacity: op }, { opacity: 1 }], { duration: 520, easing: "ease-out" });
    cards.forEach(function (c, k) {
      var p = FAN[k];
      if (k === i) { // a fresh card is dealt into the gap
        c.style.visibility = "visible";
        animIn(c, [
          { transform: pose({ x: p.x, y: p.y + 150, r: p.r, sx: 0.82, sy: 0.82 }, BACK_W, BACK_H), opacity: 0 },
          { transform: pose(p, BACK_W, BACK_H), opacity: 1 }
        ], { duration: 560, delay: 160, easing: "cubic-bezier(.2,.9,.3,1.06)" });
        return;
      }
      var to = away[k].to;
      away[k].a.cancel();
      animIn(c, [{ transform: pose(to, BACK_W, BACK_H) }, { transform: pose(p, BACK_W, BACK_H) }], { duration: 520, easing: EASE_OUT });
    });
  }

  function resetHero() {
    [hero, flip, halo, burst, back.querySelector(".glow")].forEach(stopAnims);
    hero.style.visibility = "hidden";
    back.style.visibility = "";
    front.style.visibility = "";
    hero.classList.remove("shown");
    heroMove = null;
  }

  // Last draw: all three slots flip over to gold, then melt into the prize plate.
  function jackpot() {
    var FLIP0 = 150, STEP = 120;
    pips.forEach(function (pp, k) {
      setTimeout(function () {
        var a = anim(pp.flip, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 150, easing: "ease-in" });
        a.onfinish = function () {
          pp.el.classList.add("gold");
          pp.el.classList.remove("next");
          anim(pp.flip, [
            { transform: "scale(0, 1)" }, { transform: "scale(1.16, 1.16)", offset: 0.6 }, { transform: "scale(1, 1)" }
          ], { duration: 380, easing: "ease-out" });
          a.cancel();
          sparks(pp.p.x, pp.p.y, 12, { dist: 200, size: 1, dur: 750 });
        };
      }, FLIP0 + k * STEP);
    });
    if (HOLD) return;

    var MELT = FLIP0 + 2 * STEP + 530 + 420; // last flip done, then a moment to enjoy three gold cards
    setTimeout(function () {
      pips.forEach(function (pp, k) {
        var to = { x: PLATE_C.x, y: PLATE_C.y, r: 0, sx: PIP_S * 0.45, sy: PIP_S * 0.45 };
        anim(pp.el, [
          { transform: pose(pp.p, HERO_W, HERO_H), opacity: 1 },
          { transform: pose(to, HERO_W, HERO_H), opacity: 0 }
        ], { duration: 420, delay: Math.abs(k - 1) * 50, easing: "cubic-bezier(.55,0,.75,.2)" });
      });
    }, MELT);

    // "TU BONO: 125 GIROS GRATIS" pops up as the slots pour into it
    setTimeout(function () {
      $("plate").style.opacity = 1;
      animIn($("plate"), [
        { opacity: 0, transform: "scale(0.7)" },
        { opacity: 1, transform: "scale(1.06)", offset: 0.6 },
        { opacity: 1, transform: "none" }
      ], { duration: 420, easing: "ease-out" });
      sparks(PLATE_C.x, PLATE_C.y, 22, { dist: 420, jx: 300, size: 1.2, dur: 900, spread: Math.PI, angle: -Math.PI / 2 });
    }, MELT + 300);

    setTimeout(finale, MELT + 560);
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

  // QA hooks: ?pick=0..4 keeps picking that card, ?round=2..3 starts at that draw,
  // &hold=1 stops on the revealed last card
  var m = /[?&]pick=(\d)/.exec(location.search);
  var r0 = /[?&]round=([1-3])/.exec(location.search);
  function autoPick() {
    if (m) setTimeout(function () { if (started && !busy) pick(+m[1] % 5); }, 700);
  }

  function start() {
    if (started) return;
    started = true;
    fit();
    Array.prototype.forEach.call(gts, fitText); // re-measure with the web font loaded
    fitted.forEach(fitText);
    // the gold faces every slot turns to at the end
    setFace("win");
    pips.forEach(function (pp) { pp.gold.appendChild(cloneFace()); });
    for (round = 0; r0 && round < +r0[1] - 1; round++) { setFace(KINDS[round]); fillPip(round, KINDS[round]); }
    if (round) setGradText(title, round === 1 ? T.retry : T.oneMore);
    setFace(KINDS[round]);
    stage.classList.remove("loading");
    busy = false;
    setIdle(true);
    AD.gameReady();
    autoPick();
  }

  AD.onReady(function () {
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var loaded = document.readyState === "complete" ? Promise.resolve() : new Promise(function (r) { window.addEventListener("load", r); });
    Promise.all([fonts, loaded]).then(start, start);
    setTimeout(start, 2500); // never get stuck on a slow font load
  });

  // QA: window.__swirlAt(0..1) draws one frame of the light swirl at that moment of its life
  if (m) window.__swirlAt = function (t) {
    if (!swirl.ctx) swirlStart();
    var now = performance.now();
    swirl.t0 = now - t * SWIRL_MS;
    swirl.last = now - 16;
    swirlFrame(now);
  };
})();
