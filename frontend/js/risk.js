/* GunWaree Risk prediction: the level from rule B2 (backend/risk.py) and what went into it.

   Endpoint                          Refresh      Used for
   GET /risk                         5 minutes    level, time it ran, time of the reading it used (503 = no reading
                                                  from Ayutthaya in the last 3 hours). Each call stores a row in
                                                  predictions, so it is never called faster than on Home.
   GET /stations/latest?kind=river   60 seconds   Ayutthaya reading and bank; Nakhon Sawan and Bangkok Bridge for context
   GET /admin/predictions            on load      the stored predictions, admins only

   The rule (rule_b2): critical when the river at Ayutthaya is at or over its bank; warning when it is above
   (bank - 0.30 m) and higher than 6 hours earlier; watch when above (bank - 0.30 m) but not rising, or with no
   reading 6 hours earlier to compare; none at or below that. /risk does not return the reading or the 6-hour
   change, so only the level comes from it. The reading shown comes from /stations/latest and can differ from
   the one the rule used (a newer reading, or one the spike guard set aside); both times are shown.
   risk_percent (0, 33, 67, 100) is not shown: it is the level as a number, not a probability. */

(function (GW) {
  'use strict';

  var L = GW.lang;
  var F = GW.fmt;
  var h = F.h;

  var BANK_DEFAULT = 5.06;        // BANK_DEFAULT in backend/risk.py, used when the station has no bank
  var MARGIN = 0.30;              // B2_MARGIN_M in backend/risk.py
  var RISK_MS = 5 * 60 * 1000;
  var RIVER_MS = 60 * 1000;
  var RETRY_MS = 15 * 1000;       // while the river is on sample data, try the backend again this often (not /risk)

  var ORDER = ['none', 'watch', 'warning', 'critical'];
  var TONE = { none: 'green', watch: 'yellow', warning: 'orange', critical: 'red' };
  var NEEDLE = { none: -67.5, watch: -22.5, warning: 22.5, critical: 67.5 };   // centre of each segment of the dial

  // What each of the rule's three checks answered, for each level (rule_b2 stops at the first match)
  var ANSWERS = {
    critical: ['yes', 'skip', 'skip'],
    warning: ['no', 'yes', 'yes'],
    watch: ['no', 'yes', 'noOrNone'],
    none: ['no', 'no', 'skip']
  };

  var STOPS = [
    { code: '568', name: 'rp.st568', role: 'rp.up' },
    { code: '39', name: 'rp.st39', role: 'rp.target', target: true },
    { code: '4', name: 'rp.st4', role: 'rp.down' }
  ];

  // Hours of warning before the river first reached the bank (negative = late), from model/evaluate.py
  // on the 2020 to 2025 records. Source: docs/plan.md, "ผลจริงของโมเดลและการตัดสินใจ", part 3.
  var EVENTS = [
    { from: '2025-10-04', to: '2025-10-06', bank: '2025-10-04 12:20', watch: 71.3, warning: 66.3, test: true },
    { from: '2025-11-05', to: '2025-11-23', bank: '2025-11-05 19:40', watch: 1.7, warning: -0.3, test: true },
    { from: '2021-09-30', to: '2021-11-01', bank: '2021-09-30 16:00', watch: 36.0, warning: 36.0 },
    { from: '2022-09-30', to: '2022-10-13', bank: '2022-09-30 07:10', watch: 27.2, warning: 27.2 },
    { from: '2022-10-20', to: '2022-10-28', bank: '2022-10-20 11:30', watch: -0.5, warning: -0.5 }
  ];
  var TRACK = [-6, 88];   // hours shown on the lead-time axis, with room for the labels past 72

  var ICONS = {
    yes: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 7"/></svg>',
    no: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg>',
    noOrNone: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg>',
    skip: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 10h8"/></svg>'
  };

  var data = { risk: undefined, river: undefined, log: undefined };
  var modes = {};
  var errors = {};
  var last = { risk: 0, river: 0 };
  var busy = {};
  var connecting = false;
  var shownLevel;        // the level on screen, so only a real change replays its animation
  var shownNum = {};     // numbers on screen, so they count from the old value
  var ladderKey = null;

  /* ---------- Small helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function isNum(v) { return v !== null && v !== undefined && isFinite(v); }

  // Backend time "YYYY-MM-DD HH:MM[:SS]" (Thai time) as a number, with no zone maths on either side
  function wallValue(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : NaN;
  }
  function wallString(ms) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }

  // Sample data (server unreachable) is never shown as the current level
  function currentLevel() {
    var r = data.risk;
    return r && modes.risk !== 'sample' && TONE[r.level] ? r.level : null;
  }

  function findStation(code) {
    var list = data.river || [];
    for (var i = 0; i < list.length; i++) if (String(list[i].code) === code) return list[i];
    return null;
  }

  // The Ayutthaya numbers the rule works with
  function ayutthaya() {
    var st = findStation('39');
    var bank = st && isNum(st.bank) && st.bank > 0 ? st.bank : BANK_DEFAULT;
    return { st: st, wl: st && isNum(st.water_level) ? st.water_level : null, bank: bank, watch: bank - MARGIN };
  }

  // Older than 3 hours, against the current time: the same check everywhere (js/api.js)
  function isStale(s) { return GW.isStale(s); }

  function onSample() {
    return Object.keys(modes).some(function (k) { return modes[k] === 'sample'; });
  }

  /* ---------- The dial and the headline ---------- */

  function fact(dl, label, value, attr) {
    var row = h('div', 'rstage__fact');
    row.appendChild(h('dt', null, label));
    var dd = h('dd', null, value);
    if (attr) dd.setAttribute(attr, '');
    row.appendChild(dd);
    dl.appendChild(row);
  }

  function renderStage() {
    var r = data.risk;
    var loading = r === undefined && !errors.risk;
    var level = currentLevel();
    var stage = $('[data-rstage]');
    stage.setAttribute('data-tone', level ? TONE[level] : 'grey');

    $('[data-needle]').style.transform = 'rotate(' + (level ? NEEDLE[level] : -90) + 'deg)';
    document.querySelectorAll('[data-seg]').forEach(function (seg) {
      seg.classList.toggle('is-on', seg.getAttribute('data-seg') === level);
    });

    var sample = !!r && modes.risk === 'sample';
    var lv = $('[data-rlevel]');
    lv.textContent = loading ? L.t('rp.loading') : level ? F.levelLabel(level) :
      sample ? L.t('sample.level', { level: F.levelLabel(r.level) }) : (r === null ? L.t('risk.nodata') : L.t('error.card'));
    var tag = $('[data-rsample]');
    if (!tag) {
      tag = h('p', 'sample-tag', '');
      tag.setAttribute('data-rsample', '');
      lv.parentNode.insertBefore(tag, lv);
    }
    tag.textContent = L.t('sample.badge');
    tag.hidden = !sample;
    lv.classList.toggle('is-msg', !level);
    if (!loading && level !== shownLevel) {
      F.replay(lv, 'is-flip', 900);
      F.replay(stage, 'is-shock', 1200);
      shownLevel = level;
    }
    $('[data-rdesc]').textContent = level ? L.t('risk.desc.' + level) : sample ? L.t('sample.notCurrent') : (r === null ? L.t('rp.whyNoData') : '');

    var dl = $('[data-rfacts]');
    dl.textContent = '';
    fact(dl, L.t('rp.f.where'), L.t('risk.target'));
    if (r && !sample) {
      var until = wallValue(r.created_at) + (r.horizon_hours || 24) * 3600000;
      if (isFinite(until)) fact(dl, L.t('rp.f.until'), F.time(wallString(until)));
      fact(dl, L.t('rp.f.ran'), F.time(r.created_at) || '–');
      fact(dl, L.t('rp.f.reading'), F.time(r.inputs_measured_at) || '–');
    }
    fact(dl, L.t('rp.f.next'), '', 'data-next');
    tick();
  }

  // Countdown to the next GET /risk
  function tick() {
    var el = $('[data-next]');
    if (!el) return;
    if (!last.risk || busy.risk) { el.textContent = L.t('rp.loading'); return; }
    var left = Math.max(0, last.risk + RISK_MS - Date.now());
    var m = Math.floor(left / 60000);
    var s = Math.floor((left % 60000) / 1000);
    el.textContent = L.t('rp.in', { t: m + ':' + (s < 10 ? '0' : '') + s });
  }

  /* ---------- The river at Ayutthaya in 3D ----------
     A cross-section of the channel cut into paper layers along the river, water filling it to the reading,
     and two glass sheets at the watch line and the bank. It sways on its own, turns with the pointer
     and its layers spread apart while the pointer is over it. */

  var DW = 360, DH = 230, DD = 180, SLICES = 6;
  var X1 = 62, X2 = 128, X3 = 232, X4 = 298;   // bank edge, foot of the slope, foot of the far slope, far bank edge
  var BED = DH - 18;
  var dio = null;

  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var out = [16, 8, 0].map(function (sh) {
      var ca = (pa >> sh) & 255, cb = (pb >> sh) & 255;
      return Math.round(ca + (cb - ca) * t);
    });
    return 'rgb(' + out.join(',') + ')';
  }

  function buildDio() {
    var el = $('[data-dio]');
    el.textContent = '';
    var sway = h('div', 'dio__sway');
    var cam = h('div', 'dio__cam');
    var world = h('div', 'dio__world');
    sway.appendChild(cam);
    cam.appendChild(world);
    el.appendChild(sway);

    world.appendChild(h('div', 'dio__shadow'));
    var slices = [];
    for (var k = 0; k < SLICES; k++) {
      var t = k / (SLICES - 1);   // 0 = the back layer, 1 = the front
      var slice = h('div', 'dio__slice' + (k === SLICES - 1 ? ' dio__slice--front' : ''));
      slice.style.setProperty('--k', ((t - 0.5) * (SLICES - 1)).toFixed(2));
      slice.innerHTML =
        '<svg viewBox="0 0 ' + DW + ' ' + DH + '" width="' + DW + '" height="' + DH + '">' +
        '<rect class="dio__water" x="0" y="0" width="' + DW + '" height="' + DH + '"/>' +
        '<path class="dio__ground" fill="' + mix('#4B4636', '#B8996A', t) + '" stroke="' + mix('#3A3629', '#8E7550', t) + '"/>' +
        (k === SLICES - 1 ? '<path class="dio__strata"/>' : '') +
        '<path class="dio__grass" stroke="' + mix('#2F5A41', '#7DBE7A', t) + '"/>' +
        '</svg>';
      world.appendChild(slice);
      slices.push(slice);
    }
    var surface = h('div', 'dio__surface');
    var watch = h('div', 'dio__plane dio__plane--watch');
    var bank = h('div', 'dio__plane dio__plane--bank');
    world.appendChild(surface);
    world.appendChild(watch);
    world.appendChild(bank);
    var tags = { watch: h('span', 'dio__tag dio__tag--watch'), bank: h('span', 'dio__tag dio__tag--bank'), now: h('span', 'dio__tag dio__tag--now') };
    Object.keys(tags).forEach(function (k) { world.appendChild(tags[k]); });

    dio = {
      el: el, slices: slices, surface: surface, planes: { watch: watch, bank: bank }, tags: tags,
      waters: slices.map(function (s) { return s.querySelector('.dio__water'); }),
      lastY: null
    };

    // Turn with the pointer (or a finger dragging sideways); let go and it eases back to its resting angle
    function aim(e) {
      if (F.reduceMotion() || (e.pointerType === 'touch' && !e.buttons)) return;
      var r = el.getBoundingClientRect();
      var nx = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1));
      var ny = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1));
      el.style.setProperty('--ry', (-30 + nx * 18).toFixed(1) + 'deg');
      el.style.setProperty('--rx', (-14 - ny * 12).toFixed(1) + 'deg');
      el.classList.add('is-aiming');
    }
    function rest() {
      el.style.removeProperty('--ry');
      el.style.removeProperty('--rx');
      el.classList.remove('is-aiming');
    }
    el.addEventListener('pointermove', aim);
    el.addEventListener('pointerdown', aim);
    el.addEventListener('pointerleave', rest);
    el.addEventListener('pointercancel', rest);
    el.addEventListener('pointerup', function (e) { if (e.pointerType === 'touch') rest(); });
  }

  // Height of the scene in metres, and where a level sits on it (pixels from the top)
  function geometry(a) {
    var lo = a.bank - 3.2;
    var hi = a.bank + 0.9;
    if (a.wl !== null) { lo = Math.min(lo, a.wl - 0.6); hi = Math.max(hi, a.wl + 0.4); }
    function y(v) { return DH - (v - lo) / (hi - lo) * DH; }
    return { y: y, bank: y(a.bank), watch: y(a.watch), water: a.wl === null ? null : y(a.wl) };
  }

  // Where the water surface meets the two slopes at height y (the whole width once it is over the banks)
  function channelAt(y, yBank) {
    if (y <= yBank) return [0, DW];
    var t = Math.min(1, (y - yBank) / (BED - yBank));
    return [X1 + t * (X2 - X1), X4 - t * (X4 - X3)];
  }

  function place(el, x, y, z) {
    el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + z + 'px) ' +
      'rotateY(calc(var(--ry, -30deg) * -1)) rotateX(calc(var(--rx, -14deg) * -1)) translate(-50%, -50%)';
  }

  function renderDio() {
    if (!dio) buildDio();
    var a = ayutthaya();
    var g = geometry(a);
    var yB = g.bank.toFixed(1);

    var ground = 'M-2 ' + yB + 'H' + X1 + 'L' + X2 + ' ' + BED + 'H' + X3 + 'L' + X4 + ' ' + yB + 'H' + (DW + 2) + 'V' + (DH + 2) + 'H-2Z';
    var grass = 'M-2 ' + yB + 'H' + X1 + 'M' + X4 + ' ' + yB + 'H' + (DW + 2);
    var strata = '';
    [0.32, 0.58, 0.8].forEach(function (f) {
      var yy = (g.bank + (DH - g.bank) * f).toFixed(1);
      if (+yy > BED + 2) strata += 'M0 ' + yy + 'H' + DW;
      else strata += 'M0 ' + yy + 'H' + (X1 + (X2 - X1) * Math.max(0, (yy - g.bank) / (BED - g.bank))).toFixed(1) +
        'M' + (X4 - (X4 - X3) * Math.max(0, (yy - g.bank) / (BED - g.bank))).toFixed(1) + ' ' + yy + 'H' + DW;
    });
    dio.slices.forEach(function (s) {
      s.querySelector('.dio__ground').setAttribute('d', ground);
      s.querySelector('.dio__grass').setAttribute('d', grass);
      var st = s.querySelector('.dio__strata');
      if (st) st.setAttribute('d', strata);
    });

    // The water rises from the river bed to the reading the first time, then glides to each new reading
    var target = g.water === null ? DH : g.water;
    function setWater(y) {
      dio.waters.forEach(function (w) { w.style.transform = 'translateY(' + y.toFixed(1) + 'px)'; });
      var span = channelAt(y, g.bank);
      dio.surface.style.width = (span[1] - span[0]).toFixed(1) + 'px';
      dio.surface.style.transform = 'translate3d(' + span[0].toFixed(1) + 'px,' + (y - DD / 2).toFixed(1) + 'px,0) rotateX(90deg)';
    }
    dio.surface.classList.toggle('is-empty', g.water === null);
    if (dio.lastY === null && g.water !== null && !F.reduceMotion()) {
      dio.el.classList.add('is-still');
      setWater(BED);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { dio.el.classList.remove('is-still'); setWater(target); });
      });
    } else {
      setWater(target);
    }
    if (g.water !== null) dio.lastY = target;

    var PD = DD + 24;
    dio.planes.watch.style.transform = 'translate3d(0,' + (g.watch - PD / 2).toFixed(1) + 'px,0) rotateX(90deg)';
    dio.planes.bank.style.transform = 'translate3d(0,' + (g.bank - PD / 2).toFixed(1) + 'px,0) rotateX(90deg)';

    dio.tags.bank.textContent = L.t('rp.d.bank', { v: F.num(a.bank, 2) });
    dio.tags.watch.textContent = L.t('rp.d.watch', { v: F.num(a.watch, 2) });
    dio.tags.now.textContent = a.wl === null ? L.t('rp.d.none') : isStale(a.st.measured_at)
      ? GW.staleText(a.st.measured_at, 'stale.latest') + ' · ' + F.num(a.wl, 2) + (L.get() === 'th' ? ' ม.' : ' m')
      : L.t('rp.d.now', { v: F.num(a.wl, 2) });
    place(dio.tags.bank, DW - 34, g.bank - 15, DD / 2);
    place(dio.tags.watch, 46, g.watch - 15, DD / 2);
    place(dio.tags.now, DW / 2, (g.water === null ? BED : g.water) + 20, DD / 2 + 6);

    $('[data-dio-text]').textContent = a.wl === null ? '' :
      L.t('rp.d.alt', { wl: F.num(a.wl, 2), watch: F.num(a.watch, 2), bank: F.num(a.bank, 2) });
  }

  /* ---------- The rule as a ladder, and why this step ---------- */

  function renderLadder() {
    var a = ayutthaya();
    var level = currentLevel();
    var loading = data.risk === undefined && !errors.risk;
    var key = [level, a.bank, L.get(), loading, data.risk === null].join('|');
    if (key === ladderKey) return;
    ladderKey = key;
    var vars = { bank: F.num(a.bank, 2), watch: F.num(a.watch, 2) };

    var ol = $('[data-rladder]');
    ol.textContent = '';
    ORDER.slice().reverse().forEach(function (lv, j) {
      var li = h('li', 'rstep');
      li.setAttribute('data-level', lv);
      li.style.setProperty('--j', j);
      li.appendChild(h('span', 'rstep__dot'));
      var body = h('div', 'rstep__body');
      body.appendChild(h('p', 'rstep__name', F.levelLabel(lv)));
      body.appendChild(h('p', 'rstep__cond', L.t('rp.cond.' + lv, vars)));
      li.appendChild(body);
      if (lv === level) {
        li.classList.add('is-current');
        li.setAttribute('aria-current', 'true');
        li.appendChild(h('span', 'rstep__now', L.t('rp.now')));
        F.replay(li, 'is-arrive', 900);
      }
      ol.appendChild(li);
    });

    var box = $('[data-rwhy]');
    box.textContent = '';
    box.setAttribute('data-tone', level ? TONE[level] : 'grey');
    if (!level) {
      box.appendChild(h('p', 'rwhy__empty', loading ? L.t('rp.loading') : data.risk === null ? L.t('rp.whyNoData') : L.t('error.card')));
      return;
    }
    box.appendChild(h('p', 'rwhy__title', L.t('rp.whyTitle', { level: F.levelLabel(level) })));
    var checks = h('ol', 'rwhy__checks');
    checks.setAttribute('role', 'list');
    var answers = ANSWERS[level];
    // The check that settled it: the last one that was actually asked
    var decider = answers.lastIndexOf('skip') === -1 ? 2 : answers.indexOf('skip') - 1;
    ['bank', 'watch', 'rise'].forEach(function (q, i) {
      var ans = answers[i];
      var li = h('li', 'rcheck rcheck--' + ans + (i === decider ? ' is-decider' : ''));
      li.style.setProperty('--j', i);
      li.insertAdjacentHTML('afterbegin', ICONS[ans]);
      li.appendChild(h('span', 'rcheck__q', L.t('rp.q.' + q, vars)));
      li.appendChild(h('span', 'rcheck__a', L.t('rp.a.' + ans)));
      checks.appendChild(li);
    });
    box.appendChild(checks);
    box.appendChild(h('p', 'rwhy__note', L.t('rp.watchLine')));
  }

  /* ---------- What the rule looked at ---------- */

  function tile(dl, key, label, value, unit, cls) {
    var row = h('div', 'rin__tile' + (cls ? ' ' + cls : ''));
    row.appendChild(h('dt', null, label));
    var dd = h('dd');
    var num = h('span', 'rin__num');
    dd.appendChild(num);
    if (unit) dd.appendChild(h('span', 'rin__unit', unit));
    row.appendChild(dd);
    dl.appendChild(row);
    if (isNum(value)) {
      F.countUp(num, value, 2, isNum(shownNum[key]) ? shownNum[key] : value - 0.6, 900);
      shownNum[key] = value;
    } else {
      num.textContent = value;
    }
  }

  function renderInputs() {
    var box = $('[data-rinputs]');
    if (data.river === undefined && !errors.river) return;
    box.textContent = '';
    if (!data.river) { box.appendChild(h('p', 'card__error', L.t('error.card'))); return; }

    var a = ayutthaya();
    var m = L.get() === 'th' ? 'ม.' : 'm';
    var dl = h('dl', 'rin');
    tile(dl, 'wl', L.t('rp.in.level'), a.wl === null ? L.t('status.awaiting') : a.wl, a.wl === null ? '' : m, 'rin__tile--main');
    tile(dl, 'bank', L.t('rp.in.bank'), a.bank, m);
    tile(dl, 'watch', L.t('rp.in.watch'), a.watch, m);
    var gapText = '–';
    var gapCls = '';
    if (a.wl !== null) {
      var gap = a.bank - a.wl;
      gapText = gap > 0 ? L.t('rp.in.below', { d: F.num(gap, 2) }) : L.t('rp.in.over', { d: F.num(-gap, 2) });
      gapCls = gap <= 0 ? 'lv-red' : a.wl > a.watch ? 'lv-orange' : 'lv-green';
    }
    tile(dl, 'gap', L.t('rp.in.gap'), gapText, '', 'rin__tile--gap ' + gapCls);
    box.appendChild(dl);

    // A ruler from 2 m under the bank to just over it: the watch band, the bank, and the water on it
    var lo = Math.min(a.bank - 2, a.wl === null ? Infinity : a.wl - 0.2);
    var hi = Math.max(a.bank + 0.5, a.wl === null ? -Infinity : a.wl + 0.2);
    function pos(v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); }
    var meter = h('div', 'rmeter');
    meter.setAttribute('aria-hidden', 'true');
    var near = h('span', 'rmeter__zone rmeter__zone--near');
    near.style.left = pos(a.watch) + '%';
    near.style.width = (pos(a.bank) - pos(a.watch)) + '%';
    var over = h('span', 'rmeter__zone rmeter__zone--over');
    over.style.left = pos(a.bank) + '%';
    over.style.right = '0';
    meter.appendChild(near);
    meter.appendChild(over);
    [['watch', a.watch, L.t('rp.in.watch')], ['bank', a.bank, L.t('rp.in.bank')]].forEach(function (mk) {
      var mark = h('span', 'rmeter__mark rmeter__mark--' + mk[0]);
      mark.style.left = pos(mk[1]) + '%';
      mark.appendChild(h('span', 'rmeter__label', mk[2]));
      meter.appendChild(mark);
    });
    if (a.wl !== null) {
      var dot = h('span', 'rmeter__water');
      var to = pos(a.wl);
      var from = isNum(shownNum.meter) ? shownNum.meter : 0;
      dot.style.left = from + '%';
      meter.appendChild(dot);
      requestAnimationFrame(function () { requestAnimationFrame(function () { dot.style.left = to + '%'; }); });
      shownNum.meter = to;
    }
    box.appendChild(meter);

    var level = currentLevel();
    var trend = h('div', 'rin__trend');
    trend.appendChild(h('p', 'rin__trendLabel', L.t('rp.in.trend')));
    var tk = !level ? 'unknown' : level === 'warning' ? 'warning' : level === 'watch' ? 'watch' : 'other';
    trend.appendChild(h('p', 'rin__trendValue' + (tk === 'warning' ? ' is-rising' : ''), L.t('rp.trend.' + tk)));
    if (level) trend.appendChild(h('p', 'rin__note', L.t('rp.trendNote')));
    box.appendChild(trend);

    if (a.st) {
      var foot = h('p', 'rin__foot card__time');
      var text = F.updated(a.st.measured_at);
      var r = data.risk;
      if (r && r.inputs_measured_at) {
        var same = String(r.inputs_measured_at).slice(0, 16) === String(a.st.measured_at || '').slice(0, 16);
        text += '. ' + (same ? L.t('rp.same') : L.t('rp.diff', { time: F.time(r.inputs_measured_at) }));
      }
      if (isStale(a.st.measured_at)) text += ' ' + L.t('rp.stale') + '.';
      foot.textContent = text;
      box.appendChild(foot);
    }
  }

  /* ---------- Along the river ---------- */

  function renderRiver() {
    var ol = $('[data-rline]');
    if (data.river === undefined && !errors.river) return;
    ol.textContent = '';
    if (!data.river) { ol.appendChild(h('li', 'card__error', L.t('error.card'))); return; }

    STOPS.forEach(function (stop, j) {
      var st = findStation(stop.code);
      var li = h('li', 'rstop' + (stop.target ? ' rstop--target' : ''));
      li.style.setProperty('--j', j);
      var dot = h('span', 'rstop__dot');
      dot.setAttribute('aria-hidden', 'true');
      li.appendChild(dot);
      li.appendChild(h('p', 'rstop__role', L.t(stop.role)));
      li.appendChild(h('p', 'rstop__name', L.t(stop.name)));

      if (!st || !isNum(st.water_level)) {
        li.appendChild(h('p', 'rstop__val rstop__val--none', L.t('status.awaiting')));
        li.classList.add('is-none');
      } else {
        var row = h('p', 'rstop__val');
        row.appendChild(h('span', 'rstop__num', L.t('rp.readingOnly', { wl: F.num(st.water_level, 2) })));
        if (isNum(st.bank) && st.bank > 0) {
          var gap = st.bank - st.water_level;
          row.appendChild(h('span', 'rstop__gap ' + (gap <= 0 ? 'lv-red' : 'lv-green'),
            gap > 0 ? L.t('water.toBank', { d: F.num(gap, 2) }) : L.t('water.overBank', { d: F.num(-gap, 2) })));
          if (gap <= 0) li.classList.add('is-over');
          // How full the channel is, measured over the 3 m under the bank
          var bar = h('span', 'rstop__bar');
          bar.setAttribute('aria-hidden', 'true');
          var fill = h('span', 'rstop__fill');
          fill.style.setProperty('--f', Math.max(0.04, Math.min(1, 1 - gap / 3)).toFixed(3));
          bar.appendChild(fill);
          bar.appendChild(h('span', 'rstop__bankmark'));
          li.appendChild(row);
          li.appendChild(bar);
        } else {
          row.appendChild(h('span', 'rstop__gap', L.t('water.noBank')));
          li.appendChild(row);
        }
        var stale = isStale(st.measured_at);
        li.appendChild(h('p', 'rstop__time card__time' + (stale ? ' stale-tag' : ''), stale ? GW.staleText(st.measured_at) : F.updated(st.measured_at)));
        if (stale) li.classList.add('is-stale');
      }
      ol.appendChild(li);
    });
    // The bars fill on the next frame, so they always grow in
    requestAnimationFrame(function () { requestAnimationFrame(function () { ol.classList.add('is-filled'); }); });
  }

  /* ---------- Past floods ---------- */

  function dateRange(a, b) {
    var fmt = new Intl.DateTimeFormat(F.locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    var d1 = new Date(wallValue(a));
    var d2 = new Date(wallValue(b));
    return fmt.formatRange ? fmt.formatRange(d1, d2) : fmt.format(d1) + ' – ' + fmt.format(d2);
  }

  function renderTrack() {
    var ol = $('[data-rtrack-list]');
    var span = TRACK[1] - TRACK[0];
    var zero = -TRACK[0] / span * 100;
    var panel = $('[data-rtrack]');
    panel.style.setProperty('--zero', zero.toFixed(2) + '%');
    ol.textContent = '';
    EVENTS.forEach(function (ev, i) {
      var li = h('li', 'rev');
      var head = h('div', 'rev__head');
      head.appendChild(h('p', 'rev__name', dateRange(ev.from, ev.to)));
      head.appendChild(h('p', 'rev__meta', L.t('rp.atBank', { time: F.time(ev.bank) })));
      head.appendChild(h('span', 'rev__tag' + (ev.test ? ' is-test' : ''), L.t(ev.test ? 'rp.tag.test' : 'rp.tag.tune')));
      li.appendChild(head);
      var bars = h('div', 'rev__bars');
      ['watch', 'warning'].forEach(function (k, b) {
        var v = ev[k];
        // A long bar carries its label inside, so it never runs past the card on a phone
        var bar = h('div', 'rbar rbar--' + k + (v < 0 ? ' is-late' : '') + (v > 48 ? ' is-long' : ''));
        bar.style.setProperty('--w', (Math.abs(v) / span * 100).toFixed(2) + '%');
        bar.style.setProperty('--j', i * 2 + b);
        bar.appendChild(h('span', 'rbar__fill'));
        var val = h('span', 'rbar__val');
        val.appendChild(h('span', 'visually-hidden', L.t('rp.k.' + k) + ': '));
        val.appendChild(document.createTextNode(v < 0 ? L.t('rp.late', { h: F.num(-v, 1) }) : L.t('rp.early', { h: F.num(v, 1) })));
        bar.appendChild(val);
        bars.appendChild(bar);
      });
      li.appendChild(bars);
      ol.appendChild(li);
    });

    var axis = $('[data-rtrack-axis]');
    axis.textContent = '';
    [0, 24, 48, 72].forEach(function (hr) {
      var t = h('span', 'rtrack__tick', L.t('rp.hours', { h: hr }));
      t.style.left = ((hr - TRACK[0]) / span * 100).toFixed(2) + '%';
      axis.appendChild(t);
    });
  }

  // The bars grow once the panel scrolls into view
  function watchTrack() {
    var panel = $('[data-rtrack]');
    if (!('IntersectionObserver' in window) || F.reduceMotion()) { panel.classList.add('is-shown'); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        panel.classList.add('is-shown');
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(panel);
  }

  /* ---------- Stored predictions (admins) ---------- */

  function isAdmin() {
    var s = GW.session.get();
    return !!(s && s.role === 'admin');
  }

  function loadLog() {
    if (!isAdmin()) { data.log = undefined; renderLog(); return; }
    GW.request('/admin/predictions', { redirectOn401: false }).then(function (list) {
      data.log = Array.isArray(list) ? list : [];
    }, function () {
      data.log = null;
    }).then(renderLog);
  }

  function renderLog() {
    var sec = $('[data-rlog]');
    sec.hidden = !isAdmin() || data.log === undefined;
    if (sec.hidden) return;
    var body = $('[data-rlog-body]');
    body.textContent = '';
    if (data.log === null) { body.appendChild(h('p', 'card__error', L.t('rp.logError'))); return; }
    if (!data.log.length) { body.appendChild(h('p', 'panel__sub', L.t('rp.logEmpty'))); return; }

    var rows = data.log.slice(0, 96).reverse();   // the server sends the newest first
    var strip = h('div', 'rlog__strip');
    strip.setAttribute('role', 'img');
    var counts = {};
    rows.forEach(function (p, j) {
      var lv = TONE[p.level] ? p.level : null;
      counts[lv || 'nodata'] = (counts[lv || 'nodata'] || 0) + 1;
      var b = h('span', 'rlog__bar rlog__bar--' + (lv ? TONE[lv] : 'grey'));
      b.style.setProperty('--s', lv ? ORDER.indexOf(lv) + 1 : 0.5);
      b.style.setProperty('--j', j);
      b.title = (F.time(p.created_at) || '') + ', ' + (lv ? F.levelLabel(lv) : L.t('risk.nodata'));
      strip.appendChild(b);
    });
    strip.setAttribute('aria-label', ORDER.concat(['nodata']).filter(function (lv) { return counts[lv]; })
      .map(function (lv) { return F.levelLabel(lv) + ' ' + counts[lv]; }).join(', '));
    body.appendChild(strip);

    var chips = h('ul', 'rlog__counts');
    chips.setAttribute('role', 'list');
    ORDER.slice().reverse().forEach(function (lv) {
      var li = h('li', 'pill lv-' + TONE[lv], F.levelLabel(lv) + ' ' + (counts[lv] || 0));
      chips.appendChild(li);
    });
    body.appendChild(chips);
    var outcomes = rows.filter(function (p) { return p.actual_outcome !== null && p.actual_outcome !== undefined; }).length;
    body.appendChild(h('p', 'card__time rlog__range', L.t('rp.logRange', {
      n: rows.length, from: F.time(rows[0].created_at) || '–', to: F.time(rows[rows.length - 1].created_at) || '–'
    }) + '. ' + L.t('rp.logOutcome', { n: outcomes })));
  }

  /* ---------- Status ---------- */

  function renderStatus() {
    var el = $('[data-status]');
    var vals = Object.keys(modes).map(function (k) { return modes[k]; });
    var sim = (data.river || []).some(function (s) { return s.source === 'sim'; });
    var mode, text;
    if (vals.indexOf('sample') >= 0) { mode = 'sample'; text = L.t('status.sample'); }
    else if (sim) { mode = 'sim'; text = L.t('status.sim'); }
    else if (vals.length) { mode = 'live'; text = L.t('status.live'); }
    else if (connecting) { mode = 'connecting'; text = L.t('status.connecting'); }
    else { el.textContent = ''; return; }
    el.setAttribute('data-mode', mode);
    el.textContent = text;
    if (mode === 'sample') el.title = L.t('status.sampleHint'); else el.removeAttribute('title');
  }

  function renderAll() {
    renderStage();
    renderDio();
    renderLadder();
    renderInputs();
    renderRiver();
    renderStatus();
  }

  /* ---------- Loading ---------- */

  function onSlow() {
    if (connecting) return;
    connecting = true;
    renderStatus();
  }

  function loadRisk() {
    busy.risk = true;
    tick();
    var at = Date.now();
    return GW.loadRisk({ onSlow: onSlow }).then(function (res) {
      at = res.at;
      data.risk = res.data;
      modes.risk = res.mode;
      errors.risk = null;
      if (res.mode === 'live') GW.pulse();
    }, function (err) {
      if (err.at) at = err.at;
      if (err.status === 503) {
        data.risk = null;          // the backend answered: no recent reading to assess
        modes.risk = 'live';
        errors.risk = null;
      } else {
        errors.risk = err;
      }
    }).then(function () {
      busy.risk = false;
      last.risk = at;   // when the answer was fetched, maybe on another page: the next one is 5 minutes after it
      renderAll();
    });
  }

  // While someone is reading the inputs or the river (pointer over a [data-hold] section), a refresh waits
  // and runs as soon as they move away. The first load always runs.
  var pendingRiver = false;
  if (GW.hold) GW.hold.onRelease(function () {
    if (!pendingRiver) return;
    pendingRiver = false;
    loadRiver();
  });

  function loadRiver() {
    if (data.river !== undefined && GW.hold && GW.hold.active()) {
      pendingRiver = true;
      last.river = Date.now();
      GW.hold.deferred();
      return;
    }
    busy.river = true;
    GW.load('/stations/latest?kind=river', 'stations-river.json', { auth: false, onSlow: onSlow }).then(function (res) {
      data.river = res.data || [];
      modes.river = res.mode;
      errors.river = null;
      if (res.mode === 'live') GW.pulse();
    }, function (err) {
      errors.river = err;
    }).then(function () {
      busy.river = false;
      last.river = Date.now();
      renderAll();
    });
  }

  // One clock: the countdown every second, and each endpoint again once it is due (only while the tab is visible)
  // /risk keeps its 5-minute round even on sample data (GW.loadRisk); the river retries sooner
  function due(key, ms) {
    return !busy[key] && Date.now() - last[key] >= (key !== 'risk' && onSample() ? Math.min(ms, RETRY_MS) : ms);
  }
  setInterval(function () {
    tick();
    if (document.hidden) return;
    if (due('risk', RISK_MS)) loadRisk();
    if (due('river', RIVER_MS) && !pendingRiver) loadRiver();
  }, 1000);

  document.addEventListener('gw:lang', function () {
    renderAll();
    renderTrack();
    renderLog();
  });
  document.addEventListener('gw:session', loadLog);

  renderTrack();
  watchTrack();
  renderAll();
  loadRisk();
  loadRiver();
  loadLog();
})(window.GW = window.GW || {});
