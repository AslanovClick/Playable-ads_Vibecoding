(function () {
  "use strict";

  var CFG = window.PLAYABLE_CONFIG, T = CFG.text;
  var W = 1089, H = 1920; // Figma frame

  // Weapons: crop box of each sprite in its Figma asset frame, and where the grip end and the
  // head tip are inside the sprite (fractions, printed by tools/prepare_assets.py).
  var WEAPONS = [
    { cls: "bat", frame: [1271, 1237], box: [174, 59, 1175, 1154], grip: [0.030, 0.953], tip: [0.948, 0.037] },
    { cls: "golf", frame: [1254, 1254], box: [102, 36, 1151, 1203], grip: [0.019, 0.981], tip: [0.909, 0.018] },
    { cls: "hammer", frame: [1254, 1254], box: [153, 36, 1167, 1171], grip: [0.029, 0.955], tip: [0.782, 0.121] }
  ];
  // In hand (Figma frames 3-5): the asset frame is 557 px wide, centred here, turned -15deg.
  var HELD = { cx: 169.2, cy: 1034.8, w: 557, r: -15 };
  var HOLD_AT = 0.14; // the hands hold it this far along from the grip end: the swing pivot
  // Weapon panel: slot origins (stage px) and each sprite's box inside its slot (style.css)
  var PICK = [{ x: 138, y: 1395 }, { x: 421.5, y: 1395 }, { x: 705, y: 1395 }];
  var IN_SLOT = [[12, -29, 255.5, 280], [13, -35, 251, 280], [13, -18, 241, 270]];

  var PINATA = { x: 278.45, y: 418 }; // pinata box (575x831) on the stage
  // where each strike lands on the pinata (pinata px): the cracks spread from here
  var HIT_AT = [[325, 400], [318, 430], [300, 520], [300, 560]];
  var STRIKES = 4;

  var HAND_TIP = [59.6, 37.9]; // fingertip inside the hand sprite
  var TIP_CHOOSE = [298, 1572], TIP_PLAY = [637, 1056], TIP_CTA = [774, 1478];

  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), scene = $("scene"), swing = $("swing"), pinata = $("pinata");
  var weapon = $("weapon"), wimg = weapon.querySelector(".wimg"), panel = $("panel");
  var hand = $("hand"), taps = $("taps"), cta = $("cta"), title = $("title");
  var picks = Array.prototype.slice.call(panel.querySelectorAll(".pick"));

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
  var amount = CFG.bonusAmount.toLocaleString(CFG.locale);
  title.setAttribute("data-html", T.title);
  $("choose").setAttribute("data-html", T.choose);
  cta.setAttribute("data-html", T.hits[0]);
  $("bonus").setAttribute("data-html", T.bonus + "<br><small>" + amount + " " + CFG.bonusUnit + "</small>");
  $("btnText").firstElementChild.innerHTML = T.cta;
  var gts = stage.querySelectorAll(".gt");
  Array.prototype.forEach.call(gts, function (el) { setGradText(el, el.getAttribute("data-html")); });

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
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function later(ms, f) { return setTimeout(f, ms); }
  // cubic-bezier easing as a function (same curve CSS would use)
  function bezier(x1, y1, x2, y2) {
    function at(a, b, t) { return 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t; }
    return function (x) {
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
      return at(y1, y2, t);
    };
  }

  function swapText(el, h) {
    var out = anim(el, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.8)" }], { duration: 120, easing: "ease-in" });
    out.onfinish = function () {
      setGradText(el, h);
      animIn(el, [
        { opacity: 0, transform: "scale(1.35)" },
        { opacity: 1, transform: "scale(0.94)", offset: 0.6 },
        { opacity: 1, transform: "scale(1)" }
      ], { duration: 420, easing: "ease-out" });
      out.cancel();
    };
  }

  function placeHand(tip) {
    hand.style.left = tip[0] - HAND_TIP[0] + "px";
    hand.style.top = tip[1] - HAND_TIP[1] + "px";
    taps.style.left = tip[0] - 6 - 75 + "px"; // centred on the fingertip at the press
    taps.style.top = tip[1] - 6 - 75 + "px";
  }
  function setIdle(on) {
    stage.classList.toggle("idle", on);
    hand.className = "abs img hand " + (on ? "on" : "off");
    taps.className = "abs" + (on ? " on" : "");
  }

  // ---------------------------------------------------------------- weapon geometry
  // A weapon is drawn by #weapon, which sits on the swing pivot (the hands) and is turned
  // around it; the sprite inside is offset so that the pivot is at its origin.
  var held = null; // { w, h, px, py, P: pivot on the stage, r }

  function rot(x, y, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
  }
  function heldPose(wp) {
    var k = HELD.w / wp.frame[0];
    var w = (wp.box[2] - wp.box[0]) * k, h = (wp.box[3] - wp.box[1]) * k;
    var left = HELD.cx - wp.frame[0] * k / 2 + wp.box[0] * k;
    var top = HELD.cy - wp.frame[1] * k / 2 + wp.box[1] * k;
    var fx = wp.grip[0] + (wp.tip[0] - wp.grip[0]) * HOLD_AT, fy = wp.grip[1] + (wp.tip[1] - wp.grip[1]) * HOLD_AT;
    var px = fx * w, py = fy * h;
    var d = rot(left + px - HELD.cx, top + py - HELD.cy, HELD.r);
    return { wp: wp, w: w, h: h, px: px, py: py, P: [HELD.cx + d[0], HELD.cy + d[1]], r: HELD.r };
  }
  function wpose(x, y, r, s) {
    return "translate(" + x + "px," + y + "px) rotate(" + r + "deg) scale(" + (s || 1) + ")";
  }
  function heldAt(a) { return wpose(held.P[0], held.P[1], held.r + a); }
  // a point along the weapon (0 = grip end, 1 = tip) when swung by a degrees
  function along(f, a) {
    var wp = held.wp;
    var x = (wp.grip[0] + (wp.tip[0] - wp.grip[0]) * f) * held.w - held.px;
    var y = (wp.grip[1] + (wp.tip[1] - wp.grip[1]) * f) * held.h - held.py;
    var d = rot(x, y, held.r + a);
    return [held.P[0] + d[0], held.P[1] + d[1]];
  }

  // ---------------------------------------------------------------- particles (one canvas)
  var fx = { cv: $("fx"), ctx: null, k: 1, list: [], run: false, last: 0, rain: 0 };
  function sprite(size, draw) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    return c;
  }
  var DOT = sprite(64, function (g, n) { // soft glow
    var r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, "rgba(255,255,245,1)");
    r.addColorStop(0.25, "rgba(255,232,150,0.9)");
    r.addColorStop(0.6, "rgba(255,170,50,0.35)");
    r.addColorStop(1, "rgba(255,140,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, n, n);
  });
  // Coins cut out of the burst art (tools/prepare_assets.py): one strip of cells, each a coin
  // seen at its own angle, so the flying coins look like the coins in the picture.
  var COIN_CELL = 192, COIN_N = 9, COIN_SHEET = new Image();
  (function () {
    var m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(document.documentElement).getPropertyValue("--img-coin"));
    if (m) COIN_SHEET.src = m[1];
  })();
  var PAPER = ["#ff2d55", "#ffd400", "#21d07a", "#ff4fd8", "#1fb6ff", "#ff7a00", "#9b5cff"];
  var CHIPS = ["#e8121c", "#ff3b2f", "#25b832", "#ffcf1f", "#ff4fd8", "#1d9bf0"]; // pinata colours

  function fxStart() {
    if (!fx.ctx) {
      var dpr = window.devicePixelRatio || 1;
      fx.k = Math.min(1, view.s * dpr);
      fx.cv.width = Math.round(W * fx.k);
      fx.cv.height = Math.round(H * fx.k);
      fx.ctx = fx.cv.getContext("2d");
    }
    if (!fx.run) { fx.run = true; fx.last = performance.now(); requestAnimationFrame(fxFrame); }
  }
  function add(p) { fx.list.push(p); fxStart(); }

  function sparks(x, y, n, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var a = (o.angle || 0) + rnd(-0.5, 0.5) * (o.spread != null ? o.spread : Math.PI * 2), sp = rnd(0.25, 1) * (o.speed || 1.1);
      add({ t: "spark", x: x + rnd(-8, 8), y: y + rnd(-8, 8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.0016, drag: 0.992, age: 0, life: rnd(350, 750), size: rnd(14, 34) * (o.size || 1) });
    }
  }
  function chips(x, y, n, o) { // paper bits of the pinata
    o = o || {};
    for (var i = 0; i < n; i++) {
      var a = (o.angle || 0) + rnd(-0.5, 0.5) * (o.spread != null ? o.spread : Math.PI * 2), sp = rnd(0.3, 1) * (o.speed || 0.9);
      add({ t: "paper", x: x + rnd(-15, 15), y: y + rnd(-15, 15), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.0022, drag: 0.985,
        rot: rnd(0, 6.3), vr: rnd(-0.02, 0.02), flip: rnd(0, 6.3), vf: rnd(0.01, 0.03),
        w: rnd(14, 30) * (o.size || 1), h: rnd(10, 22) * (o.size || 1), c: pick(o.colors || CHIPS), age: 0, life: rnd(700, 1300) });
    }
  }
  // "pop": thrown up and out by the blast; "pour": spilling down out of the opening over a
  // moment. Coins with a floor land on the cobbles, bounce and settle.
  function coins(x, y, n, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var pour = o.mode === "pour";
      var a = pour ? Math.PI / 2 + rnd(-0.95, 0.95) : -Math.PI / 2 + rnd(-1.3, 1.3);
      var sp = pour ? rnd(0.15, 0.6) : rnd(0.55, 1.25);
      add({ t: "coin", x: x + rnd(-1, 1) * (o.jx || 50), y: y + rnd(-1, 1) * (o.jy || 50), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.0032, drag: 0.997,
        delay: pour ? rnd(0, o.stagger || 450) : 0, k: Math.floor(rnd(0, COIN_N)), s: rnd(0.42, 0.72) * (o.size || 1),
        rot: rnd(-0.6, 0.6), vr: rnd(-0.004, 0.004), tumble: rnd(0, 6.3), vt: rnd(0.006, 0.014),
        floor: o.floor ? rnd(1470, 1620) : 0, bounces: 0, age: 0, life: o.life || 2600 });
    }
  }
  function confettiRain(ms) { fx.rain = performance.now() + ms; fxStart(); }

  function fxFrame(now) {
    var dt = Math.min(40, now - fx.last), ctx = fx.ctx;
    fx.last = now;
    if (fx.rain > now && fx.list.length < 90 && Math.random() < dt / 45) {
      add({ t: "paper", x: rnd(0, W), y: -30, vx: rnd(-0.05, 0.05), vy: rnd(0.12, 0.22), g: 0, drag: 1, sway: rnd(0, 6.3),
        rot: rnd(0, 6.3), vr: rnd(-0.004, 0.004), flip: rnd(0, 6.3), vf: rnd(0.006, 0.014),
        w: rnd(16, 26), h: rnd(10, 16), c: pick(PAPER), age: 0, life: 12000 });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, fx.cv.width, fx.cv.height);
    ctx.setTransform(fx.k, 0, 0, fx.k, 0, 0);
    for (var i = fx.list.length - 1; i >= 0; i--) {
      var p = fx.list[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      if (p.age >= p.life || p.y > H + 80) { fx.list.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= Math.pow(p.drag, dt / 16); p.vy *= Math.pow(p.drag, dt / 16);
      p.x += p.vx * dt; p.y += p.vy * dt;
      var k = p.age / p.life, fade = k > 0.75 ? (1 - k) / 0.25 : 1;
      if (p.t === "spark") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = fade;
        var s = p.size * (1 - k * 0.6);
        ctx.drawImage(DOT, p.x - s / 2, p.y - s / 2, s, s);
        ctx.globalCompositeOperation = "source-over";
      } else if (p.t === "paper") {
        if (p.sway != null) p.x += Math.sin(p.age / 400 + p.sway) * 0.25;
        p.rot += p.vr * dt; p.flip += p.vf * dt;
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else { // coin: tumbles (never edge-on, the art already shows it at an angle) and turns
        if (p.floor && p.y > p.floor && p.vy > 0) { // lands on the cobbles
          p.y = p.floor;
          if (p.bounces++ < 2) { p.vy *= -0.32; p.vx *= 0.55; p.vr *= 0.5; }
          else { p.vy = 0; p.g = 0; p.vx *= 0.5; p.vt *= 0.5; }
        }
        p.rot += p.vr * dt; p.tumble += p.vt * dt;
        var face = Math.cos(p.tumble), sx = 0.62 + 0.38 * Math.abs(face);
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sx * p.s, p.s);
        if (COIN_SHEET.complete && COIN_SHEET.naturalWidth) ctx.drawImage(COIN_SHEET, p.k * COIN_CELL, 0, COIN_CELL, COIN_CELL, -COIN_CELL / 2, -COIN_CELL / 2, COIN_CELL, COIN_CELL);
        if (face > 0.9) { // a glint as it turns to face the light
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = fade * (face - 0.9) * 10;
          ctx.drawImage(DOT, -COIN_CELL * 0.3, -COIN_CELL * 0.32, COIN_CELL * 0.4, COIN_CELL * 0.4);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (fx.list.length || fx.rain > now) requestAnimationFrame(fxFrame);
    else { fx.run = false; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fx.cv.width, fx.cv.height); }
  }

  // ---------------------------------------------------------------- 1. choose a weapon
  var state = "wait", strikes = 0, busy = false, queued = false;

  function toStage(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (t.clientX - view.ox) / view.s, y: (t.clientY - view.oy) / view.s };
  }

  function onPress(e) {
    if (e.cancelable) e.preventDefault();
    if (state === "choose") {
      var el = e.target.closest ? e.target.closest(".pick") : null, i = 0;
      if (el) i = +el.getAttribute("data-w");
      else { // anywhere else: the slot nearest to the tap
        var p = toStage(e), best = 1e9;
        PICK.forEach(function (s, k) { var d = Math.abs(s.x + 123 - p.x); if (d < best) { best = d; i = k; } });
      }
      choose(i);
    } else if (state === "play") {
      if (busy) queued = true;
      else strike();
    }
  }

  function choose(i) {
    state = "arming";
    setIdle(false);
    stage.classList.remove("choosing");
    var el = picks[i], icon = el.querySelector(".w");
    el.classList.add("on");
    animIn(icon, [{ transform: "scale(1)" }, { transform: "scale(1.22) rotate(-6deg)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
    sparks(PICK[i].x + 123, PICK[i].y + 123, 16, { speed: 0.7, size: 0.9 });

    // the weapon leaves its slot and flies up into the hands at the left
    var wp = WEAPONS[i];
    held = heldPose(wp);
    dressWeapon(wp);
    var b = IN_SLOT[i], s = b[2] / held.w;
    var from = [PICK[i].x + b[0] + held.px * s, PICK[i].y + b[1] + held.py * s];
    later(FLY_AT, function () {
      icon.style.visibility = "hidden"; // the flying weapon takes its place exactly
      // the selection glow of the slot hands over to the glow the weapon carries with it
      anim(el.querySelector(".dust"), [{ opacity: 1 }, { opacity: 0 }], { duration: 260 });
      anim(el.querySelector(".frameGold"), [{ opacity: 1 }, { opacity: 0 }], { duration: 260 });
      stage.classList.add("armed");
      fly(from, s, FLY_MS);
      later(140, function () {
        panel.classList.add("gone");
        $("choose").classList.add("gone");
      });
    });
    later(FLY_AT + FLY_MS - 120, function () {
      cta.style.opacity = 1;
      animIn(cta, [{ opacity: 0, transform: "translateY(40px) scale(0.85)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.9,.3,1.15)" });
    });
    later(FLY_AT + FLY_MS + 60, function () {
      placeHand(TIP_PLAY);
      state = "play";
      setIdle(true);
      auto();
    });
  }

  // The weapon sprite and its glow (soft light behind it, golden dust) are one group that sits
  // on the swing pivot, so the glow moves, turns and scales with the weapon. The glow is placed
  // where Figma has it around the held bat.
  var GLOW_LIGHT = { x: 185, y: 1026.5, r: 24.68 }, GLOW_DUST = { x: 224.5, y: 929, r: -75 };
  function dressWeapon(wp) {
    wimg.className = "wimg abs img " + wp.cls;
    wimg.style.cssText = "left:" + -held.px + "px;top:" + -held.py + "px;width:" + held.w + "px;height:" + held.h + "px";
    [[".wlight", GLOW_LIGHT, 528, 998], [".wdust", GLOW_DUST, 420, 280]].forEach(function (g) {
      var d = rot(g[1].x - held.P[0], g[1].y - held.P[1], -held.r);
      weapon.querySelector(g[0]).style.cssText = "left:" + (d[0] - g[2] / 2) + "px;top:" + (d[1] - g[3] / 2) + "px;" +
        "transform:rotate(" + (g[1].r - held.r) + "deg)";
    });
  }

  // One smooth flight along a curve: up and over to the left, turning into the held angle and
  // growing to full size, with a single ease over the whole way and a small settle at the end.
  var FLY_AT = 420, FLY_MS = 820, FLY_EASE = bezier(0.42, 0, 0.2, 1); // starts when the pick pop ends
  function fly(from, s0, dur) {
    var to = held.P, c = [(from[0] + to[0]) / 2 - 30, Math.min(from[1], to[1]) - 260];
    var frames = [], N = 36;
    for (var k = 0; k <= N; k++) {
      var t = FLY_EASE(k / N), u = 1 - t;
      var x = u * u * from[0] + 2 * u * t * c[0] + t * t * to[0];
      var y = u * u * from[1] + 2 * u * t * c[1] + t * t * to[1];
      var r = held.r * t - 14 * Math.sin(Math.PI * t); // leans back a little on the way
      var sc = s0 + (1 - s0) * t + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.15)); // swells, then settles
      frames.push({ transform: wpose(x, y, r, sc), offset: k / N });
    }
    weapon.style.transform = frames[0].transform; // already in the slot on the very first frame
    weapon.style.visibility = "visible";
    anim(weapon, frames, { duration: dur, easing: "linear" });
    [".wlight", ".wdust"].forEach(function (g) { // the glow fades in as the slot's glow fades out
      animIn(weapon.querySelector(g), [{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.6, easing: "ease-out" });
    });
    later(dur - 40, function () { sparks(to[0] + 70, to[1] - 200, 14, { speed: 0.6, size: 0.8 }); });
  }

  // ---------------------------------------------------------------- 2. strikes
  var SWING_MS = 520, IMPACT = 0.42, SWING = 25; // swing duration, impact moment, swing angle
  var clipOK = window.CSS && CSS.supports && CSS.supports("clip-path", "circle(1px at 1px 1px)");

  function strike() {
    busy = true;
    setIdle(false);
    var n = ++strikes;
    // wind up, swing through, settle back
    anim(weapon, [
      { transform: heldAt(0) },
      { transform: heldAt(-16), offset: 0.24, easing: "cubic-bezier(.4,0,1,1)" },
      { transform: heldAt(SWING), offset: IMPACT, easing: "ease-out" },
      { transform: heldAt(SWING - 7), offset: 0.56, easing: "ease-in-out" },
      { transform: heldAt(0) }
    ], { duration: SWING_MS, easing: "ease-out" });
    later(SWING_MS * IMPACT, function () { impact(n); });
    if (n < STRIKES) later(SWING_MS + 60, function () {
      busy = false;
      if (queued) { queued = false; strike(); }
      else { setIdle(true); auto(); }
    });
  }

  function impact(n) {
    var c = along(0.84, SWING); // where the weapon meets the pinata
    var h = HIT_AT[n - 1], hx = PINATA.x + h[0], hy = PINATA.y + h[1];
    var hard = n === STRIKES;

    // the pinata is knocked away from the weapon and swings back on its rope
    var amp = -(hard ? 9 : 5 + n); // negative: the bottom swings right, away from the weapon
    anim(swing, [
      { transform: "rotate(0deg)" }, { transform: "rotate(" + amp + "deg)", offset: 0.18 },
      { transform: "rotate(" + -amp * 0.55 + "deg)", offset: 0.42 }, { transform: "rotate(" + amp * 0.28 + "deg)", offset: 0.66 },
      { transform: "rotate(" + -amp * 0.1 + "deg)", offset: 0.85 }, { transform: "rotate(0deg)" }
    ], { duration: hard ? 1500 : 1250, easing: "ease-out" });
    animIn(pinata, [{ transform: "scale(1)" }, { transform: "scale(1.06,0.94)", offset: 0.3 }, { transform: "scale(0.98,1.02)", offset: 0.65 }, { transform: "scale(1)" }], { duration: 300 });
    var j = hard ? 18 : 9;
    animIn(scene, [
      { transform: "translate(0,0)" }, { transform: "translate(" + j + "px," + -j * 0.6 + "px)" }, { transform: "translate(" + -j * 0.8 + "px," + j * 0.5 + "px)" },
      { transform: "translate(" + j * 0.5 + "px," + j * 0.3 + "px)" }, { transform: "translate(0,0)" }
    ], { duration: hard ? 320 : 220 });

    sparks(c[0], c[1], hard ? 30 : 18, { speed: 1.1 });
    chips(c[0], c[1], hard ? 0 : 7 + n * 3, { angle: -0.4, spread: 2.6 });
    if (n < STRIKES) crack(n, h);
    else burst(hx, hy);
    if (n < STRIKES) swapText(cta, T.hits[n]);
  }

  // a new, bigger crack spreads from the hit point over the previous one, its glow flares up
  function crack(n, h) {
    var hot = pinata.querySelector(".hit");
    hot.style.left = h[0] + "px";
    hot.style.top = h[1] + "px";
    anim(hot, [{ opacity: 0, transform: "scale(0.3)" }, { opacity: 1, transform: "scale(1)", offset: 0.25 }, { opacity: 0, transform: "scale(1.5)" }], { duration: 520, easing: "ease-out" });

    var el = pinata.querySelector(".c" + n), prev = pinata.querySelector(".c" + (n - 1));
    var glow = pinata.querySelector(".g" + n), prevGlow = pinata.querySelector(".g" + (n - 1));
    el.classList.add("on");
    var a;
    if (clipOK) {
      var at = " at " + h[0] + "px " + h[1] + "px)";
      a = animIn(el, [{ clipPath: "circle(0px" + at }, { clipPath: "circle(760px" + at }], { duration: 520, easing: "cubic-bezier(.15,.75,.35,1)" });
    } else a = animIn(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    a.onfinish = function () { a.cancel(); if (prev) prev.classList.remove("on"); };

    glow.classList.add("on");
    animIn(glow, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.55 }, { opacity: 0.75 }], { duration: 700 });
    if (prevGlow) {
      var g = anim(prevGlow, [{ opacity: 0.8 }, { opacity: 0 }], { duration: 400 });
      g.onfinish = function () { prevGlow.classList.remove("on"); g.cancel(); };
    }
  }

  // ---------------------------------------------------------------- 3. burst and prize
  function burst(hx, hy) {
    state = "burst";
    var b = $("burst");
    anim($("flash"), [{ opacity: 0 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0 }], { duration: 750, easing: "ease-out" });
    pinata.style.visibility = "hidden";
    b.style.visibility = "visible";
    // the burst frame (coins pouring out) stays: it is the last pinata state
    animIn(b, [{ transform: "scale(0.9)" }, { transform: "scale(1.06)", offset: 0.35 }, { transform: "scale(0.99)", offset: 0.7 }, { transform: "scale(1)" }], { duration: 700, easing: "ease-out" });
    coins(hx, hy, 16, { floor: true }); // blown out
    coins(hx, hy + 40, 30, { mode: "pour", floor: true, jx: 70, jy: 40, stagger: 520 }); // spilling out
    chips(hx, hy, 34, { speed: 1.3, size: 1.3 });
    chips(hx, hy, 24, { speed: 1.1, colors: PAPER });
    sparks(hx, hy, 34, { speed: 1.4, size: 1.3 });

    stage.classList.remove("armed", "idle-sway");
    anim(weapon, [{ transform: heldAt(0), opacity: 1 }, { transform: wpose(held.P[0] - 260, held.P[1] + 140, held.r - 30), opacity: 0 }], { duration: 500, delay: 350, easing: "ease-in" });
    anim(cta, [{ opacity: 1 }, { opacity: 0, transform: "translateY(40px)" }], { duration: 300, delay: 200 });
    later(1050, prize);
  }

  function prize() {
    state = "end";
    var pop = $("popup");
    anim($("dim"), [{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
    pop.classList.add("on");
    pop.style.opacity = 1;
    animIn(pop, [
      { opacity: 0, transform: "translateY(80px) scale(0.86)" },
      { opacity: 1, transform: "scale(1.02)", offset: 0.7 },
      { opacity: 1, transform: "none" }
    ], { duration: 520, easing: "ease-out" });
    animIn(pop.querySelector(".coins"), [
      { transform: "translateY(-260px) scale(0.5)", opacity: 0 },
      { transform: "translateY(16px) scale(1.06)", opacity: 1, offset: 0.65 },
      { transform: "translateY(0) scale(1)", opacity: 1 }
    ], { duration: 650, delay: 160, easing: "ease-out" });
    animIn($("bonus"), [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1.08)", offset: 0.6 }, { opacity: 1, transform: "none" }], { duration: 480, delay: 380, easing: "ease-out" });
    animIn($("btn"), [{ opacity: 0, transform: "translateY(60px) scale(0.9)" }, { opacity: 1, transform: "none" }], { duration: 440, delay: 560, easing: "cubic-bezier(.2,.9,.3,1.15)" });
    later(450, function () {
      sparks(544, 790, 26, { speed: 1, size: 1.2 });
      coins(544, 780, 12, { size: 0.8, life: 2200 });
      confettiRain(1e9);
    });
    stage.classList.add("end");
    AD.gameEnd();
    later(1100, function () {
      stage.classList.add("cta");
      placeHand(TIP_CTA);
      hand.className = "abs img hand on";
    });
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
  $("popup").addEventListener("pointerdown", function (e) { if (state === "end") onCta(e); });

  // QA hooks: ?w=0..2 picks that weapon, &auto=1 keeps striking, ?end=1 jumps to the prize
  var qs = location.search, qw = /[?&]w=(\d)/.exec(qs), qauto = /[?&]auto=1/.test(qs);
  function auto() {
    if (state === "choose" && qw) later(700, function () { if (state === "choose") choose(+qw[1] % 3); });
    if (state === "play" && qauto) later(650, function () { if (state === "play" && !busy) strike(); });
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    fit();
    Array.prototype.forEach.call(gts, fitText); // re-measure with the web font loaded
    fitText($("btnText"));
    stage.classList.remove("loading");
    stage.classList.add("choosing", "idle-sway");
    placeHand(TIP_CHOOSE);
    state = "choose";
    setIdle(true);
    AD.gameReady();
    if (/[?&]end=1/.test(qs)) { setIdle(false); panel.classList.add("gone"); $("choose").classList.add("gone"); pinata.style.visibility = "hidden"; $("burst").style.visibility = "visible"; prize(); return; }
    auto();
  }

  AD.onReady(function () {
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var loaded = document.readyState === "complete" ? Promise.resolve() : new Promise(function (r) { window.addEventListener("load", r); });
    Promise.all([fonts, loaded]).then(start, start);
    setTimeout(start, 2500); // never get stuck on a slow font load
  });
})();
