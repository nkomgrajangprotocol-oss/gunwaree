/* GunWaree app background: the bright blue-sky video with falling rain drawn on a 2D canvas.
   Light by design (a few hundred lines per frame); paused when the tab is hidden.
   Reduced motion: the video is hidden (the poster stays) and a single still frame of rain is drawn. */

(function () {
  'use strict';

  var video = document.querySelector('[data-sky-video]');
  var canvas = document.querySelector('[data-sky-rain]');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var drops = [];
  var w = 0, h = 0, dpr = 1;
  var running = false;
  var rafId = 0;
  var last = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Three depths: far drops are short, faint and slow; near drops are long, brighter and fast
  function makeDrop(anywhere) {
    var depth = Math.random();
    return {
      x: rand(-0.1, 1.05) * w,
      y: anywhere ? rand(0, h) : rand(-h * 0.3, 0),
      depth: depth,
      len: 10 + depth * 26,
      speed: 9 + depth * 13
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.round(Math.min(260, (w * h) / 9000));
    drops = [];
    for (var i = 0; i < count; i++) drops.push(makeDrop(true));
  }

  // Each streak is drawn as a soft dark edge under a light core, so rain shows on blue sky
  // and on white cloud alike. Streaks are batched into three depth bands: six strokes a frame.
  var BANDS = [
    { max: 0.34, dark: 'rgba(40, 70, 100, 0.14)', light: 'rgba(255, 255, 255, 0.30)', width: 0.8 },
    { max: 0.67, dark: 'rgba(40, 70, 100, 0.18)', light: 'rgba(255, 255, 255, 0.42)', width: 1.1 },
    { max: 1.01, dark: 'rgba(40, 70, 100, 0.22)', light: 'rgba(255, 255, 255, 0.55)', width: 1.5 }
  ];

  function draw(f) {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    var paths = BANDS.map(function () { return new Path2D(); });
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      if (f) {
        d.y += d.speed * f;
        d.x += d.speed * 0.08 * f;
        if (d.y - d.len > h) drops[i] = d = makeDrop(false);
      }
      var band = d.depth < BANDS[0].max ? 0 : d.depth < BANDS[1].max ? 1 : 2;
      paths[band].moveTo(d.x, d.y);
      paths[band].lineTo(d.x - d.len * 0.08, d.y - d.len);
    }
    for (var b = 0; b < BANDS.length; b++) {
      ctx.strokeStyle = BANDS[b].dark;
      ctx.lineWidth = BANDS[b].width + 1.2;
      ctx.stroke(paths[b]);
      ctx.strokeStyle = BANDS[b].light;
      ctx.lineWidth = BANDS[b].width;
      ctx.stroke(paths[b]);
    }
  }

  function frame(now) {
    var f = last ? Math.min(now - last, 50) / 16.7 : 1;
    last = now;
    draw(f);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || document.hidden || reduceMotion.matches) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function applyMotion() {
    if (reduceMotion.matches) {
      stop();
      if (video) video.pause();
      draw(0);
    } else {
      if (video) {
        video.defaultPlaybackRate = video.playbackRate = 0.85;
        video.play().catch(function () { /* autoplay blocked: the poster stays */ });
      }
      start();
    }
  }

  // Carry the sky on from where the last page left it, so moving between pages never restarts the clouds
  var SKY_KEY = 'gw_sky_t';
  if (video) {
    var resume = 0;
    try { resume = parseFloat(sessionStorage.getItem(SKY_KEY)) || 0; } catch (e) { resume = 0; }
    var seek = function () {
      if (resume > 0 && video.duration) video.currentTime = (resume + 0.3) % video.duration;
    };
    if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, { once: true });
    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem(SKY_KEY, String(video.currentTime || 0)); } catch (e) { /* storage blocked */ }
    });
  }

  resize();
  applyMotion();

  window.addEventListener('resize', function () {
    resize();
    if (!running) draw(0);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
      if (video) video.pause();
    } else {
      applyMotion();
    }
  });
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', applyMotion);
})();
