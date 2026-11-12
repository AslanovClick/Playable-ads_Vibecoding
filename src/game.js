(function () {
  "use strict";

  var CFG = window.PLAYABLE_CONFIG, T = CFG.text, CLIPS = window.PLAYABLE_CLIPS || {};
  var W = 1080, H = 1920; // Figma frame

  // Loops: cross-fade from `out` back to `in` (seconds), where her pose matches best (measured
  // frame by frame on the clips).
  var LOOPS = { intro: [4.375, 0], idle1: [4.542, 0.667], idle2: [4.0, 0.208], cta: [5.0, 0.292] };
  // When a reply is picked during an idle loop, the reaction starts at the next moment the loop is
  // back in the pose the reaction clips start from (seconds); never later than WAIT ms.
  var WIN = { intro: [[0, 0.1], [4.1, 4.6]], idle1: [[0, 1.0], [3.75, 4.6]], idle2: [[0, 0.92], [3.5, 4.05]] };
  var WAIT = 2000, WAIT_START = 1300; // after the start button the chat should not keep you waiting
  // The wide scenes (start, hook, first reaction) are lifted so her head sits right under the logo;
  // the camera comes down to the normal framing with the push-in of the "good girl" line.
  var LIFT = 140;
  // Joins where the camera framing differs between the end of one clip and the start of the next:
  // the next clip starts zoomed / shifted [scale, x px, y px] so it lines up with the last frame of
  // the one before, cross-fades in, then eases back to its own framing (a slow camera move).
  // "soft": her pose differs too (head tilt, hand), so a light haze peaks mid-fade to hide the double image.
  var JOIN = {
    "maybe>tension": [1.16, 54, 129, "soft"], // she leaned in; the push-in starts from there
    "tension>idle2": [1.23, 10, 159], "tension>bad": [1.24, 10, 159], "tension>tease": [1.24, 10, 159],
    "bad>final": [1.02, 0, 5],
    "tease>final": [1, -5, 5, "soft"], // hand on the collarbone -> chin on the hand
  };
  // Seconds into a clip (her voice) when text comes in
  var AT = { hookMsg: 0.1, hookOptions: 3.2, react: 0.3, tensionMsg: 0.35, tensionOptions: 6.0, finalMsg: 0.35, cta: 1.9 };

  // The bottom line of the content (options, message, CTA): the same distance above the disclaimer
  // in every scene, so nothing jumps. GAP: between a message and what is under it.
  var LINE = 1730, GAP = 24;
  // Where the chat sits (bottom edge of the message): alone on the line, or above the CTA (158 high)
  var CHAT_Y = { low: LINE, cta: LINE - 158 - GAP };

  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), cam = $("cam"), videos = $("videos"), chat = $("chat"), snd = $("snd");
  var choices = $("choices"), cta = $("cta"), go = $("go"), fx = $("fx");

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
  var state = "start";
  function later(ms, fn) { var s = state; return setTimeout(function () { if (state === s) fn(); }, ms); }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }

  // ---------------------------------------------------------------- sound (synthesised, no files)
  var Sound = (function () {
    var ctx = null, out = null, noise = null;
    function init() {
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
    var on = false;
    function ok() { return on && ctx && ctx.state === "running"; }
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
      setOn: function (v) { on = v; },
      suspend: function () { try { if (ctx) ctx.suspend(); } catch (e) {} },
      resume: function () { try { if (ctx) ctx.resume(); } catch (e) {} },
    };
  })();

  // ---------------------------------------------------------------- video player
  // Four stacked <video> layers. A new clip starts on a free layer and fades in over the current one
  // once its first frame is on screen (the sound of the old one fades out with it); loops fade into a
  // fresh copy of themselves at their loop point instead of jumping.
  var Player = (function () {
    var els = Array.prototype.slice.call(videos.querySelectorAll("video"));
    var cur = null, z = 1, urls = {}, seq = 0, audible = false, unlocked = false, pending = null;
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
      setTimeout(go, 900);
    }
    function fadeVolume(v, to, ms) { // (iOS keeps the volume at 1; there the old clip is simply quiet by then)
      clearInterval(v._vt);
      var from = v.volume, t0 = Date.now();
      v._vt = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / ms);
        try { v.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) {}
        if (k >= 1) clearInterval(v._vt);
      }, 30);
    }
    function bringUp(v, fade) {
      var prev = cur, o = v._o;
      cur = v;
      v._busy = false;
      if (prev && prev !== v) prev._busy = true;
      v.style.zIndex = ++z;
      v.style.transition = "none";
      v.style.opacity = 0;
      // camera match: start framed like the last frame of the clip before, then ease to its own framing
      if (v._settle) { try { v._settle.cancel(); } catch (e) {} v._settle = null; }
      v.style.transform = "";
      var m = o.match;
      if (m && (m[0] !== 1 || m[1] || m[2])) {
        v._settle = anim(v, [{ transform: "translate(" + m[1] + "px," + m[2] + "px) scale(" + m[0] + ")" }, { transform: "none" }],
          o.settle || 1800, "cubic-bezier(0.42, 0, 0.3, 1)", o.hold || 0);
      }
      // a haze over the whole picture at the middle of the fade, where two different poses overlap
      if (prev && prev !== v && (o.soft || (m && m[3] === "soft"))) {
        anim(cam, [{ filter: "none" }, { filter: "blur(7px) brightness(1.06)", offset: 0.5 }, { filter: "none" }], fade * 1000 + 160, "ease-in-out");
      }
      clearInterval(v._vt);
      try { v.volume = 1; } catch (e) {}
      void v.offsetWidth;
      v.style.transition = "opacity " + fade + "s ease-in-out";
      v.style.opacity = 1;
      if (prev && prev !== v) {
        fadeVolume(prev, 0, fade * 1000);
        setTimeout(function () {
          prev._busy = false;
          if (cur === prev) return;
          prev.style.transition = "none"; prev.style.opacity = 0;
          try { prev.pause(); } catch (e) {}
        }, fade * 1000 + 80);
      }
      if (o.onStart) o.onStart();
    }
    function start(v) {
      v.muted = !audible;
      var p = v.play();
      if (p && p.catch) p.catch(function (err) {
        if (err && err.name === "NotAllowedError" && !v.muted) { // sound not allowed yet: play on silently until a tap
          audible = false;
          v.muted = true;
          var p2 = v.play();
          if (p2 && p2.catch) p2.catch(function () { blocked = true; });
          if (api.onSilenced) api.onSilenced();
        } else if (!err || err.name !== "AbortError") blocked = true;
      });
    }
    function play(name, o) {
      o = o || {};
      var v = pick(name), fade = o.fade == null ? 0.4 : o.fade, my = ++seq;
      v._reserved = false;
      v._busy = true;
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
      v.muted = true;
      var p = v.play(); // decode the first frame ahead of time
      if (p && p.then) p.then(function () { if (v !== cur && !v._busy) { v.pause(); try { v.currentTime = 0; } catch (e) {} } }, function () {});
    }
    function inWindow(v) {
      var w = WIN[v._clip], t = v.currentTime;
      return !w || w.some(function (r) { return t >= r[0] && t <= r[1]; });
    }
    function tick() {
      var v = cur;
      if (v && v._o && !v._fired && !v.paused && v.duration) {
        var o = v._o, d = v.duration, t = v.currentTime;
        var lf = o.loopFade || 0.45, lp = LOOPS[v._clip] || [d, 0];
        if (o.loop && pending && (inWindow(v) || Date.now() > pending.until)) {
          var p = pending; pending = null; v._fired = true;
          p.fn(Date.now() > p.until);
        } else if (o.loop && t >= Math.min(lp[0], d - 0.05) - lf / 2) {
          v._fired = true;
          play(v._clip, { loop: true, fade: lf, loopFade: o.loopFade, at: Math.max(0, lp[1] - lf / 2) });
        } else if (!o.loop && t >= d - (o.lead || 0.45)) {
          v._fired = true;
          if (pending) { var q = pending; pending = null; q.fn(false); }
          else if (o.onEnd) o.onEnd();
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    var blocked = false, hidden = [];
    var api = {
      play: play, preload: preload,
      clip: function () { return cur ? cur._clip : null; },
      // run fn at the next point the current clip can hand over smoothly: the end of a one-shot
      // (instead of what it would play next), or a matching moment of a loop
      next: function (fn, wait) { pending = { fn: fn, until: Date.now() + (wait || WAIT) }; },
      kick: function () { if (blocked && cur) { blocked = false; start(cur); } },
      // sound on / off; switched on from a tap (inTap), every layer is started once in that tap so
      // that mobile browsers let it play with sound later on
      setAudible: function (on, inTap) {
        audible = on;
        els.forEach(function (v) { v.muted = !on; });
        if (on && inTap && !unlocked) {
          unlocked = true;
          els.forEach(function (v) {
            if (!v.paused || !v._clip) return;
            var p = v.play();
            if (p && p.then) p.then(function () { if (v !== cur && !v._busy) v.pause(); }, function () {});
          });
        }
      },
      pause: function () { hidden = els.filter(function (v) { return !v.paused; }); hidden.forEach(function (v) { v.pause(); }); },
      resume: function () { hidden.forEach(function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }); hidden = []; },
      onSilenced: null,
    };
    return api;
  })();

  // Plays a clip, lined up with the one before it where their framing differs (JOIN)
  function cut(slot, o) {
    var m = JOIN[Player.clip() + ">" + slot];
    if (m) { o.match = m; o.fade = Math.max(o.fade || 0, 0.5); }
    return Player.play(slot, o);
  }
  function idle(slot) { cut(slot, { loop: true, fade: 0.45, settle: 2200 }); }

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
    var cont = lastRow && lastRow.parentNode === chat && !lastRow.classList.contains("gone");
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
      if (r.classList.contains("gone")) return;
      r.classList.add("gone");
      anim(r, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-40px) scale(0.97)" }], ms || 420, "ease-in", i * 60)
        .finished.then(function () { if (r.parentNode) r.parentNode.removeChild(r); });
    });
  }

  // ---------------------------------------------------------------- reply options
  var REPLY = '<svg viewBox="0 0 24 24"><path d="M4.5 6.2A2.7 2.7 0 0 1 7.2 3.5h9.6a2.7 2.7 0 0 1 2.7 2.7v7.1a2.7 2.7 0 0 1-2.7 2.7H11l-3.9 3.3v-3.3h0.1A2.7 2.7 0 0 1 4.5 13.3z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path class="h" d="M12 13s-2.9-1.8-2.9-3.7a1.55 1.55 0 0 1 2.9-.75 1.55 1.55 0 0 1 2.9.75C14.9 11.2 12 13 12 13z"/></svg>';
  var onPick = null;
  // Lays the two options out (still hidden) and returns where the chat has to end above them.
  function setOptions(replies) {
    choices.innerHTML = "";
    choices.className = "abs";
    replies.forEach(function (text, i) {
      var c = mk("div", "chip", '<b class="ic">' + REPLY + "</b><span></span>");
      c.querySelector("span").textContent = text;
      c.setAttribute("data-i", i);
      choices.appendChild(c);
    });
    return H - parseFloat(getComputedStyle(choices).bottom) - choices.offsetHeight - GAP;
  }
  function offerOptions(cb) {
    Array.prototype.forEach.call(choices.children, function (c, i) {
      anim(c, [{ opacity: 0, transform: "translateY(50px) scale(0.96)" }, { opacity: 1, transform: "none" }], 600, SPRING, i * 120)
        .finished.then(function () { c.style.opacity = ""; c.style.transform = ""; c.classList.add("in"); }); // CSS (hover, press, pick) takes over
    });
    later(250, function () { onPick = cb; });
  }
  function pickOption(i) {
    var cb = onPick;
    onPick = null;
    choices.classList.add("done");
    var chips = Array.prototype.slice.call(choices.children), c = chips[i];
    chips.forEach(function (x, k) { x.classList.toggle("sel", k === i); x.classList.toggle("off", k !== i); });
    var r = c.getBoundingClientRect();
    sparks((r.left + r.width / 2 - view.ox) / view.s, (r.top + r.height / 2 - view.oy) / view.s, 12, 260, 1);
    Sound.sparkle();
    // a moment to see the pick, then both leave
    setTimeout(function () {
      chips.forEach(function (x, k) {
        var cs = getComputedStyle(x);
        anim(x, [{ opacity: cs.opacity, transform: cs.transform === "none" ? "none" : cs.transform }, { opacity: 0, transform: "translateY(40px) scale(0.96)" }], 420, "cubic-bezier(0.4, 0, 0.7, 1)", k * 60);
      });
      setTimeout(function () { if (choices.classList.contains("done")) choices.innerHTML = ""; }, 600);
    }, 420);
    cb(i);
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
  $("legal").textContent = T.legal;
  cta.querySelector(".t").textContent = T.cta;
  go.querySelector(".t").textContent = T.start;
  $("title").innerHTML = "<span></span>";
  $("title").firstChild.textContent = T.startTitle;

  // ---------------------------------------------------------------- scenes
  function sec(t) { return Math.round(t * 1000); }

  // S0. Start: "shh", a short line and "Listen to Maya". Any tap starts the chat; being a tap, it
  // also lets the sound in, so her voice is there from the hook on.
  function intro() {
    state = "intro";
    cam.style.transform = "translateY(" + -LIFT + "px)";
    show($("logo"), 700, 100, "translateY(-20px)");
    show(snd, 600, 250, "scale(0.6)");
    Player.play("intro", { loop: true, fade: 0.2 });
    Player.preload("hook");
    later(450, function () { show($("title"), 700, 0, "translateY(24px)"); });
    later(700, function () { show(go, 650, 0, "translateY(50px) scale(0.9)"); });
  }
  function begin(p) {
    state = "begin";
    tapRing(p);
    [$("title"), go].forEach(function (el, k) {
      anim(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(30px) scale(0.97)" }], 420, "cubic-bezier(0.4, 0, 0.7, 1)", 120 + k * 60);
    });
    Player.next(hook, WAIT_START); // as soon as the "shh" is back in the pose the hook starts from
  }

  // S1. Hook: she tucks her hair behind her ear, "Can I be your little secret…", then waits for the
  // reply (her message stays until one is picked)
  function hook(late) {
    state = "hook";
    chatAt(setOptions(T.replies1), true);
    cut("hook", {
      fade: late ? 0.7 : 0.45, soft: late,
      onStart: function () {
        later(sec(AT.hookMsg), function () { say(T.hook, 600); });
        later(sec(AT.hookOptions), function () { offerOptions(react1); });
      },
      onEnd: function () { idle("idle1"); },
    });
    Player.preload("idle1");
  }

  // S2. Her reaction to the first reply: an eyebrow, or a quiet laugh as she leans in
  function react1(i) {
    state = "react1";
    clearChat();
    var slot = i ? "maybe" : "behave";
    Player.preload(slot);
    Player.next(function (late) {
      cut(slot, {
        fade: late ? 0.7 : 0.4, soft: late,
        onStart: function () { later(sec(AT.react), function () { chatAt(CHAT_Y.low, true); say(T.react1[i], 600); }); },
        onEnd: tension, lead: 0.5,
      });
      Player.preload("tension");
    });
  }

  // S3. The camera eases in to chest and face: "Now tell me… should I be a good girl tonight…"
  function tension() {
    state = "tension";
    cut("tension", {
      fade: 0.45, settle: 2400,
      onStart: function () {
        // the camera comes down from the lifted wide framing along with her push-in
        if (getComputedStyle(cam).transform !== "none") anim(cam, [{ transform: "translateY(" + -LIFT + "px)" }, { transform: "none" }], 2400, "cubic-bezier(0.42, 0, 0.3, 1)");
        clearChat();
        later(sec(AT.tensionMsg), function () { chatAt(setOptions(T.replies2), true); say(T.tension, 500); });
        later(sec(AT.tensionOptions), function () { offerOptions(react2); });
      },
      onEnd: function () { idle("idle2"); }, lead: 0.5,
    });
    Player.preload("idle2");
  }

  // S4. Her reaction to the second reply: steady eye contact, or fingertips on her collarbone
  function react2(i) {
    state = "react2";
    clearChat();
    var slot = i ? "tease" : "bad";
    Player.preload(slot);
    Player.next(function (late) {
      cut(slot, {
        fade: late ? 0.7 : 0.4, soft: late, settle: 2000,
        onStart: function () { later(sec(AT.react), function () { chatAt(CHAT_Y.low, true); say(T.react2[i], 600); }); },
        onEnd: finale, lead: 0.5,
      });
      Player.preload("final");
    });
  }

  // S5. Chin on her hand: "It's past midnight…" and the pulsing "Chat with Maya"; any tap goes to the store
  function finale() {
    state = "end";
    stage.classList.add("end");
    cut("final", {
      fade: 0.5, settle: 1200,
      onStart: function () {
        clearChat();
        later(sec(AT.finalMsg), function () { chatAt(CHAT_Y.cta, true); say(T.final, 500); });
        later(sec(AT.cta), function () { show(cta, 650, 0, "translateY(50px) scale(0.9)"); AD.gameEnd(); });
      },
      onEnd: function () { idle("cta"); }, lead: 0.45,
    });
    Player.preload("cta");
  }

  // ---------------------------------------------------------------- sound toggle
  // Sound is on from the start (CFG.sound). Where the browser does not allow sound before a tap, the
  // clips play silently meanwhile (the button still shows "on") and her voice comes in with the
  // first tap anywhere. The button switches it off and on.
  var soundOn = !!CFG.sound, silenced = false;
  function setSound(on, inTap) {
    soundOn = on;
    silenced = false;
    snd.classList.toggle("off", !on);
    Sound.setOn(on);
    Player.setAudible(on, inTap);
  }
  setSound(soundOn, false);
  Player.onSilenced = function () { silenced = true; };

  // ---------------------------------------------------------------- input
  stage.addEventListener("pointerdown", function (e) {
    Sound.init();
    if (e.target.closest && e.target.closest("#snd")) {
      setSound(!soundOn, true);
      Sound.pop();
      Player.kick();
      return;
    }
    if (soundOn && silenced) setSound(true, true); // the first tap lets the sound in
    Player.kick();
    var p = toStage(e);
    if (state === "intro") { if (soundOn) setSound(true, true); Sound.tap(); begin(p); return; }
    if (state === "end") { tapRing(p); AD.click(CFG.clickUrl); return; }
    var chip = e.target.closest && e.target.closest(".chip");
    if (chip && onPick && !choices.classList.contains("done")) { Sound.tap(); pickOption(+chip.getAttribute("data-i")); }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { Player.pause(); Sound.suspend(); } else { Player.resume(); Sound.resume(); }
  });

  // ---------------------------------------------------------------- go
  function start() {
    AD.gameReady();
    // QA shortcuts: ?s=tension jumps to the second question, ?s=end to the final screen
    if (Q.s === "tension" || Q.s === "end") {
      $("logo").style.opacity = 1; snd.style.opacity = 1;
      if (Q.s === "end") finale(); else tension();
      return;
    }
    if (Q.s === "hook") { $("logo").style.opacity = 1; snd.style.opacity = 1; cam.style.transform = "translateY(" + -LIFT + "px)"; hook(); return; }
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
