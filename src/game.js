(function () {
  "use strict";

  var CFG = window.PLAYABLE_CONFIG, T = CFG.text, GIRLS = CFG.girls, CLIPS = window.PLAYABLE_CLIPS;
  var W = 1080, H = 1920;

  // ---------------------------------------------------------------- timings (measured on the clips)
  // Loops: cross-fade from `out` back to `in` (seconds), where her pose matches best.
  var LOOPS = {
    real_jade_loop: [5.0, 0.21], real_mia_loop: [4.46, 0.58], real_scarlett_loop: [4.21, 0.46], real_yuna_loop: [5.0, 0.29],
    anime_jade_loop: [4.58, 0.29], anime_mia_loop: [4.12, 0.12], anime_scarlett_loop: [5.0, 0.25], anime_yuna_loop: [5.0, 0],
    real_jade_greet: [5.0, 0.12], real_mia_greet: [5.0, 0.46], real_scarlett_greet: [5.0, 0.29], real_yuna_greet: [5.0, 0.12],
    anime_jade_greet: [5.0, 0], anime_mia_greet: [5.0, 0.08], anime_scarlett_greet: [4.5, 0.04], anime_yuna_greet: [5.0, 0.21],
  };
  var WIN = {}, WAIT = 1000; // (hand-over windows: none needed any more, the clips just cross-fade)
  // The greeting is filmed closer than the loop: it starts scaled / shifted [s, x, y] (source px,
  // about the frame's centre) to line up with her in the loop, then eases to its own framing while
  // the camera moves in.
  var GREET_MATCH = {
    real_jade: [0.78, -165, 130], real_mia: [0.72, -160, 125], real_scarlett: [0.79, -145, 150], real_yuna: [0.78, -195, 140],
    anime_jade: [0.8, -135, 180], anime_mia: [0.81, -150, 155], anime_scarlett: [0.78, -155, 150], anime_yuna: [0.83, -190, 150],
  };
  // Where the 1090 x 1920 source frame sits on the stage: [scale, x, y]. Step 2: large, on the
  // left of the thumbnails, her head under her name; step 3: centred, a little higher.
  var FRAME = { s2: [1.3, -188, -265], s3: [1, -5, 38] };
  var PILL_TOP = { s2: 330, s3: 150 };

  // Layout: her message sits on this line, above the button
  var CHAT_BOTTOM = 1418;

  // ---------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), hero = $("hero"), heroV = $("heroV"), cardsEl = $("cards"), thumbsEl = $("thumbs");
  var titleEl = $("title"), pill = $("pill"), chat = $("chat"), btn = $("btn"), fx = $("fx");
  var navUp = $("navUp"), navDown = $("navDown");
  var Q = (function () { var q = {}; location.search.replace(/[?&]([^=&]+)=?([^&]*)/g, function (_, k, v) { q[k] = v; }); return q; })();
  var view = window.VIEW;
  function toStage(e) { return { x: (e.clientX - view.ox) / view.s, y: (e.clientY - view.oy) / view.s }; }

  var EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  var SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
  var CAMERA = "cubic-bezier(0.45, 0, 0.2, 1)";
  function anim(el, frames, ms, easing, delay) {
    if (!el.animate) { var last = frames[frames.length - 1]; for (var k in last) if (k !== "offset") el.style[k] = last[k]; return { finished: Promise.resolve(), cancel: function () {} }; }
    var a = el.animate(frames, { duration: ms, easing: easing || EASE_OUT, delay: delay || 0, fill: "both" });
    if (!a.finished) a.finished = new Promise(function (r) { a.onfinish = r; });
    // keep the end state as inline style and drop the animation, so CSS classes work afterwards
    a.finished.then(function () {
      var last = frames[frames.length - 1];
      for (var k in last) if (k !== "offset" && k !== "easing") el.style[k] = last[k];
      try { a.cancel(); } catch (e) {}
    }, function () {});
    return a;
  }
  function show(el, ms, delay, from, to) {
    return anim(el, [{ opacity: 0, transform: from || "translateY(30px)" }, { opacity: 1, transform: to || "none" }], ms || 500, EASE_OUT, delay);
  }
  function hide(el, ms, delay, to, from) {
    return anim(el, [{ opacity: getComputedStyle(el).opacity, transform: from || "none" }, { opacity: 0, transform: to || "translateY(-20px)" }], ms || 400, "cubic-bezier(0.4, 0, 0.7, 1)", delay);
  }
  var state = "start";
  function later(ms, fn) { var s = state; return setTimeout(function () { if (state === s) fn(); }, ms); }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
  function frameCss(f) { return "translate(" + f[1] + "px," + f[2] + "px) scale(" + f[0] + ")"; }

  // ---------------------------------------------------------------- sound (synthesised, no files)
  var Sound = (function () {
    var ctx = null, out = null, on = false;
    function init() {
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          ctx = new AC(); out = ctx.createGain(); out.gain.value = 0.7; out.connect(ctx.destination);
        }
        if (ctx.state === "suspended") ctx.resume();
      } catch (e) { ctx = null; }
    }
    function ok() { return on && ctx && ctx.state === "running"; }
    function tone(f, t, dur, type, vol, f2) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
    return {
      init: init, setOn: function (v) { on = v; },
      tap: function () { if (ok()) tone(660, ctx.currentTime, 0.12, "sine", 0.18, 330); },
      pop: function () { if (ok()) tone(780, ctx.currentTime, 0.09, "triangle", 0.1, 1250); },
      swish: function () { if (ok()) tone(420, ctx.currentTime, 0.16, "sine", 0.08, 880); },
      ping: function () { // incoming message
        if (!ok()) return; var t = ctx.currentTime;
        tone(1318.5, t, 0.32, "sine", 0.2); tone(1760, t + 0.085, 0.5, "sine", 0.18); tone(3520, t + 0.085, 0.25, "sine", 0.025);
      },
      sparkle: function () { if (!ok()) return; var t = ctx.currentTime; for (var k = 0; k < 5; k++) tone(1900 + Math.random() * 1900, t + k * 0.05, 0.28, "sine", 0.06); },
      suspend: function () { try { if (ctx) ctx.suspend(); } catch (e) {} },
      resume: function () { try { if (ctx) ctx.resume(); } catch (e) {} },
    };
  })();

  // ---------------------------------------------------------------- video players
  // A player is a box in the source frame's pixels with a few stacked <video> layers. A new clip
  // starts on a free layer and fades in over the current one once its first frame is on screen;
  // loops fade into a fresh copy of themselves at their loop point instead of jumping.
  var urls = {};
  function url(name) {
    if (urls[name]) return urls[name];
    var s = CLIPS[name].src;
    if (s.indexOf("data:") === 0) {
      var bin = atob(s.slice(s.indexOf(",") + 1)), n = bin.length, arr = new Uint8Array(n);
      for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
      s = URL.createObjectURL(new Blob([arr], { type: "video/mp4" }));
    }
    return (urls[name] = s);
  }
  var players = [];
  function Player(box, n) {
    var els = [], cur = null, z = 1, seq = 0, pending = null, blocked = false, hidden = [];
    for (var i = 0; i < n; i++) {
      var v = mk("video", "lay");
      v.muted = true; v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
      v.playsInline = true; v.preload = "auto"; v.setAttribute("disableremoteplayback", ""); v._clip = null;
      box.appendChild(v); els.push(v);
    }
    function place(v, name) { // the clip's crop, in the source frame; scaled about the frame's centre
      var c = CLIPS[name].crop;
      v.style.left = c[0] + "px"; v.style.top = c[1] + "px"; v.style.width = c[2] + "px"; v.style.height = c[3] + "px";
      v.style.transformOrigin = (545 - c[0]) + "px " + (960 - c[1]) + "px";
    }
    function load(v, name) { if (v._clip !== name) { v._clip = name; place(v, name); v.src = url(name); try { v.load(); } catch (e) {} } }
    function pick(name) { // a layer that already holds the clip, else the oldest free one
      var free = els.filter(function (v) { return v !== cur && !v._busy; });
      if (!free.length) free = els.filter(function (v) { return v !== cur; });
      var has = free.filter(function (v) { return v._clip === name; });
      if (has.length) return has[0];
      var open = free.filter(function (v) { return !v._reserved; });
      var list = open.length ? open : free;
      list.sort(function (a, b) { return (+a.style.zIndex || 0) - (+b.style.zIndex || 0); });
      return list[0];
    }
    function firstFrame(v, cb) {
      var done = false;
      function go() { if (!done) { done = true; cb(); } }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(function () { go(); });
      v.addEventListener("playing", function h() { v.removeEventListener("playing", h); setTimeout(go, 50); });
      setTimeout(go, 900);
    }
    function bringUp(v, fade) {
      var prev = cur, o = v._o;
      cur = v; v._busy = false;
      if (prev && prev !== v) prev._busy = true;
      v.style.zIndex = ++z;
      v.style.transition = "none"; v.style.opacity = 0;
      if (v._settle) { try { v._settle.cancel(); } catch (e) {} v._settle = null; }
      v.style.transform = "";
      if (o.match) { // start lined up with the clip before, then ease to its own framing
        var m = o.match;
        v._settle = anim(v, [{ transform: "translate(" + m[1] + "px," + m[2] + "px) scale(" + m[0] + ")" }, { transform: "none" }], o.settle || 1600, o.settleEase || CAMERA);
      }
      if (prev && prev !== v && o.soft) { // two different poses overlap mid-fade: a light haze hides it
        anim(box, [{ filter: "none" }, { filter: "blur(7px) brightness(1.06)", offset: 0.5 }, { filter: "none" }], fade * 1000 + 160, "ease-in-out");
      }
      void v.offsetWidth;
      v.style.transition = "opacity " + fade + "s ease-in-out"; v.style.opacity = 1;
      if (prev && prev !== v) setTimeout(function () {
        prev._busy = false;
        if (cur === prev) return;
        prev.style.transition = "none"; prev.style.opacity = 0;
        try { prev.pause(); } catch (e) {}
      }, fade * 1000 + 80);
      if (o.onStart) o.onStart();
    }
    function start(v) {
      v.muted = true;
      var p = v.play();
      if (p && p.catch) p.catch(function (err) { if (!err || err.name !== "AbortError") blocked = true; });
    }
    function play(name, o) {
      o = o || {};
      var v = pick(name), fade = o.fade == null ? 0.4 : o.fade, my = ++seq;
      v._reserved = false; v._busy = true;
      load(v, name);
      v._o = o; v._fired = false;
      try { v.currentTime = o.at || 0; } catch (e) {}
      start(v);
      firstFrame(v, function () {
        if (v._o !== o) return;
        if (my !== seq) { v._busy = false; if (v !== cur) try { v.pause(); } catch (e) {} return; } // superseded
        bringUp(v, fade);
      });
      return v;
    }
    function preload(name) {
      var v = pick(name);
      if (v._clip === name) { v._reserved = true; return; }
      load(v, name); v._reserved = true;
      var p = v.play(); // decode the first frame ahead of time
      if (p && p.then) p.then(function () { if (v !== cur && !v._busy) { v.pause(); try { v.currentTime = 0; } catch (e) {} } }, function () {});
    }
    function inWindow(v) {
      var w = WIN[v._clip], t = v.currentTime;
      return !w || w.some(function (r) { return t >= r[0] && t <= r[1]; });
    }
    function tick() {
      var v = cur;
      if (!v || !v._o || v._fired || v.paused || !v.duration) return;
      var o = v._o, d = v.duration, t = v.currentTime;
      var lf = o.loopFade || 0.45, lp = LOOPS[v._clip] || [d, 0];
      if (o.loop && pending && (inWindow(v) || Date.now() > pending.until)) {
        var p = pending; pending = null; v._fired = true;
        p.fn(Date.now() > p.until);
      } else if (o.loop && t >= Math.min(lp[0], d - 0.05) - lf / 2) {
        v._fired = true;
        play(v._clip, { loop: true, fade: lf, at: Math.max(0, lp[1] - lf / 2) });
      } else if (!o.loop && t >= d - (o.lead || 0.45)) {
        v._fired = true;
        if (pending) { var q = pending; pending = null; q.fn(false); } else if (o.onEnd) o.onEnd();
      }
    }
    var api = {
      play: play, preload: preload, tick: tick,
      clip: function () { return cur ? cur._clip : null; },
      // run fn at the next point the current clip can hand over smoothly
      next: function (fn, wait) { pending = { fn: fn, until: Date.now() + (wait || WAIT) }; },
      cancel: function () { pending = null; },
      kick: function () { if (blocked && cur) { blocked = false; start(cur); } },
      pause: function () { hidden = els.filter(function (v) { return !v.paused; }); hidden.forEach(function (v) { v.pause(); }); },
      resume: function () { hidden.forEach(function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }); hidden = []; },
      stop: function () { // frees the decoders
        pending = null; seq++;
        els.forEach(function (v) { try { v.pause(); } catch (e) {} v.removeAttribute("src"); try { v.load(); } catch (e) {} v._clip = null; v.remove(); });
        players.splice(players.indexOf(api), 1);
      },
    };
    players.push(api);
    return api;
  }
  (function loop() { players.forEach(function (p) { p.tick(); }); requestAnimationFrame(loop); })();

  // ---------------------------------------------------------------- shapes
  var CARD_PATH = "M60 2.5H356.044C370.784 2.50012 384.96 8.16062 395.646 18.3125L459.604 79.0713C471.03 89.9269 477.5 104.998 477.5 120.759V740C477.5 771.756 451.756 797.5 420 797.5H135.875C120.897 797.5 106.509 791.655 95.7744 781.209L19.8994 707.376C8.7753 696.551 2.50011 681.689 2.5 666.167V60C2.50001 28.2436 28.2436 2.5 60 2.5Z";
  var THUMB_PATH = "M25.25 1.05176H149.835C156.038 1.05176 162.004 3.43397 166.501 7.70605L193.416 33.2754C198.225 37.8438 200.948 44.1864 200.948 50.8193V176.75C200.948 190.114 190.114 200.948 176.75 200.948H54.3604C48.1053 200.948 42.093 198.526 37.585 194.189L8.47461 166.188C3.73203 161.627 1.05187 155.33 1.05176 148.749V25.25C1.05178 11.8859 11.8859 1.05176 25.25 1.05176Z";
  var CHECK = '<svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="53.9" fill="url(#gFill)" stroke="#fff" stroke-width="2.3"/><path d="M35 50.3L49.1 73L75 38" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var DEFS = '<svg width="0" height="0" style="position:absolute"><defs>' +
    '<linearGradient id="gStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7F2EF6"/><stop offset="0.534" stop-color="#D04AFF"/><stop offset="1" stop-color="#7F2EF6"/></linearGradient>' +
    '<linearGradient id="gFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7F2EF6"/><stop offset="0.534" stop-color="#D04AFF"/><stop offset="1" stop-color="#7F2EF6"/></linearGradient>' +
    "</defs></svg>";
  stage.insertAdjacentHTML("afterbegin", DEFS);
  function outline(w, h, d) { return '<svg class="ol" viewBox="0 0 ' + w + " " + h + '"><path class="base" d="' + d + '"/><path class="neon" d="' + d + '"/></svg>'; }

  // ---------------------------------------------------------------- titles
  // The words come in one after another (rise, sharpen); then the line breathes with a soft glow.
  var titleShown = false;
  function setTitle(h, sub, delay) {
    var hEl = titleEl.querySelector(".h"), sEl = titleEl.querySelector(".sub");
    function fill() {
      hEl.classList.remove("live");
      hEl.style.opacity = ""; hEl.style.filter = ""; sEl.style.opacity = "";
      hEl.innerHTML = "";
      h.split(" ").forEach(function (word, i, all) {
        var w = mk("span", "w"); w.textContent = word + (i < all.length - 1 ? " " : "");
        hEl.appendChild(w);
        anim(w, [{ opacity: 0, transform: "translateY(26px)", filter: "blur(10px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], 620, EASE_OUT, i * 90);
      });
      sEl.textContent = sub;
      anim(sEl, [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], 600, EASE_OUT, 280 + h.split(" ").length * 70);
      setTimeout(function () { hEl.classList.add("live"); }, 1100);
      titleEl.style.opacity = 1;
    }
    if (titleShown) {
      anim(hEl, [{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(8px)" }], 300, "ease-in");
      anim(sEl, [{ opacity: 1 }, { opacity: 0 }], 260, "ease-in");
      setTimeout(fill, 320 + (delay || 0));
    } else setTimeout(fill, delay || 0);
    titleShown = true;
  }
  function hideTitle() {
    titleShown = false;
    anim(titleEl, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-24px)" }], 420, "ease-in");
  }

  // ---------------------------------------------------------------- chat
  function say(text, typing, ava) {
    var row = mk("div", "msg"), a = mk("i", "ava"), bw = mk("div", "bw");
    a.style.backgroundImage = ava;
    var dots = mk("div", "bub typing", "<i></i><i></i><i></i>");
    row.appendChild(a); row.appendChild(bw); bw.appendChild(dots);
    chat.appendChild(row);
    anim(a, [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 450, SPRING);
    anim(dots, [{ transform: "scale(0.3)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 420, SPRING);
    Sound.pop();
    setTimeout(function () {
      if (!row.parentNode || row.classList.contains("gone")) return; // cleared meanwhile
      var bub = mk("div", "bub");
      bub.textContent = text;
      bw.replaceChild(bub, dots);
      var fs = 34;
      // max-width keeps the bubble inside the row, so the text itself is measured (scrollWidth)
      while (bub.scrollWidth > bub.clientWidth + 1 && fs > 24) { fs -= 1; bub.style.fontSize = fs + "px"; }
      anim(bub, [
        { transform: "scale(0.55)", opacity: 0, filter: "blur(6px)" },
        { transform: "scale(1.03)", opacity: 1, filter: "blur(0)", offset: 0.65 },
        { transform: "scale(1)", opacity: 1, filter: "blur(0)" },
      ], 520, "cubic-bezier(0.3, 0.9, 0.4, 1)");
      Sound.ping();
    }, typing == null ? 700 : typing);
    return row;
  }
  function clearChat(ms) {
    Array.prototype.forEach.call(chat.children, function (r) {
      if (r.classList.contains("gone")) return;
      r.classList.add("gone");
      anim(r, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-30px) scale(0.97)" }], ms || 320, "ease-in")
        .finished.then(function () { if (r.parentNode) r.parentNode.removeChild(r); });
    });
  }

  // ---------------------------------------------------------------- the button
  var btnOn = false;
  function setBtn(text, on, quiet) {
    var t = btn.querySelector(".t");
    if (t.textContent && t.textContent !== text && !quiet) {
      anim(t, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-26px)" }], 180, "ease-in").finished.then(function () {
        t.textContent = text;
        anim(t, [{ opacity: 0, transform: "translateY(26px)" }, { opacity: 1, transform: "none" }], 320, SPRING);
      });
    } else t.textContent = text;
    if (on && !btnOn && !quiet) anim(btn.querySelector(".core"), [{ transform: "scale(0.94)" }, { transform: "scale(1.06)", offset: 0.5 }, { transform: "scale(1)" }], 520, "ease-out");
    btnOn = on;
    btn.classList.toggle("off", !on);
  }
  function hitBtn(p) { return btnOn && +getComputedStyle(btn).opacity > 0.5 && p.x > 80 && p.x < 1000 && p.y > 1478 && p.y < 1660; }

  // ---------------------------------------------------------------- effects
  function sparks(x, y, n, spread, size) {
    for (var i = 0; i < n; i++) {
      var s = mk("i", "spark");
      var a = Math.random() * Math.PI * 2, r = spread * (0.4 + Math.random() * 0.6), sc = (size || 1) * (0.5 + Math.random() * 0.9);
      s.style.left = x + "px"; s.style.top = y + "px";
      fx.appendChild(s);
      anim(s, [
        { transform: "translate(0,0) scale(0) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + Math.cos(a) * r * 0.6 + "px," + Math.sin(a) * r * 0.6 + "px) scale(" + sc + ") rotate(90deg)", opacity: 1, offset: 0.5 },
        { transform: "translate(" + Math.cos(a) * r + "px," + (Math.sin(a) * r + 30) + "px) scale(0) rotate(180deg)", opacity: 0 },
      ], 700 + Math.random() * 500, "cubic-bezier(0.2, 0.7, 0.3, 1)", Math.random() * 120)
        .finished.then(function (el) { return function () { el.remove(); }; }(s));
    }
  }
  function tapRing(p) {
    var r = mk("i", "tapring");
    r.style.left = p.x + "px"; r.style.top = p.y + "px";
    fx.appendChild(r);
    anim(r, [{ transform: "scale(0.3)", opacity: 1 }, { transform: "scale(1.6)", opacity: 0 }], 550, EASE_OUT).finished.then(function () { r.remove(); });
  }
  function centreOf(el) { var r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2 - view.ox) / view.s, y: (r.top + r.height / 2 - view.oy) / view.s }; }

  // ---------------------------------------------------------------- step 1: choose your style
  var cards = {}, style = null;
  function buildCards() {
    ["real", "anime"].forEach(function (st) {
      var c = mk("div", "card");
      c.setAttribute("data-st", st);
      c.innerHTML =
        '<svg class="bg" viewBox="0 0 480 800"><path d="' + CARD_PATH + '" fill="url(#gFill)" fill-opacity="0.5"/><path d="' + CARD_PATH + '" fill="#000" fill-opacity="0.5"/></svg>' +
        '<div class="clip"><div class="pic"></div></div>' +
        outline(480, 800, CARD_PATH) +
        '<div class="tag"></div><div class="check">' + CHECK + "</div>";
      c.querySelector(".tag").textContent = T.styles[st];
      c.querySelector(".clip").style.clipPath = "path('" + CARD_PATH + "')";
      cardsEl.appendChild(c);
      cards[st] = c;
    });
  }
  function startCards() {
    ["real", "anime"].forEach(function (st, i) {
      show(cards[st], 700, 350 + i * 140, "translateY(60px) scale(0.94)").finished.then(function () {
        cards[st].style.opacity = ""; cards[st].style.transform = ""; cards[st].style.opacity = 1;
      });
    });
    later(1300, function () { if (!style) cardsEl.classList.add("idle"); });
  }
  function pickStyle(st) {
    if (style === st) return;
    var first = !style;
    style = st;
    cardsEl.classList.remove("idle");
    ["real", "anime"].forEach(function (s) {
      cards[s].style.transform = "";
      cards[s].classList.toggle("sel", s === st);
      cards[s].classList.toggle("dim", s !== st);
    });
    var c = centreOf(cards[st].querySelector(".check"));
    sparks(c.x, c.y, 12, 220, 1);
    Sound.sparkle();
    // her picture leans in a little
    anim(cards[st].querySelector(".pic"), [{ transform: "scale(1)" }, { transform: "scale(1.05)", offset: 0.4 }, { transform: "scale(1)" }], 700, "cubic-bezier(0.3, 0.7, 0.4, 1)");
    setBtn(T.next, true);
    if (first) heroPlayer.preload(clipOf(0, "loop"));
  }

  // ---------------------------------------------------------------- step 2: the four girls
  var heroPlayer = Player(heroV, 4);
  var cur = 0, thumbs = [];
  function key(i) { return style + "_" + GIRLS[i].id; }
  function clipOf(i, kind) { return key(i) + "_" + kind; }
  function ava(i) { return "var(--th-" + style + "-" + GIRLS[i].id + ")"; }
  function setFrame(f, ms) {
    if (!ms) { hero.style.transform = frameCss(f); return null; }
    return anim(hero, [{ transform: getComputedStyle(hero).transform }, { transform: frameCss(f) }], ms, CAMERA);
  }
  function buildThumbs() {
    thumbsEl.innerHTML = "";
    thumbs = GIRLS.map(function (g, i) {
      var t = mk("div", "th");
      t.style.top = i * 234 + "px";
      t.setAttribute("data-i", i);
      // the card's violet background (Figma), her picture with its glow, the outline
      t.innerHTML = '<svg class="bg" viewBox="0 0 202 202"><path d="' + THUMB_PATH + '" fill="url(#gFill)" fill-opacity="0.5"/><path d="' + THUMB_PATH + '" fill="#000" fill-opacity="0.5"/></svg>' +
        '<div class="clip"></div>' + outline(202, 202, THUMB_PATH);
      var cl = t.querySelector(".clip");
      cl.style.backgroundImage = ava(i);
      cl.style.clipPath = "path('" + THUMB_PATH + "')";
      thumbsEl.appendChild(t);
      return t;
    });
  }
  function setPill(i) {
    var nm = pill.querySelector(".nm");
    if (nm.textContent && nm.textContent !== GIRLS[i].name) {
      anim(nm, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], 360, EASE_OUT);
    }
    nm.textContent = GIRLS[i].name;
    pill.querySelector(".role").textContent = T.role;
  }
  function lineOf(i) { clearChat(); later(260, function () { say(GIRLS[i].line, 520, ava(i)); }); }

  function toGirls() {
    state = "girls";
    setBtn(T.choose, true);
    // the cards step aside, the chosen style's Jade comes forward full size
    ["real", "anime"].forEach(function (s) {
      var sel = s === style;
      anim(cards[s], [{ opacity: 1, transform: getComputedStyle(cards[s]).transform }, { opacity: 0, transform: sel ? "scale(1.12)" : "scale(0.9) translateY(40px)" }], sel ? 650 : 450, "cubic-bezier(0.4, 0, 0.6, 1)", sel ? 120 : 0);
    });
    setTimeout(function () { cardsEl.style.display = "none"; }, 900);
    setTitle(T.girlsTitle, T.girlsSub, 120);
    setFrame(FRAME.s2);
    heroPlayer.play(clipOf(0, "loop"), { loop: true, fade: 0.01 });
    anim(hero, [{ opacity: 0, transform: frameCss([FRAME.s2[0] * 1.06, FRAME.s2[1] - 30, FRAME.s2[2] - 60]) }, { opacity: 1, transform: frameCss(FRAME.s2) }], 900, CAMERA, 150);
    buildThumbs();
    thumbs.forEach(function (t, i) {
      show(t, 600, 450 + i * 90, "translateX(80px)").finished.then(function () { t.style.opacity = 1; t.style.transform = ""; });
    });
    pill.style.top = PILL_TOP.s2 + "px";
    show(pill, 600, 600, "translateX(-50%) translateY(20px)", "translateX(-50%)");
    [navUp, navDown].forEach(function (n, k) {
      show(n, 500, 800 + k * 360, "scale(0.4)").finished.then(function () { n.style.transform = ""; n.style.opacity = 1; n.classList.add("on"); });
    });
    setPill(0);
    focus(0, 0, true);
    for (var i = 1; i < GIRLS.length; i++) heroPlayer.preload(clipOf(i, "loop"));
  }
  // shows girl i (dir: -1 / 1, which way she came from; axis "x" for a swipe, "y" along the column)
  function focus(i, dir, firstTime, axis) {
    i = (i + GIRLS.length) % GIRLS.length;
    if (i === cur && !firstTime) return;
    cur = i;
    heroPlayer.cancel();
    thumbs.forEach(function (t, k) { t.classList.toggle("cur", k === i); });
    setPill(i);
    if (!firstTime) {
      Sound.swish();
      // she glides in from the side she came from; the one leaving just fades (nothing jumps)
      var v = heroPlayer.play(clipOf(i, "loop"), {
        loop: true, fade: 0.45,
        onStart: function () { anim(v, [{ transform: "translate" + (axis === "x" ? "X" : "Y") + "(" + (dir || 1) * 46 + "px)" }, { transform: "none" }], 620, EASE_OUT); },
      });
      lineOf(i);
    } else later(900, function () { say(GIRLS[i].line, 600, ava(i)); });
  }
  // ---------------------------------------------------------------- step 3: the match
  function toMatch() {
    state = "end";
    stage.classList.add("end");
    var i = cur;
    heroPlayer.cancel();
    hideTitle();
    thumbs.forEach(function (t, k) { hide(t, 420, k * 60, "translateX(90px)"); });
    [navUp, navDown].forEach(function (n) { n.classList.remove("on"); hide(n, 300, 0, "scale(0.5)"); });
    clearChat();
    // her thumbnail flashes as she is picked
    var c = centreOf(thumbs[i]);
    sparks(c.x, c.y, 12, 200, 1);
    Sound.sparkle();
    setPill(i);
    anim(pill, [{ top: PILL_TOP.s2 + "px" }, { top: PILL_TOP.s3 + "px" }], 900, CAMERA, 200);
    // the camera moves in: the frame slides to the centre and the closer greeting takes over,
    // first lined up with her in the loop
    heroPlayer.play(clipOf(i, "greet"), {
      loop: true, fade: 0.7, soft: true, match: GREET_MATCH[key(i)], settle: 1500,
      onStart: function () { setFrame(FRAME.s3, 1500); },
    });
    setTimeout(function () {
      chat.classList.add("wide");
      say(GIRLS[i].greet, 650, ava(i));
      setBtn(T.cta, true);
      AD.gameEnd();
    }, 900);
  }

  Sound.setOn(!!CFG.sound);

  // ---------------------------------------------------------------- input
  var down = null;
  stage.addEventListener("pointerdown", function (e) {
    Sound.init();
    players.forEach(function (p) { p.kick(); });
    var p = toStage(e);
    down = { x: p.x, y: p.y, t: Date.now() };
    if (state === "end") { tapRing(p); AD.click(CFG.clickUrl); return; }
    if (state === "style") {
      var card = e.target.closest && e.target.closest(".card");
      if (card) { Sound.tap(); pickStyle(card.getAttribute("data-st")); return; }
      if (hitBtn(p)) { Sound.tap(); tapRing(p); toGirls(); }
      return;
    }
    if (state === "girls") {
      var th = e.target.closest && e.target.closest(".th");
      if (th) { var k = +th.getAttribute("data-i"); Sound.tap(); focus(k, k > cur ? 1 : -1, false, "y"); down = null; return; }
      var nav = e.target.closest && e.target.closest(".nav");
      if (nav) { Sound.tap(); var d = nav.id === "navDown" ? 1 : -1; focus(cur + d, d, false, "y"); down = null; return; }
      if (hitBtn(p)) { Sound.tap(); tapRing(p); down = null; toMatch(); }
    }
  });
  // a swipe across her (step 2) browses the girls
  stage.addEventListener("pointerup", function (e) {
    if (!down || state !== "girls") { down = null; return; }
    var p = toStage(e), dx = p.x - down.x, dy = p.y - down.y;
    if (down.x < 790 && down.y > 440 && down.y < 1440 && Date.now() - down.t < 900) {
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.2) { var d = dx < 0 ? 1 : -1; focus(cur + d, d, false, "x"); }
      else if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.2) { var e2 = dy < 0 ? 1 : -1; focus(cur + e2, e2, false, "y"); }
    }
    down = null;
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { players.forEach(function (p) { p.pause(); }); Sound.suspend(); }
    else { players.forEach(function (p) { p.resume(); }); Sound.resume(); }
  });

  // ---------------------------------------------------------------- go
  function start() {
    AD.gameReady();
    state = "style";
    show($("logo"), 700, 100, "translateY(-20px)");
    buildCards();
    // QA shortcuts: ?s=2 (&st=anime) the four girls, ?s=3 (&g=1) the match
    if (Q.s === "2" || Q.s === "3") {
      style = Q.st === "anime" ? "anime" : "real";
      cardsEl.style.display = "none";
      show(btn, 500, 300, "translateY(40px)");
      toGirls();
      if (Q.s === "3") { var g = +Q.g || 0; setTimeout(function () { focus(g, 1); setTimeout(toMatch, 900); }, 1200); }
      return;
    }
    setTitle(T.styleTitle, T.styleSub, 150);
    startCards();
    show(btn, 650, 900, "translateY(50px) scale(0.94)");
    setBtn(T.next, false, true);
  }
  function ready() {
    var go = function () { AD.onReady(start); };
    if (document.fonts && document.fonts.load) {
      Promise.all(["400", "500", "600"].map(function (w) { return document.fonts.load(w + " 40px 'General Sans'"); })).then(go, go);
      setTimeout(go, 1500); // never wait long for fonts
    } else go();
  }
  var started = false, _start = start;
  start = function () { if (started) return; started = true; _start(); };
  ready();
})();
