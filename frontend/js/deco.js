/* GunWaree decoration: adds the water, cloud and rain details styled in css/deco.css to the app shell.
   - behind the app: drifting clouds, rolling mist, flood water at the foot of the sky, far-off lightning
   - splashes where the rain from js/sky.js meets the tops of cards (a 2D canvas, paused when the tab is hidden)
   - the sidebar: condensation and running drops on the glass, water with bubbles and light at the bottom
   - page titles, the top bar, the footer and the phone tab bar: clouds and a running tide
   - a water ripple wherever people tap
   Nothing here is read by screen readers or takes clicks. Reduced motion keeps the still scene only. */

(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Phones, narrow screens, slow machines and data saver: the heavy parts stay off (the full-screen splash
  // canvas, rising bubbles, tap ripples). Everything else is CSS and stays.
  var conn = navigator.connection;
  var lite = window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 900px)').matches ||
    (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ||
    !!(conn && conn.saveData);

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function el(cls, style) {
    var e = document.createElement('div');
    e.className = cls;
    if (style) for (var k in style) e.style.setProperty(k, style[k]);
    return e;
  }
  function layer(cls) {
    var e = el(cls);
    e.setAttribute('aria-hidden', 'true');
    return e;
  }

  function sea(cls) {
    var s = el('sea' + (cls ? ' ' + cls : ''));
    s.appendChild(el('wave wave--far'));
    s.appendChild(el('wave wave--mid'));
    s.appendChild(el('wave wave--near'));
    return s;
  }

  // n drifting cloud puffs spread over the drift so some are already on screen when the page opens
  function puffs(host, n, opts) {
    for (var i = 0; i < n; i++) {
      var t = rand(opts.tMin, opts.tMax);
      host.appendChild(el('puff', {
        '--y': rand(opts.yMin, opts.yMax) + '%',
        '--w': rand(opts.wMin, opts.wMax) + 'rem',
        '--t': t + 's',
        '--delay': -rand(0, t) + 's',
        '--still': rand(0, 80) + '%'
      }));
    }
  }

  function drops(host, n, run, area) {
    for (var i = 0; i < n; i++) {
      host.appendChild(el('drop', {
        '--x': rand(4, 92) + '%',
        '--y': rand(area[0], area[1]) + '%',
        '--d': rand(4.5, 10).toFixed(1) + 'px',
        '--o': rand(0.45, 0.85).toFixed(2),
        '--delay': -rand(0, 6) + 's'
      }));
    }
    for (var j = 0; j < run; j++) {
      var t = rand(8, 14);
      host.appendChild(el('drop drop--run', {
        '--x': rand(8, 88) + '%',
        '--y': rand(area[0], area[0] + 25) + '%',
        '--d': rand(7, 10).toFixed(1) + 'px',
        '--o': '0.85',
        '--run-t': t + 's',
        '--fall': Math.round(rand(140, 300)) + 'px',
        '--delay': -rand(0, t) + 's'
      }));
    }
  }

  function bubbles(host, n) {
    for (var i = 0; i < n; i++) {
      var t = rand(5, 9);
      host.appendChild(el('bubble', {
        '--x': rand(6, 90) + '%',
        '--d': rand(3, 7).toFixed(1) + 'px',
        '--t': t + 's',
        '--rise': Math.round(rand(60, 120)) + 'px',
        '--sway': Math.round(rand(-8, 8)) + 'px',
        '--delay': -rand(0, t) + 's'
      }));
    }
  }

  /* ---------- Build the scene ---------- */

  var sky = document.querySelector('.sky');
  var flash = null;
  if (sky) {
    var clouds = layer('sky__clouds');
    puffs(clouds, 5, { yMin: 0, yMax: 60, wMin: 20, wMax: 38, tMin: 70, tMax: 130 });
    sky.appendChild(clouds);
    sky.appendChild(layer('sky__mist'));
    var skySea = sea('sky__sea sea--deep');
    skySea.setAttribute('aria-hidden', 'true');
    sky.appendChild(skySea);
    flash = layer('sky__flash');
    sky.appendChild(flash);
  }

  var sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    var sb = layer('sb-deco');
    var glass = el('glass');
    drops(glass, 16, 3, [6, 70]);
    sb.appendChild(glass);
    var sbSea = sea('sea--deep');
    sbSea.appendChild(el('caustics'));
    if (!lite) bubbles(sbSea, 9);
    sb.appendChild(sbSea);
    sb.appendChild(el('sheen', { '--t': '13s', '--delay': '3s' }));
    sidebar.insertBefore(sb, sidebar.firstChild);
  }

  var tabbar = document.querySelector('.tabbar');
  if (tabbar) {
    var tb = layer('tab-deco');
    tb.appendChild(sea());
    tabbar.insertBefore(tb, tabbar.firstChild);
  }

  var topbar = document.querySelector('.topbar');
  if (topbar) {
    var top = layer('tb-deco');
    top.appendChild(sea());
    top.appendChild(el('sheen', { '--t': '12s', '--delay': '6s' }));
    topbar.insertBefore(top, topbar.firstChild);
  }

  var allPuffs = [];
  document.querySelectorAll('.page-head').forEach(function (head) {
    var ph = layer('ph-deco');
    puffs(ph, 4, { yMin: -25, yMax: 55, wMin: 12, wMax: 22, tMin: 28, tMax: 48 });
    ph.appendChild(sea());
    drops(ph, 7, 1, [8, 60]);
    head.insertBefore(ph, head.firstChild);
    allPuffs.push(ph);
  });

  document.querySelectorAll('.app-footer').forEach(function (foot) {
    var ft = layer('ft-deco');
    puffs(ft, 3, { yMin: -20, yMax: 40, wMin: 14, wMax: 24, tMin: 40, tMax: 70 });
    ft.appendChild(sea());
    foot.insertBefore(ft, foot.firstChild);
    allPuffs.push(ft);
  });
  if (sky) allPuffs.push(sky.querySelector('.sky__clouds'));

  // Clouds cross the whole box they live in, whatever its width
  function spans() {
    allPuffs.forEach(function (host) {
      host.style.setProperty('--span', Math.round(host.getBoundingClientRect().width + 40) + 'px');
    });
  }
  spans();
  window.addEventListener('resize', spans);

  /* ---------- Splashes where the rain lands ---------- */

  var canvas = null, ctx = null, w = 0, h = 0, dpr = 1;
  var ledges = [];       // tops of cards on screen: { x, y, w }
  var bits = [];         // splash droplets in the air
  var rings = [];        // little crowns on the surface
  var running = false, raf = 0, last = 0, budget = 0;
  var LEDGES = '.card, .hero, .panel, .box, .page-head, .topbar, .app-footer';

  if (sky && !lite) {
    canvas = document.createElement('canvas');
    canvas.className = 'sky__splash';
    canvas.setAttribute('aria-hidden', 'true');
    sky.insertBefore(canvas, flash);
    ctx = canvas.getContext('2d');
  }

  function size() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
  }

  var measuring = false;
  function measure() {
    if (measuring) return;
    measuring = true;
    requestAnimationFrame(function () {
      measuring = false;
      ledges = [];
      document.querySelectorAll(LEDGES).forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.width < 120 || r.top < 8 || r.top > h - 20) return;
        ledges.push({ x: r.left + 10, y: r.top, w: r.width - 20 });
      });
      // The water at the foot of the sky catches rain too
      ledges.push({ x: 0, y: h - Math.min(120, Math.max(70, h * 0.11)) * 0.55, w: w, sea: true });
    });
  }

  function splash() {
    if (!ledges.length) return;
    var l = pick(ledges);
    var x = l.x + Math.random() * l.w;
    var n = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      bits.push({
        x: x, y: l.y - 1,
        vx: rand(-1.4, 1.4),
        vy: rand(-2.6, -1.1),
        life: 1,
        r: rand(0.7, 1.4)
      });
    }
    rings.push({ x: x, y: l.y - 0.5, life: 1, max: l.sea ? rand(8, 14) : rand(4, 8) });
  }

  function frame(now) {
    var f = last ? Math.min(now - last, 50) / 16.7 : 1;
    last = now;
    budget += f * 0.55 * Math.min(1.6, w / 900);   // about 30 splashes a second on a laptop screen
    while (budget >= 1) { splash(); budget -= 1; }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240, 252, 255, 0.85)';
    for (var i = bits.length - 1; i >= 0; i--) {
      var b = bits[i];
      b.vy += 0.16 * f;
      b.x += b.vx * f;
      b.y += b.vy * f;
      b.life -= 0.045 * f;
      if (b.life <= 0) { bits.splice(i, 1); continue; }
      ctx.globalAlpha = b.life;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 6.283);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    for (var j = rings.length - 1; j >= 0; j--) {
      var r = rings[j];
      r.life -= 0.05 * f;
      if (r.life <= 0) { rings.splice(j, 1); continue; }
      var rad = r.max * (1 - r.life);
      ctx.globalAlpha = r.life * 0.7;
      ctx.strokeStyle = 'rgba(240, 252, 255, 1)';
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * 0.28, 0, Math.PI, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!canvas || running || document.hidden || reduce.matches) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    bits = [];
    rings = [];
    if (ctx) ctx.clearRect(0, 0, w, h);
  }

  /* ---------- Far-off lightning, every half minute to a minute ---------- */

  var flashTimer = 0;
  function nextFlash() {
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      if (flash && !document.hidden && !reduce.matches) {
        flash.style.setProperty('--fx', Math.round(rand(15, 85)) + '%');
        flash.classList.remove('is-on');
        void flash.offsetWidth;
        flash.classList.add('is-on');
      }
      nextFlash();
    }, rand(28000, 60000));
  }

  /* ---------- A ripple where people tap ---------- */

  if (!lite) document.addEventListener('pointerdown', function (e) {
    if (reduce.matches || e.button > 0) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    [0, 1].forEach(function (i) {
      var r = el('ripple' + (i ? ' ripple--2' : ''), {
        '--x': e.clientX + 'px',
        '--y': e.clientY + 'px',
        '--delay': (i * 140) + 'ms',
        '--s': i ? '4.5' : '6'
      });
      r.setAttribute('aria-hidden', 'true');
      document.body.appendChild(r);
      r.addEventListener('animationend', function () { r.remove(); });
    });
  }, { passive: true });

  /* ---------- Keep it in step with the page ---------- */

  size();
  start();
  nextFlash();

  window.addEventListener('resize', size);
  if (canvas) {
    window.addEventListener('scroll', measure, { passive: true });
    // Cards appear and grow as data arrives: measure again when the page content changes size,
    // or (without ResizeObserver) every 5 seconds while the tab is visible
    var content = document.querySelector('.content');
    if (window.ResizeObserver && content) {
      new ResizeObserver(function () { if (running) measure(); }).observe(content);
    } else {
      setInterval(function () { if (running && !document.hidden) measure(); }, 5000);
    }
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  function applyMotion() { if (reduce.matches) stop(); else start(); }
  if (reduce.addEventListener) reduce.addEventListener('change', applyMotion);
})();
