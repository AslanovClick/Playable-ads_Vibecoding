(function () {
  "use strict";

  var CFG = window.PLAYABLE_CONFIG, T = CFG.text, CLIPS = window.PLAYABLE_CLIPS;
  var W = 1080, H = 1920; // Figma frame

  var DRESSES = ["black", "burgundy", "red"]; // card order
  // Seams, measured frame by frame (seconds): where one clip matches the next one best, so the
  // cross-fade there is nearly invisible. The fade is centred on these points.
  var SEAM = {
    red: { wearOut: 2.5, turnIn: 0.88, toUnzip: 3.8 },
    black: { wearOut: 3.96, turnIn: 0.04, toUnzip: 3.85 },
    burgundy: { wearOut: 4.8, turnIn: 0.7, toUnzip: 4.33 },
  };
  // Loops: jump from `out` back to `in`, where the frames match best (not simply end -> start).
  var LOOPS = {
    intro: [5.0, 0.21], choose: [4.29, 0.38],
    chat_red: [4.67, 0.21], chat_black: [5.0, 0.17], chat_burgundy: [4.58, 0.96],
  };
  // The zipper on each dress, seen from the back (stage px): where the pull sits and how far the swipe takes it.
  var ZIP = {
    red: { x: 538, y0: 1040, y1: 1390 },
    black: { x: 536, y0: 878, y1: 1355 },
    burgundy: { x: 540, y0: 1052, y1: 1330 },
  };
  var UNZIP_T = 1.7; // seconds of the unzip clip the swipe scrubs through (it stops before fully open)

  // Where the chat sits (bottom edge of the newest message) in each scene.
  var CHAT_Y = { intro: 1418, choose: 1098, wear: 1680, chat: 1418 };

  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), videos = $("videos"), chat = $("chat"), title = $("title"), cards = $("cards");
  var pill = $("pill"), cta = $("cta"), wearBtn = $("wearBtn"), zip = $("zip"), hand = $("hand");
  var handle = $("handle"), fx = $("fx"), flash = $("flash"), cut = $("cut");

  var Q = (function () { var q = {}; location.search.replace(/[?&]([^=&]+)=?([^&]*)/g, function (_, k, v) { q[k] = v; }); return q; })();

  // ---------------------------------------------------------------- layout
  var view = window.VIEW; // scale and offset of the stage, kept up to date by fit.js
  function toStage(e) { return { x: (e.clientX - view.ox) / view.s, y: (e.clientY - view.oy) / view.s }; }

  // ---------------------------------------------------------------- helpers
  var EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  var SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
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
  function hide(el, ms, to) {
    var o = parseFloat(getComputedStyle(el).opacity) || 0;
    return anim(el, [{ opacity: o, transform: getComputedStyle(el).transform === "none" ? "none" : getComputedStyle(el).transform }, { opacity: 0, transform: to || "translateY(-20px)" }], ms || 350);
  }
  var state = "intro";
  function later(ms, fn) { var s = state; return setTimeout(function () { if (state === s) fn(); }, ms); }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }

  // ---------------------------------------------------------------- sound (synthesised, no files)
  var Sound = (function () {
    var ctx = null, out = null, noise = null;
    function init() {
      if (!CFG.sound) return;
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          ctx = new AC();
          out = ctx.createGain(); out.gain.value = 0.7; out.connect(ctx.destination);
          noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          var d = noise.getChannelData(0);
          for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ctx.state === "suspended") ctx.resume();
      } catch (e) { ctx = null; }
    }
    function ok() { return ctx && ctx.state === "running"; }
    function tone(f, t, dur, type, vol, f2) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
    function hiss(t, dur, freq, q, vol, type, attack) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.loop = true;
      f.type = type || "bandpass"; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(out);
      s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
      return f;
    }
    var lastZip = 0;
    return {
      init: init,
      tap: function () { if (!ok()) return; tone(660, ctx.currentTime, 0.12, "sine", 0.18, 330); },
      pop: function () { if (!ok()) return; tone(780, ctx.currentTime, 0.09, "triangle", 0.1, 1250); },
      ping: function () { // incoming message
        if (!ok()) return; var t = ctx.currentTime;
        tone(1318.5, t, 0.32, "sine", 0.2); tone(1760, t + 0.085, 0.5, "sine", 0.18); tone(3520, t + 0.085, 0.25, "sine", 0.025);
      },
      sparkle: function () {
        if (!ok()) return; var t = ctx.currentTime;
        for (var k = 0; k < 5; k++) tone(1900 + Math.random() * 1900, t + k * 0.05, 0.28, "sine", 0.06);
      },
      whoosh: function () {
        if (!ok()) return; var t = ctx.currentTime;
        var f = hiss(t, 0.9, 400, 0.8, 0.22, "lowpass", 0.35);
        f.frequency.exponentialRampToValueAtTime(5200, t + 0.45);
        f.frequency.exponentialRampToValueAtTime(900, t + 0.9);
        for (var k = 0; k < 6; k++) tone(2200 + k * 330, t + 0.25 + k * 0.05, 0.4, "sine", 0.035);
      },
      zip: function (v) { // one tooth of the zipper; called as the finger travels
        if (!ok()) return; var t = ctx.currentTime;
        if (t - lastZip < 0.016) return; lastZip = t;
        hiss(t, 0.028, 2600 + Math.random() * 2400, 2.5, 0.16 + 0.12 * Math.min(1, v || 0));
        tone(140 + Math.random() * 60, t, 0.02, "square", 0.018);
      },
      done: function () {
        if (!ok()) return; var t = ctx.currentTime;
        tone(1046.5, t, 0.5, "sine", 0.14); tone(1568, t + 0.07, 0.6, "sine", 0.12); tone(2093, t + 0.14, 0.7, "sine", 0.08);
      },
      suspend: function () { try { if (ctx) ctx.suspend(); } catch (e) {} },
      resume: function () { try { if (ctx) ctx.resume(); } catch (e) {} },
    };
  })();

  // ---------------------------------------------------------------- video player
  // Three stacked <video> layers. A new clip starts on a free layer and fades in over the current one
  // once its first frame is on screen; loops fade into a fresh copy of themselves instead of jumping.
  var Player = (function () {
    var els = Array.prototype.slice.call(videos.querySelectorAll("video"));
    var cur = null, z = 1, urls = {};
    els.forEach(function (v) { v.muted = true; v.setAttribute("muted", ""); v.playsInline = true; v._clip = null; });

    function url(name) {
      if (urls[name]) return urls[name];
      var s = CLIPS[name];
      if (s.indexOf("data:") === 0) {
        var bin = atob(s.slice(s.indexOf(",") + 1)), n = bin.length, arr = new Uint8Array(n);
        for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
        s = URL.createObjectURL(new Blob([arr], { type: "video/mp4" }));
      }
      return (urls[name] = s);
    }
    function load(v, name) {
      if (v._clip !== name) { v._clip = name; v.src = url(name); try { v.load(); } catch (e) {} }
    }
    // a layer for this clip: one that already holds it, else the oldest free one
    function pick(name) {
      // not the one on screen, not one about to come up, not one still fading out
      var free = els.filter(function (v) { return v !== cur && !v._busy; });
      if (!free.length) free = els.filter(function (v) { return v !== cur; });
      var has = free.filter(function (v) { return v._clip === name; });
      if (has.length) return has[0];
      var open = free.filter(function (v) { return !v._reserved; });
      (open.length ? open : free).sort(function (a, b) { return (+a.style.zIndex || 0) - (+b.style.zIndex || 0); });
      return (open.length ? open : free)[0];
    }
    function firstFrame(v, cb) {
      var done = false;
      function go() { if (!done) { done = true; cb(); } }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(function () { go(); });
      v.addEventListener("playing", function h() { v.removeEventListener("playing", h); setTimeout(go, 50); });
      v.addEventListener("seeked", function h() { v.removeEventListener("seeked", h); if (v.paused) setTimeout(go, 30); });
      setTimeout(go, 900);
    }
    function bringUp(v, fade) {
      var prev = cur;
      cur = v;
      v._busy = false;
      if (prev && prev !== v) prev._busy = true;
      v.style.zIndex = ++z;
      v.style.transition = "none";
      v.style.opacity = 0;
      void v.offsetWidth;
      v.style.transition = "opacity " + fade + "s ease-in-out";
      v.style.opacity = 1;
      if (prev && prev !== v) setTimeout(function () {
        prev._busy = false;
        if (cur === prev) return;
        prev.style.transition = "none"; prev.style.opacity = 0;
        try { prev.pause(); } catch (e) {}
      }, fade * 1000 + 80);
      $("poster").style.opacity = 0;
    }
    function play(name, o) {
      o = o || {};
      var v = pick(name), fade = o.fade == null ? 0.4 : o.fade;
      v._reserved = false;
      v._busy = true;
      els.forEach(function (x) { if (x !== v && x._o && x !== cur && !x._busy) x._o = null; }); // superseded
      load(v, name);
      v._o = o; v._fired = false;
      v.playbackRate = 1;
      try { v.currentTime = o.at || 0; } catch (e) {}
      var p = v.play();
      if (p && p.catch) p.catch(function () { blocked = true; });
      firstFrame(v, function () { if (v._o === o) bringUp(v, fade); });
      return v;
    }
    // shows a clip paused on its first frame (the unzip clip, which the finger then scrubs)
    // (preload() has already decoded it and parked it on frame 0)
    var scrub = null;
    function still(name, fade) {
      var v = pick(name);
      v._reserved = false;
      v._busy = true;
      v._o = { still: true }; v._fired = true;
      scrub = v;
      var o = v._o, up = function () { if (v._o === o) bringUp(v, fade == null ? 0.25 : fade); };
      if (v._clip === name && v.readyState >= 2) { v.pause(); up(); return v; }
      load(v, name);
      v.addEventListener("loadeddata", function h() { v.removeEventListener("loadeddata", h); up(); });
      setTimeout(up, 900);
      return v;
    }
    function preload(name) {
      var v = pick(name);
      if (v._clip === name) { v._reserved = true; return; }
      load(v, name); v._reserved = true;
      // decode the first frame ahead of time
      var p = v.play();
      if (p && p.then) p.then(function () { if (v !== cur && !v._busy) { v.pause(); try { v.currentTime = 0; } catch (e) {} } }, function () {});
    }
    var seeking = false, want = null;
    function seek(t) {
      var v = scrub;
      if (!v) return;
      want = t;
      if (seeking) return;
      seeking = true;
      try { if (v.fastSeek && Math.abs(v.currentTime - t) > 0.6) v.fastSeek(t); else v.currentTime = t; } catch (e) { seeking = false; return; }
      var done = function () {
        v.removeEventListener("seeked", done);
        seeking = false;
        if (want != null && Math.abs(want - v.currentTime) > 0.02) seek(want);
      };
      v.addEventListener("seeked", done);
      setTimeout(function () { if (seeking) done(); }, 400);
    }
    var queued = null; // a clip to switch to at the next loop point instead of looping
    function tick() {
      var v = cur;
      if (v && v._o && !v._fired && !v.paused && v.duration) {
        var o = v._o, d = v.duration, t = v.currentTime;
        var lf = o.loopFade || 0.45, lp = LOOPS[v._clip] || [d, 0];
        if (o.loop && t >= Math.min(lp[0], d - 0.05) - lf / 2) {
          v._fired = true;
          if (queued) { var q = queued; queued = null; play(q.name, q.o); }
          else play(v._clip, { loop: true, fade: lf, loopFade: o.loopFade, at: Math.max(0, lp[1] - lf / 2) });
        } else if (o.onEnd && t >= (o.endAt || d - 0.45)) {
          v._fired = true;
          o.onEnd();
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    var blocked = false, hidden = [];
    return {
      play: play, still: still, preload: preload, seek: seek,
      // switch to this clip where the current loop would jump back (a seamless join), not right now
      atLoop: function (name, o) { if (!cur || cur.paused) play(name, o); else queued = { name: name, o: o }; },
      // lets the scrubbed clip play on by itself from where the finger left it
      release: function () {
        if (!scrub) return null;
        want = null;
        var p = scrub.play();
        if (p && p.catch) p.catch(function () {});
        return scrub;
      },
      // autoplay was refused (low-power mode etc): retry inside the first tap
      kick: function () { if (blocked && cur) { blocked = false; var p = cur.play(); if (p && p.catch) p.catch(function () {}); } },
      pause: function () { hidden = els.filter(function (v) { return !v.paused; }); hidden.forEach(function (v) { v.pause(); }); },
      resume: function () { hidden.forEach(function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }); hidden = []; },
      get cur() { return cur; },
    };
  })();

  // ---------------------------------------------------------------- title
  // Fades and settles in as a whole, then "breathes": a slow scale and glow, nothing jumps.
  function showTitle(text) {
    title.innerHTML = "";
    var t = mk("span", "tt");
    t.textContent = text;
    title.appendChild(t);
    anim(title, [
      { opacity: 0, transform: "scale(0.94)", filter: "blur(8px)" },
      { opacity: 1, transform: "scale(1)", filter: "blur(0px)" },
    ], 900, "cubic-bezier(0.25, 0.8, 0.25, 1)");
  }
  function hideTitle() {
    anim(title, [
      { opacity: 1, transform: "scale(1)", filter: "blur(0px)" },
      { opacity: 0, transform: "scale(0.97)", filter: "blur(6px)" },
    ], 450, "ease-in");
  }

  // ---------------------------------------------------------------- chat
  var lastRow = null;
  function chatAt(y, instant) {
    if (instant) { chat.style.transition = "none"; chat.style.bottom = (H - y) + "px"; void chat.offsetWidth; chat.style.transition = ""; }
    else chat.style.bottom = (H - y) + "px";
  }
  // Moves the rows already there up by however much the new row pushes them, smoothly.
  function flipRows(change) {
    var rows = Array.prototype.slice.call(chat.children);
    var before = rows.map(function (r) { return r.getBoundingClientRect().top; });
    change();
    rows.forEach(function (r, i) {
      var d = (before[i] - r.getBoundingClientRect().top) / view.s;
      if (Math.abs(d) > 1) anim(r, [{ transform: "translateY(" + d + "px)" }, { transform: "none" }], 450, EASE_OUT);
    });
  }
  // An incoming message: "typing…" first, then the text pops in with a ping.
  function say(text, typing, then) {
    var row = mk("div", "msg"), ava = mk("i", "ava"), bw = mk("div", "bw");
    var dots = mk("div", "bub typing", "<i></i><i></i><i></i>");
    row.appendChild(ava); row.appendChild(bw); bw.appendChild(dots);
    var cont = lastRow && lastRow.parentNode === chat;
    if (cont) row.classList.add("cont");
    lastRow = row;
    flipRows(function () { chat.appendChild(row); });
    if (!cont) anim(ava, [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 450, SPRING);
    anim(dots, [{ transform: "scale(0.3)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 420, SPRING);
    Sound.pop();
    setTimeout(function () {
      if (!row.parentNode || row.classList.contains("gone")) return; // the chat was cleared meanwhile
      var bub = mk("div", "bub");
      bub.textContent = text;
      flipRows(function () { bw.replaceChild(bub, dots); });
      anim(bub, [
        { transform: "scale(0.55)", opacity: 0, filter: "blur(6px)" },
        { transform: "scale(1.03)", opacity: 1, filter: "blur(0)", offset: 0.65 },
        { transform: "scale(1)", opacity: 1, filter: "blur(0)" },
      ], 520, "cubic-bezier(0.3, 0.9, 0.4, 1)");
      Sound.ping();
      if (then) then(row);
    }, typing == null ? 800 : typing);
    return row;
  }
  function clearChat(ms) {
    lastRow = null;
    Array.prototype.forEach.call(chat.children, function (r, i) {
      r.classList.add("gone");
      anim(r, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-50px) scale(0.96)" }], ms || 380, "ease-in", i * 50)
        .finished.then(function () { if (r.parentNode) r.parentNode.removeChild(r); });
    });
  }

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

  // ---------------------------------------------------------------- static copy
  $("pillName").textContent = T.name;
  $("pillRole").textContent = T.role;
  $("legal").textContent = T.legal;
  cta.querySelector(".t").textContent = T.start;
  wearBtn.querySelector(".t").textContent = T.wear;

  var CHECK = '<svg viewBox="0 0 60 60"><path d="M17 31l9 9 17-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var cardEls = DRESSES.map(function (d) {
    var c = mk("div", "card");
    c.setAttribute("data-d", d);
    c.innerHTML = '<i class="pic"></i><span class="lbl"></span><b class="check">' + CHECK + "</b>";
    c.querySelector(".lbl").textContent = T.dresses[d];
    cards.appendChild(c);
    return c;
  });

  // ---------------------------------------------------------------- scenes
  var dress = null, cardsReady = false;

  // 1. Ruby says hi; the CTA pulses
  function intro() {
    state = "intro";
    chatAt(CHAT_Y.intro, true);
    Player.play("intro", { loop: true, fade: 0.6, loopFade: 0.5 });
    Player.preload("choose");
    show($("logo"), 700, 100, "translateY(-20px)");
    show(pill, 600, 350, "translateX(-50%) translateY(-16px) scale(0.9)", "translateX(-50%)");
    later(700, function () { say(T.hello, 650); });
    later(1500, function () { show(cta, 600, 0, "translateY(40px) scale(0.9)"); });
  }

  // 2. Which dress? The button is there from the start, disabled until a dress is picked.
  function choose() {
    state = "choose";
    // The two idle clips match frame to frame except while she plays with her hair (about 1-4.5 s
    // into the intro). Early on: cross-fade now into the matching frame. Otherwise: let the intro
    // reach its loop point and join there, invisibly; the new UI is already on screen anyway.
    var iv = Player.cur, t = iv ? iv.currentTime : 0;
    var opts = { loop: true, fade: 0.5, loopFade: 0.45 };
    if (t < 0.9) { opts.at = t * 0.45; Player.play("choose", opts); }
    else Player.atLoop("choose", opts);
    hide(cta, 300, "scale(0.92)");
    anim(pill, [{ opacity: 1, transform: "translateX(-50%)" }, { opacity: 0, transform: "translateX(-50%) translateY(-20px)" }], 300);
    clearChat(300);
    later(260, function () { chatAt(CHAT_Y.choose, true); showTitle(T.chooseTitle); });
    later(520, function () { say(T.chooseAsk, 850); });
    later(1500, function () {
      cardEls.forEach(function (c, i) {
        anim(c, [
          { opacity: 0, transform: "translateY(100px) scale(0.9)" },
          { opacity: 1, transform: "none" },
        ], 700, SPRING, i * 110).finished.then(function () {
          // the select / dim classes drive it from here on
          c.style.transform = ""; c.style.opacity = ""; c.classList.add("in");
        });
      });
      show(wearBtn, 650, 380, "translateY(40px)");
      cardsReady = true;
      Sound.sparkle();
    });
  }
  function pickDress(i) {
    if (dress === DRESSES[i]) return;
    var first = !dress;
    dress = DRESSES[i];
    cardEls.forEach(function (c, k) {
      c.classList.toggle("sel", k === i);
      c.classList.toggle("dim", k !== i);
    });
    var c = cardEls[i], r = c.getBoundingClientRect();
    sparks((r.left + r.width / 2 - view.ox) / view.s, (r.top + r.height * 0.45 - view.oy) / view.s, 12, 170, 1);
    Sound.sparkle();
    Player.preload("wear_" + dress);
    if (first) wearBtn.classList.remove("off");
    var core = wearBtn.querySelector(".core");
    anim(core, [{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }], 380, "ease-out")
      .finished.then(function () { core.style.transform = ""; });
  }

  // 3. She wears it, admires it, turns around
  function wear() {
    state = "wear";
    var S = SEAM[dress];
    Sound.whoosh();
    // all three cards leave together, the button and the text with them
    cardEls.forEach(function (c, k) {
      var cs = getComputedStyle(c);
      anim(c, [
        { opacity: cs.opacity, transform: cs.transform === "none" ? "none" : cs.transform },
        { opacity: 0, transform: "translateY(60px) scale(0.94)" },
      ], 480, "cubic-bezier(0.4, 0, 0.7, 1)", k * 50);
    });
    setTimeout(function () { cards.style.display = "none"; }, 700);
    hide(wearBtn, 420, "translateY(50px)");
    hideTitle();
    clearChat(380);
    // A soft dissolve: the picture goes hazy and bright, the new dress fades in under the haze
    // right at its peak, then it clears up.
    anim(videos, [
      { transform: "scale(1)", filter: "blur(0px) brightness(1)" },
      { transform: "scale(1.045)", filter: "blur(18px) brightness(1.28)", offset: 0.4 },
      { transform: "scale(1)", filter: "blur(0px) brightness(1)" },
    ], 1500, "ease-in-out").finished.then(function () { videos.style.transform = ""; videos.style.filter = ""; });
    anim(flash, [{ opacity: 0 }, { opacity: 0.58, offset: 0.4 }, { opacity: 0 }], 1500, "ease-in-out");
    later(420, function () {
      Player.play("wear_" + dress, { fade: 0.36, endAt: S.wearOut - 0.25, onEnd: turn });
      Player.preload("turn_" + dress);
    });
    later(560, function () { sparks(540, 860, 24, 440, 1.3); });
    later(900, function () { chatAt(CHAT_Y.wear, true); });
    later(1100, function () { say(T.amazing, 450); });
    later(2600, function () { say(T.zipper, 550); });
  }
  function turn() {
    state = "turn";
    var S = SEAM[dress];
    // she turns around; at the end of the turn the unzip clip takes over (see swipeScene)
    Player.play("turn_" + dress, { at: Math.max(0, S.turnIn - 0.25), fade: 0.5, endAt: S.toUnzip - 0.3, onEnd: swipeScene });
    Player.preload("unzip_" + dress);
  }

  // 4. Swipe the zipper down. The finger only sets a target; what is shown (the video frame and the
  // pull) eases towards it every frame at a capped speed, so a flick plays out smoothly instead of
  // skipping, and a slow drag follows the finger right away.
  var Z = null, prog = 0, target = 0, drag = null, guideOn = false, travel = 0, zipRaf = 0, lastT = 0;
  var TRAVEL = 1.3; // finger travel for the whole zipper, in zipper lengths
  var MAX_SPEED = 1.6; // zipper lengths per second, at most
  var HOLD_MS = 1500; // after the zipper stops: her slow-motion moment before the chat
  var unzipShown = false;
  function swipeScene() {
    state = "swipe";
    Z = ZIP[dress];
    // She has turned: the unzip clip fades in on its first frame (it matches the end of the turn)
    // and waits there, perfectly still, for the finger.
    Player.still("unzip_" + dress, 0.6);
    unzipShown = true;
    later(900, function () { Player.preload("chat_" + dress); });
    clearChat(420);
    later(300, function () { showTitle(T.swipeTitle); });
    zip.style.left = Z.x + "px"; zip.style.top = Z.y0 + "px";
    zip.style.setProperty("--len", (Z.y1 - Z.y0) + "px");
    handle.style.left = Z.x + "px"; handle.style.top = Z.y0 + "px";
    later(700, guideShow);
  }
  var handAnim = null;
  function guideShow() {
    if (state !== "swipe" || drag || guideOn || prog > 0.01) return;
    guideOn = true;
    anim(zip, [{ opacity: 0 }, { opacity: 1 }], 400);
    var pull = zip.querySelector(".pull");
    anim(pull, [{ transform: "scale(0.2)" }, { transform: "scale(1)" }], 500, SPRING).finished.then(function () { pull.style.transform = ""; });
    // the hand presses at the pull and draws the line down, again and again
    var x = Z.x - 55, y0 = Z.y0 - 5, y1 = Z.y1 - 40;
    hand.style.left = x + "px"; hand.style.top = y0 + "px";
    if (handAnim) handAnim.cancel();
    handAnim = hand.animate ? hand.animate([
      { opacity: 0, transform: "translate(40px, 40px) scale(1.1)" },
      { opacity: 1, transform: "translate(0, 0) scale(1.1)", offset: 0.15 },
      { opacity: 1, transform: "translate(0, 0) scale(0.95)", offset: 0.25 },
      { opacity: 1, transform: "translate(0, " + (y1 - y0) + "px) scale(0.95)", offset: 0.7 },
      { opacity: 0, transform: "translate(0, " + (y1 - y0 + 20) + "px) scale(1.05)", offset: 0.85 },
      { opacity: 0, transform: "translate(40px, 40px) scale(1.1)" },
    ], { duration: 2100, iterations: Infinity, easing: "ease-in-out", delay: 300, fill: "backwards" }) : null;
  }
  function guideHide() {
    if (!guideOn) return;
    guideOn = false;
    anim(zip, [{ opacity: 1 }, { opacity: 0 }], 200);
    if (handAnim) { handAnim.cancel(); handAnim = null; }
    hand.style.opacity = 0;
  }
  function dragStart(p) {
    guideHide();
    if (!unzipShown) { unzipShown = true; Player.still("unzip_" + dress, 0.35); }
    drag = { y: p.y, t0: target };
    anim(handle, [{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1)" }], 250, SPRING);
    runZip();
  }
  function dragMove(p) {
    if (!drag) return;
    target = Math.max(0, Math.min(1, drag.t0 + (p.y - drag.y) / ((Z.y1 - Z.y0) * TRAVEL)));
    runZip();
  }
  function dragEnd() {
    if (!drag) return;
    drag = null;
    if (state !== "swipe") return;
    target = Math.max(prog, target) >= 0.4 ? 1 : 0; // far enough: it finishes by itself
    runZip();
  }
  function runZip() {
    if (zipRaf || state !== "swipe") return;
    lastT = performance.now();
    zipRaf = requestAnimationFrame(stepZip);
  }
  function stepZip(now) {
    zipRaf = 0;
    if (state !== "swipe") return;
    var dt = Math.max(0.001, Math.min(0.05, (now - lastT) / 1000));
    lastT = now;
    var d = target - prog;
    var step = d * (1 - Math.exp(-dt * 11)), max = MAX_SPEED * dt;
    if (Math.abs(step) > max) step = d > 0 ? max : -max;
    if (Math.abs(d) < 0.003) step = d;
    var L = Z.y1 - Z.y0;
    travel += Math.abs(step) * L;
    while (travel > 12) { travel -= 12; Sound.zip(Math.min(1, Math.abs(step) / dt / MAX_SPEED)); }
    prog += step;
    handle.style.top = (Z.y0 + L * prog) + "px";
    Player.seek(UNZIP_T * prog);
    if (prog >= 0.999) { unzipped(); return; }
    if (!drag && target === 0 && prog <= 0.001) { // sprang back: show the hint again
      anim(handle, [{ opacity: 1 }, { opacity: 0 }], 200);
      later(450, guideShow);
      return;
    }
    if (Math.abs(target - prog) > 0.0005 || drag) zipRaf = requestAnimationFrame(stepZip);
  }
  function unzipped() {
    state = "unzipped";
    Sound.done();
    sparks(Z.x, Z.y1, 16, 190, 1);
    hideTitle();
    anim(handle, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(2.2)" }], 450);
    // She stays with her back to us a little longer: the clip plays on and eases into slow motion
    // (1x -> 0.55x over half a second), 1.5 s in all, before the chat.
    var v = Player.release();
    if (v) {
      [[0, 0.85], [200, 0.7], [450, 0.55]].forEach(function (r) {
        setTimeout(function () { try { v.playbackRate = r[1]; } catch (e) {} }, r[0]);
      });
    }
    setTimeout(chatScene, HOLD_MS);
  }

  // 5. Dark-mode chat with Ruby
  function chatScene() {
    state = "chat";
    guideHide();
    zip.style.opacity = 0; hand.style.opacity = 0; handle.style.opacity = 0;
    anim(cut, [{ opacity: 0 }, { opacity: 1 }], 260, "ease-in").finished.then(function () {
      Player.play("chat_" + dress, { loop: true, fade: 0, loopFade: 0.5 });
      stage.classList.add("dark");
      title.innerHTML = "";
      chatAt(CHAT_Y.chat, true);
      pill.classList.add("online");
      $("pillRole").textContent = T.online;
      setTimeout(function () {
        anim(cut, [{ opacity: 1 }, { opacity: 0 }], 480, "ease-out");
        anim(pill, [{ opacity: 0, transform: "translateX(-50%) translateY(-16px)" }, { opacity: 1, transform: "translateX(-50%)" }], 450, EASE_OUT, 150);
        say(T.final, 800, function () {
          cta.querySelector(".t").textContent = T.cta;
          show(cta, 600, 300, "translateY(50px) scale(0.9)");
          AD.gameEnd();
        });
      }, 160);
    });
  }

  // ---------------------------------------------------------------- input
  stage.addEventListener("pointerdown", function (e) {
    Sound.init();
    Player.kick();
    var p = toStage(e);
    if (state === "intro") { tapRing(p); Sound.tap(); choose(); return; }
    if (state === "choose") {
      var card = e.target.closest && e.target.closest(".card");
      if (card && cardsReady) { pickDress(cardEls.indexOf(card)); return; }
      // the "Try it on" button, with a forgiving margin; does nothing while disabled
      if (dress && p.y > 1515 && p.y < 1710) { tapRing(p); Sound.tap(); wear(); }
      return;
    }
    if (state === "swipe") { try { stage.setPointerCapture(e.pointerId); } catch (x) {} dragStart(p); return; }
    if (state === "chat") { tapRing(p); AD.click(CFG.clickUrl); }
  });
  stage.addEventListener("pointermove", function (e) { if (drag) dragMove(toStage(e)); });
  stage.addEventListener("pointerup", dragEnd);
  stage.addEventListener("pointercancel", dragEnd);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { Player.pause(); Sound.suspend(); } else { Player.resume(); Sound.resume(); }
  });

  // ---------------------------------------------------------------- go
  function start() {
    AD.gameReady();
    // QA shortcuts: ?d=red|black|burgundy jumps to the swipe, &end=1 to the final chat
    if (Q.d && ZIP[Q.d]) {
      dress = Q.d;
      chatAt(CHAT_Y.wear, true);
      $("logo").style.opacity = 1;
      if (Q.end) { state = "swipe"; Z = ZIP[dress]; chatScene(); } else swipeScene();
      return;
    }
    intro();
  }
  function ready() {
    var go = function () { AD.onReady(start); };
    if (document.fonts && document.fonts.load) {
      Promise.all(["400", "500", "600"].map(function (w) { return document.fonts.load(w + " 40px 'General Sans'"); }))
        .then(go, go);
      setTimeout(go, 1500); // never wait long for fonts
    } else go();
  }
  var started = false;
  var _start = start;
  start = function () { if (started) return; started = true; _start(); };
  ready();
})();
