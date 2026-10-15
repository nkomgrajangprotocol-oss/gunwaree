/* GunWaree 3D flood scene, shared by every page with a [data-scene] mount.
   Builds the markup (real GunWaree components with sample data), then animates the
   water plane and a subtle pointer parallax. Decorative only: the mount is aria-hidden. */

(function (GW) {
  'use strict';

  /* ---------- Markup ---------- */

  // Closed organic contour: polar noise smoothed into cubic Beziers (Catmull-Rom)
  function contour(cx, cy, radius, seed, amp1, amp2) {
    var n = 36;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      var r = radius * (1 + amp1 * Math.sin(3 * t + seed) + amp2 * Math.sin(5 * t + seed * 1.7) +
        0.025 * Math.sin(8 * t + seed * 2.3));
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t) * 0.92]);
    }
    var f = function (v) { return v.toFixed(1); };
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (var k = 0; k < n; k++) {
      var p0 = pts[(k - 1 + n) % n], p1 = pts[k], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' +
        f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + 'Z';
  }

  function stratum(level, d) {
    return '<div class="stratum stratum--' + level + '"><svg viewBox="0 0 600 600">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1"/></svg></div>';
  }

  // Staff gauge ticks: 0 to 40 cm, 5 px per cm in the 38 x 200 board
  function gaugeTicks() {
    var out = '';
    for (var cm = 0; cm <= 40; cm++) {
      var y = Math.min(199.5, Math.max(0.5, 200 - cm * 5));
      var x2 = cm % 10 === 0 ? 22 : (cm % 2 === 0 ? 15 : 11);
      out += '<line x1="7" x2="' + x2 + '" y1="' + y + '" y2="' + y + '"/>';
      if (cm % 10 === 0 && cm > 0 && cm < 40) out += '<text x="24" y="' + (203 - cm * 5) + '">' + cm + '</text>';
    }
    return out;
  }

  // Field names, statuses and levels match the backend (GET /districts/latest, /incidents/mine, /risk).
  // /risk uses rule B2 for now, which returns 0 / 33 / 67 / 100 for none / watch / warning / critical.
  var CARDS =
    // District road-flood reading: GET /districts/latest
    '<article class="s-card s-card--district" data-z="4">' +
      '<div class="s-card__head"><p class="s-card__title">Road flooding, Bang Phlat <span class="th" lang="th">น้ำท่วมถนน เขตบางพลัด</span></p><span class="s-tag">Sample</span></div>' +
      '<div class="s-figure"><span class="s-figure__num">18</span><span class="s-figure__unit">cm <span lang="th">ซม.</span> max depth</span></div>' +
      '<div class="s-rule"></div>' +
      '<div class="s-row s-meta"><span class="s-level s-level--orange">High <span class="th" lang="th">สูง</span></span><span>3 road points <span lang="th">จุดวัด</span></span></div>' +
      '<p class="s-meta"><span class="mono">2026-10-14 13:05</span></p>' +
    '</article>' +

    // Rescue report: POST /incidents, GET /incidents/mine
    '<article class="s-card s-card--case" data-z="13">' +
      '<div class="s-card__head"><p class="s-card__title">Rescue report #7 <span class="th" lang="th">แจ้งเหตุ #7</span></p><span class="s-tag">Sample</span></div>' +
      '<p class="s-desc"><span lang="th">น้ำท่วมหน้าบ้านสูงประมาณ 20 ซม.</span><br>Floodwater about 20 cm at the front door</p>' +
      '<div class="s-rule"></div>' +
      '<div class="s-row s-meta"><span><span lang="th">ซอยลาดพร้าว 71</span></span><span class="s-status">In progress <span lang="th">กำลังดำเนินการ</span></span></div>' +
      '<p class="s-meta"><span class="mono">2026-10-14 13:25</span></p>' +
    '</article>' +

    // Status line: alert severity, then incident status new / in_progress / resolved
    '<article class="s-card s-card--status" data-z="23">' +
      '<div class="s-card__head"><p class="s-card__title">Case #7, alert to resolution <span class="th" lang="th">จากแจ้งเตือนถึงได้รับความช่วยเหลือ</span></p><span class="s-tag">Sample</span></div>' +
      '<ol class="s-steps" role="list">' +
        '<li class="s-step is-done">Warning <span class="th" lang="th">เตือนภัย</span></li>' +
        '<li class="s-step is-done">New <span class="th" lang="th">ใหม่</span></li>' +
        '<li class="s-step is-current">In progress <span class="th" lang="th">กำลังดำเนินการ</span></li>' +
        '<li class="s-step">Resolved <span class="th" lang="th">แก้ไขแล้ว</span></li>' +
      '</ol>' +
      '<p class="s-meta"><span class="mono">updated 2026-10-14 13:40</span></p>' +
    '</article>' +

    // Risk score: GET /risk
    '<article class="s-card s-card--risk" data-z="33">' +
      '<div class="s-card__head"><p class="s-card__title">Model-estimated risk score <span class="th" lang="th">คะแนนความเสี่ยงที่โมเดลประเมิน</span></p><span class="s-tag">Sample</span></div>' +
      '<div class="s-figure"><span class="s-figure__num">67%</span><span class="s-level s-level--orange">Warning <span class="th" lang="th">เตือนภัย</span></span></div>' +
      '<div class="s-meter"><span style="width:67%"></span></div>' +
      '<p class="s-meta">Ayutthaya, station 39, next 24 h<br><span lang="th">พระนครศรีอยุธยา (สถานี 39) ภายใน 24 ชม.</span></p>' +
      '<p class="s-meta"><span class="mono">2026-10-14 13:20</span></p>' +
    '</article>';

  function markup() {
    var water = contour(320, 320, 300, 0.9, 0.06, 0.04);
    return '<div class="world" data-world>' +
      stratum(0, contour(300, 300, 280, 0.4, 0.07, 0.045)) +
      stratum(1, contour(306, 296, 228, 1.1, 0.07, 0.045)) +
      stratum(2, contour(312, 292, 176, 1.9, 0.07, 0.045)) +
      stratum(3, contour(318, 288, 124, 2.6, 0.07, 0.045)) +
      CARDS +
      '<div class="water" data-water><svg viewBox="0 0 640 640">' +
        '<path class="water__body" d="' + water + '"/>' +
        '<path class="water__edge" d="' + water + '"/>' +
        '<path class="water__ripple" d="' + contour(326, 316, 252, 1.4, 0.05, 0.035) + '"/>' +
        '<path class="water__ripple" d="' + contour(332, 312, 200, 2.2, 0.05, 0.03) + '"/>' +
      '</svg></div>' +
      // Staff gauge: 0 to 40 cm, zones match the district levels (5, 10, 30 cm)
      '<div class="gauge">' +
        '<div class="gauge__post"></div>' +
        '<div class="gauge__board"><svg viewBox="0 0 38 200" preserveAspectRatio="none">' +
          '<g class="gauge__zones">' +
            '<rect x="0" y="175" width="7" height="25" fill="#5FB98F"/>' +
            '<rect x="0" y="150" width="7" height="25" fill="#E2C15A"/>' +
            '<rect x="0" y="50" width="7" height="100" fill="#E0893F"/>' +
            '<rect x="0" y="0" width="7" height="50" fill="#D65A4A"/>' +
          '</g>' +
          '<g class="gauge__ticks">' + gaugeTicks() + '</g>' +
        '</svg></div>' +
        '<div class="gauge__readout" data-readout><span class="gauge__value"><span data-depth>18</span> cm <span class="th" lang="th">ซม.</span></span></div>' +
      '</div>' +
    '</div>';
  }

  /* ---------- Motion ---------- */

  var STATIC_CM = 18;      // matches the Bang Phlat sample reading
  var MID_CM = 18;
  var SWING_CM = 10;       // water drifts between 8 and 28 cm
  var PERIOD_MS = 16000;
  var TILT_X = 2;          // max parallax, degrees
  var TILT_Z = 3;

  function init(scene) {
    if (!scene) return;
    scene.innerHTML = markup();

    var world = scene.querySelector('[data-world]');
    var water = scene.querySelector('[data-water]');
    var readout = scene.querySelector('[data-readout]');
    var depthLabel = scene.querySelector('[data-depth]');
    var cards = Array.prototype.slice.call(scene.querySelectorAll('[data-z]')).map(function (el) {
      return { el: el, cm: parseFloat(el.getAttribute('data-z')), under: null };
    });

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    var base = { rx: 56, rz: -22, cm: 3.6, scale: 0.78 };
    var tilt = { x: 0, z: 0, tx: 0, tz: 0 };
    var lastDepth = null;
    var running = false;
    var visible = true;
    var rafId = 0;
    var t0 = 0;

    function readBase() {
      var cs = getComputedStyle(scene);
      base.rx = parseFloat(cs.getPropertyValue('--rx')) || 56;
      base.rz = parseFloat(cs.getPropertyValue('--rz')) || -22;
      base.scale = parseFloat(cs.getPropertyValue('--scale')) || 0.78;
      base.cm = parseFloat(cs.getPropertyValue('--cm')) || 3.6;
    }

    function setWater(cm) {
      var z = cm * base.cm;
      water.style.transform = 'translateZ(' + z.toFixed(2) + 'px)';
      readout.style.transform = 'translateY(calc(' + (-z).toFixed(2) + 'px + 50%))';

      var depth = Math.round(cm);
      if (depth !== lastDepth) {
        depthLabel.textContent = depth;
        lastDepth = depth;
      }

      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var under = c.cm < cm;
        if (under !== c.under) {
          c.el.classList.toggle('is-under', under);
          c.under = under;
        }
      }
    }

    function setTilt() {
      world.style.transform =
        'scale(' + base.scale + ') rotateX(' + (base.rx + tilt.x).toFixed(3) + 'deg) rotateZ(' +
        (base.rz + tilt.z).toFixed(3) + 'deg)';
    }

    function frame(now) {
      if (!t0) t0 = now;
      var phase = ((now - t0) % PERIOD_MS) / PERIOD_MS;
      // Starts at mid level so the first frame matches the static composition
      setWater(MID_CM + SWING_CM * Math.sin(phase * Math.PI * 2));

      // Ease toward the pointer target
      tilt.x += (tilt.tx - tilt.x) * 0.05;
      tilt.z += (tilt.tz - tilt.z) * 0.05;
      setTilt();

      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduceMotion.matches || !visible || document.hidden) return;
      running = true;
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }

    function renderStatic() {
      stop();
      tilt.x = tilt.z = tilt.tx = tilt.tz = 0;
      t0 = 0;
      readBase();
      setTilt();
      setWater(STATIC_CM);
    }

    function onPointer(e) {
      if (!finePointer.matches || reduceMotion.matches) return;
      tilt.tz = ((e.clientX / window.innerWidth) * 2 - 1) * TILT_Z;
      tilt.tx = -((e.clientY / window.innerHeight) * 2 - 1) * TILT_X;
    }

    function onMotionPref() {
      renderStatic();
      start();
    }

    // The first frame is always the fully composed static one
    renderStatic();
    start();

    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('pointerleave', function () { tilt.tx = 0; tilt.tz = 0; });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }).observe(scene);
    }

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        readBase();
        if (!running) renderStatic();
      }, 150);
    });

    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionPref);
    else if (reduceMotion.addListener) reduceMotion.addListener(onMotionPref);
  }

  GW.scene = { init: init };
})(window.GW = window.GW || {});
