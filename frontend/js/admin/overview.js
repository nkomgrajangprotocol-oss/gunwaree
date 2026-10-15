/* Admin: Dashboard (admin.html, situation overview).

   Endpoint                                          Refresh     Used for
   GET /risk                                         5 minutes   the level from rule B2 (each call stores a prediction row)
   GET /stations/latest?kind=river                   60 seconds  Ayutthaya water level and bank
   GET /stations/history?kind=river&code=39&hours=24 5 minutes   the chart and the 6-hour change (needs the backend from
                                                                 16 Oct; an older backend answers 404 and the chart says so)
   GET /stations/latest?kind=rain                    5 minutes   highest 24-hour rainfall in Bangkok
   GET /dams/latest                                  30 minutes  storage in the 4 upstream dams
   GET /admin/affected-areas                         60 seconds  map and list of districts with road flooding
   Waiting alerts, new reports and the pump come from the shell (GW.admin.counts).

   There is no forecast: the level comes from rule B2 on the latest reading, so the chart shows readings only. */

(function (GW) {
  'use strict';

  var A = GW.admin;
  var L = GW.lang;
  var h = A.h;
  var $ = A.$;

  var STATION = '39';
  var BANK_DEFAULT = 5.06;    // BANK_DEFAULT in backend/risk.py
  var MARGIN = 0.30;          // B2_MARGIN_M in backend/risk.py
  var RISK_ORDER = ['critical', 'warning', 'watch', 'none'];
  var AREA_ORDER = { danger: 0, high: 1, medium: 2, safe: 3 };
  var AREAS_SHOWN = 6;

  var data = { risk: undefined, river: undefined, history: undefined, rain: undefined, dams: undefined, areas: undefined };
  var errors = {};
  var showAllAreas = false;

  function isNum(v) { return v !== null && v !== undefined && isFinite(v); }
  function m() { return L.get() === 'th' ? 'ม.' : 'm'; }

  function findStation(list, code) {
    for (var i = 0; list && i < list.length; i++) if (String(list[i].code) === code) return list[i];
    return null;
  }

  function ayutthaya() {
    var st = findStation(data.river, STATION);
    var bank = st && isNum(st.bank) && st.bank > 0 ? st.bank :
      data.history && isNum(data.history.bank) ? data.history.bank : BANK_DEFAULT;
    return { st: st, wl: st && isNum(st.water_level) ? st.water_level : null, bank: bank, watch: bank - MARGIN };
  }

  /* ---------- Readings for the chart ----------
     The same check as the guard in backend/risk.py: a reading more than 1 m away from the median of up to 4
     readings before it (within 6 hours, at least 3 needed) is an odd jump. It is drawn as a hollow dot, not joined. */

  function series() {
    var rows = (data.history && data.history.readings) || [];
    var pts = [];
    rows.forEach(function (r) {
      var t = A.wallValue(r.measured_at);
      if (isNum(r.water_level) && isFinite(t)) pts.push({ t: t, v: r.water_level, at: r.measured_at });
    });
    var good = [];
    pts.forEach(function (p) {
      var prev = [];
      for (var i = good.length - 1; i >= 0 && prev.length < 4; i--) {
        if (p.t - good[i].t > 6 * 3600000) break;
        prev.push(good[i].v);
      }
      if (prev.length >= 3) {
        prev.sort(function (a, b) { return a - b; });
        var mid = prev.length % 2 ? prev[(prev.length - 1) / 2] : (prev[prev.length / 2 - 1] + prev[prev.length / 2]) / 2;
        if (Math.abs(p.v - mid) > 1) { p.odd = true; return; }
      }
      good.push(p);
    });
    return pts;
  }

  // Change over the last 6 hours: newest good reading against the good reading nearest to 6 hours before it.
  // No trend from old data: when the newest reading is older than 3 hours (GW.isStale) the answer is 'stale'.
  function change6h(pts) {
    var good = pts.filter(function (p) { return !p.odd; });
    if (good.length && GW.isStale(good[good.length - 1].at)) return 'stale';
    if (good.length < 2) return null;
    var last = good[good.length - 1];
    var target = last.t - 6 * 3600000;
    var best = null;
    good.forEach(function (p) {
      if (Math.abs(p.t - target) <= 3600000 && (!best || Math.abs(p.t - target) < Math.abs(best.t - target))) best = p;
    });
    return best ? last.v - best.v : null;
  }

  /* ---------- Stat cards ---------- */

  function stat(key, value, unit, note, tone) {
    var card = $('[data-ov="' + key + '"]');
    var v = $('[data-value]', card);
    v.textContent = '';
    if (value === null) {
      v.appendChild(h('span', 'stat__wait', L.t('status.awaiting')));
    } else {
      v.appendChild(h('span', 'stat__num', value));
      if (unit) v.appendChild(h('span', 'stat__unit', unit));
    }
    var n = $('[data-note]', card);
    n.textContent = '';
    (Array.isArray(note) ? note : [note]).forEach(function (line, i) {
      if (!line) return;
      var span = typeof line === 'string' ? A.text('span', i === 0 && tone ? 'lv-' + tone : null, line) : line;
      n.appendChild(span);
    });
  }

  function renderLevel() {
    if (data.river === undefined && !errors.river) return;
    var a = ayutthaya();
    if (!data.river) { stat('level', null, '', L.t('error.card')); return; }
    if (a.wl === null) { stat('level', null, '', L.t('ad.ov.ayutthaya')); return; }
    var d = change6h(series());
    var lines = [];
    var tone = null;
    if (a.st && GW.isStale(a.st.measured_at)) lines.push(A.text('span', 'lv-orange', GW.staleText(a.st.measured_at)));
    if (d === 'stale') {
      lines.push(L.t('stale.noTrend'));
    } else if (d !== null) {
      var sign = d > 0.005 ? '+' : d < -0.005 ? '−' : '±';
      lines.push(L.t('ad.ov.change', { d: sign + A.num(Math.abs(d), 2) }));
      tone = d > 0.005 ? 'orange' : null;
    }
    var gap = a.bank - a.wl;
    lines.push(L.t('ad.ov.ayutthaya') + ' · ' + (gap > 0 ? L.t('ad.ov.below', { d: A.num(gap, 2) }) : L.t('ad.ov.over', { d: A.num(-gap, 2) })));
    stat('level', A.num(a.wl, 2), m(), lines, tone);
  }

  function renderRain() {
    if (data.rain === undefined && !errors.rain) return;
    if (!data.rain) { stat('rain', null, '', L.t('error.card')); return; }
    var rep = data.rain.filter(function (s) { return isNum(s.rain_24h); });
    if (!rep.length) { stat('rain', null, '', L.t('ad.ov.rainNone')); return; }
    var top = rep.reduce(function (a, b) { return b.rain_24h > a.rain_24h ? b : a; });
    var tone = top.rain_24h > 90 ? 'red' : top.rain_24h > 35 ? 'orange' : null;
    stat('rain', A.num(top.rain_24h, 1), L.get() === 'th' ? 'มม.' : 'mm',
      [L.t('ad.ov.rainNote', { n: rep.length }), A.text('span', 'stat__where', top.name +
        (top.district && String(top.name).indexOf(top.district) < 0 ? ' (' + top.district + ')' : ''))], tone);
  }

  function renderDams() {
    if (data.dams === undefined && !errors.dams) return;
    if (!data.dams) { stat('dams', null, '', L.t('error.card')); return; }
    var storage = data.dams.filter(function (d) { return isNum(d.pct) && isNum(d.volume) && d.capacity; });
    if (!storage.length) { stat('dams', null, '', L.t('ad.ov.damsNote')); return; }
    var vol = 0, cap = 0, asOf = '';
    storage.forEach(function (d) {
      vol += d.volume;
      cap += d.capacity;
      var day = String(d.measured_at || '').slice(0, 10);
      if (day > asOf) asOf = day;
    });
    stat('dams', A.num(vol / cap * 100, 1), '%', [L.t('ad.ov.damsNote'), asOf ? L.t('ad.ov.daily', { date: A.date(asOf) }) : '']);
  }

  /* ---------- Risk card and chart ---------- */

  function renderRiskTag() {
    var el = $('[data-ov-level]');
    var r = data.risk;
    var level = r && A.TONE[r.level] ? r.level : null;
    el.className = 'tag tag--' + (level ? A.TONE[level] : 'grey');
    el.textContent = level ? A.levelLabel(level) : r === null ? L.t('risk.nodata') : r === undefined && !errors.risk ? '…' : L.t('error.card');

    var note = $('[data-ov-risk-note]');
    note.textContent = '';
    if (r) {
      note.appendChild(document.createTextNode(L.t('ad.ov.riskAt', { time: A.time(r.created_at) }) + ' '));
      note.appendChild(h('strong', null, L.t('risk.desc.' + level)));
      note.appendChild(document.createTextNode(' ' + L.t('ad.ov.noForecast')));
    } else if (r === null) {
      note.textContent = L.t('ad.ov.noRisk');
    }

    var legend = $('[data-ov-legend]');
    legend.textContent = '';
    var a = ayutthaya();
    RISK_ORDER.forEach(function (lv) {
      var li = h('li', 'legend__item legend__item--' + A.TONE[lv] + (lv === level ? ' is-now' : ''));
      li.appendChild(h('span', 'legend__name', A.levelLabel(lv)));
      li.appendChild(h('span', 'legend__rule', L.t('ad.ov.rule.' + lv, { bank: A.num(a.bank, 2), watch: A.num(a.watch, 2) })));
      legend.appendChild(li);
    });
  }

  var chartBox = $('[data-chart]');
  var lastDrawnKey = '';

  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function renderChart(force) {
    if (data.history === undefined && !errors.history) {
      if (!chartBox.firstChild) chartBox.appendChild(h('div', 'chart__wait'));
      return;
    }
    var pts = series();
    var a = ayutthaya();
    var W = Math.max(280, Math.round(chartBox.clientWidth || 600));
    var key = [W, pts.length, pts.length && pts[pts.length - 1].t, a.bank, L.get()].join('|');
    if (!force && key === lastDrawnKey) return;
    var firstDraw = !lastDrawnKey;
    lastDrawnKey = key;
    chartBox.textContent = '';

    if (!pts.length) {
      chartBox.appendChild(h('p', 'chart__msg', data.history === null ? L.t('ad.ov.noHistory') : L.t('ad.ov.historyEmpty')));
      return;
    }

    var H = 270, P = { l: 44, r: 18, t: 18, b: 30 };
    var t1 = pts[pts.length - 1].t;
    var t0 = Math.min(pts[0].t, t1 - 3600000);
    var vals = pts.filter(function (p) { return !p.odd; }).map(function (p) { return p.v; });
    if (!vals.length) vals = pts.map(function (p) { return p.v; });
    var lo = Math.min(Math.min.apply(null, vals), a.watch - 0.6) - 0.15;
    var hi = Math.max(Math.max.apply(null, vals), a.bank + 0.25) + 0.1;
    function x(t) { return P.l + (t - t0) / (t1 - t0) * (W - P.l - P.r); }
    function y(v) { return P.t + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * (H - P.t - P.b); }

    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'chart__svg', role: 'img' });
    var last = pts.filter(function (p) { return !p.odd; }).pop() || pts[pts.length - 1];
    s.setAttribute('aria-label', L.t('ad.ov.chartAlt', { from: A.time(pts[0].at), to: A.time(last.at), v: A.num(last.v, 2), bank: A.num(a.bank, 2) }));

    // Zones of rule B2: over the bank, between the watch line and the bank, below the watch line
    [[hi, a.bank, 'red'], [a.bank, a.watch, 'yellow'], [a.watch, lo, 'green']].forEach(function (z) {
      var y1 = y(z[0]), y2 = y(z[1]);
      if (y2 - y1 > 0.5) s.appendChild(svg('rect', { x: P.l, y: y1, width: W - P.l - P.r, height: y2 - y1, class: 'chart__zone chart__zone--' + z[2] }));
    });

    // Level grid every 0.5 m
    for (var g = Math.ceil(lo * 2) / 2; g <= hi; g += 0.5) {
      s.appendChild(svg('line', { x1: P.l, x2: W - P.r, y1: y(g), y2: y(g), class: 'chart__grid' }));
      var lab = svg('text', { x: P.l - 8, y: y(g) + 4, class: 'chart__axis', 'text-anchor': 'end' });
      lab.textContent = A.num(g, 1);
      s.appendChild(lab);
    }
    // Times every 4 hours on the hour
    var step = (t1 - t0) > 12 * 3600000 ? 4 : 2;
    var first = Math.ceil(t0 / (step * 3600000)) * step * 3600000;
    for (var tt = first; tt <= t1; tt += step * 3600000) {
      if (x(tt) > W - P.r - 20) break;
      var tl = svg('text', { x: x(tt), y: H - 8, class: 'chart__axis', 'text-anchor': 'middle' });
      tl.textContent = A.clock(tt);
      s.appendChild(tl);
      s.appendChild(svg('line', { x1: x(tt), x2: x(tt), y1: H - P.b, y2: H - P.b + 4, class: 'chart__tick' }));
    }
    // The bank and the watch line
    [[a.bank, 'bank', L.t('ad.ov.bankLine', { v: A.num(a.bank, 2) })], [a.watch, 'watch', L.t('ad.ov.watchLine', { v: A.num(a.watch, 2) })]].forEach(function (ln) {
      s.appendChild(svg('line', { x1: P.l, x2: W - P.r, y1: y(ln[0]), y2: y(ln[0]), class: 'chart__line chart__line--' + ln[1] }));
      var tx = svg('text', { x: W - P.r - 4, y: y(ln[0]) - 5, class: 'chart__label', 'text-anchor': 'end' });
      tx.textContent = ln[2];
      s.appendChild(tx);
    });

    // The readings: one line, broken where readings are more than 2 hours apart, odd jumps left out
    var d = '', area = '', prev = null, startX = null;
    pts.forEach(function (p) {
      if (p.odd) return;
      var px = x(p.t).toFixed(1), py = y(p.v).toFixed(1);
      if (!prev || p.t - prev.t > 2 * 3600000) {
        if (prev) area += 'L' + x(prev.t).toFixed(1) + ' ' + (H - P.b) + 'L' + startX + ' ' + (H - P.b) + 'Z';
        d += 'M' + px + ' ' + py;
        area += 'M' + px + ' ' + py;
        startX = px;
      } else {
        d += 'L' + px + ' ' + py;
        area += 'L' + px + ' ' + py;
      }
      prev = p;
    });
    if (prev) area += 'L' + x(prev.t).toFixed(1) + ' ' + (H - P.b) + 'L' + startX + ' ' + (H - P.b) + 'Z';
    s.appendChild(svg('path', { d: area, class: 'chart__area' }));
    var line = svg('path', { d: d, class: 'chart__path' + (firstDraw && !A.reduceMotion() ? ' is-drawing' : '') });
    s.appendChild(line);
    pts.forEach(function (p) {
      if (p.odd) s.appendChild(svg('circle', { cx: x(p.t), cy: y(p.v), r: 3.5, class: 'chart__odd' }));
    });

    // Now: the newest reading, marked and labelled. An old one (over 3 hours) is not "now": no pulse, no now line
    var old = GW.isStale(last.at);
    var nx = x(last.t), ny = y(last.v);
    if (!old) {
      s.appendChild(svg('line', { x1: nx, x2: nx, y1: P.t, y2: H - P.b, class: 'chart__now' }));
      s.appendChild(svg('circle', { cx: nx, cy: ny, r: 9, class: 'chart__pulse' }));
    }
    s.appendChild(svg('circle', { cx: nx, cy: ny, r: 4.5, class: 'chart__dot' }));

    // Hover: a crosshair and the reading under the pointer
    var hover = svg('g', { class: 'chart__hover' });
    var hl = svg('line', { y1: P.t, y2: H - P.b, class: 'chart__hline' });
    var hd = svg('circle', { r: 4, class: 'chart__hdot' });
    hover.appendChild(hl);
    hover.appendChild(hd);
    s.appendChild(hover);

    chartBox.appendChild(s);
    var tip = h('p', 'chart__tip');
    var nowTip = h('p', 'chart__tip chart__tip--now' + (old ? ' is-old' : ''),
      (old ? GW.staleText(last.at, 'stale.latest') : A.clock(last.at)) + ' · ' + A.num(last.v, 2) + ' ' + m());
    chartBox.appendChild(nowTip);
    chartBox.appendChild(tip);
    nowTip.style.left = Math.min(W - 70, Math.max(70, nx)) + 'px';
    nowTip.style.top = Math.max(0, ny - 44) + 'px';
    if (line.getTotalLength && firstDraw && !A.reduceMotion()) {
      var len = line.getTotalLength();
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      requestAnimationFrame(function () { requestAnimationFrame(function () { line.style.strokeDashoffset = '0'; }); });
    }

    var good = pts.filter(function (p) { return !p.odd; });
    s.addEventListener('pointermove', function (e) {
      var r = s.getBoundingClientRect();
      var px = (e.clientX - r.left) * (W / r.width);
      var best = null;
      good.forEach(function (p) { if (!best || Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p; });
      if (!best) return;
      var bx = x(best.t), by = y(best.v);
      hl.setAttribute('x1', bx);
      hl.setAttribute('x2', bx);
      hd.setAttribute('cx', bx);
      hd.setAttribute('cy', by);
      hover.classList.add('is-on');
      tip.textContent = A.time(best.at) + ' · ' + A.num(best.v, 2) + ' ' + m();
      tip.style.left = Math.min(W - 80, Math.max(80, bx)) + 'px';
      tip.style.top = Math.max(0, by - 44) + 'px';
      tip.classList.add('is-on');
      nowTip.classList.add('is-hidden');
    });
    s.addEventListener('pointerleave', function () {
      hover.classList.remove('is-on');
      tip.classList.remove('is-on');
      nowTip.classList.remove('is-hidden');
    });
  }

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { if (A.current() === 'overview') renderChart(false); });
    ro.observe(chartBox);
  }

  /* ---------- Affected areas: map and list ---------- */

  var map = null;
  var mapReady = false;
  var BANGKOK = [100.56, 13.76];

  function areasGeo() {
    var list = (data.areas && data.areas.areas) || [];
    return {
      type: 'FeatureCollection',
      features: list.filter(function (d) { return isNum(d.lat) && isNum(d.lon); }).map(function (d) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [d.lon, d.lat] }, properties: { level: d.level, name: d.district } };
      })
    };
  }

  function makeMap() {
    var box = $('[data-ov-map]');
    var msg = $('[data-ov-map-msg]');
    if (map || !box.clientWidth) return;
    if (!window.maplibregl || typeof window.maplibregl.Map !== 'function') {
      msg.textContent = L.t('ad.ov.mapOff');
      msg.hidden = false;
      return;
    }
    try {
      map = new window.maplibregl.Map({
        container: box,
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: BANGKOK,
        zoom: 9.6,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false
      });
    } catch (e) {
      map = null;
      msg.textContent = L.t('ad.ov.mapOff');
      msg.hidden = false;
      return;
    }
    map.on('load', function () {
      if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#BCDDE6');
      map.addSource('areas', { type: 'geojson', data: areasGeo() });
      map.addLayer({
        id: 'areas-halo', type: 'circle', source: 'areas',
        paint: {
          'circle-radius': ['match', ['get', 'level'], 'danger', 18, 'high', 14, 10],
          'circle-color': ['match', ['get', 'level'], 'danger', '#D65A4A', 'high', '#E0893F', 'medium', '#E2C15A', '#5FB98F'],
          'circle-opacity': 0.22
        }
      });
      map.addLayer({
        id: 'areas', type: 'circle', source: 'areas',
        paint: {
          'circle-radius': 6.5,
          'circle-color': ['match', ['get', 'level'], 'danger', '#D65A4A', 'high', '#E0893F', 'medium', '#E2C15A', '#5FB98F'],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2
        }
      });
      mapReady = true;
      fitAreas();
    });
    map.on('error', function () { /* a missing tile is not worth a message */ });
  }

  function fitAreas() {
    if (!mapReady) return;
    map.getSource('areas').setData(areasGeo());
    var f = areasGeo().features;
    if (f.length > 1) {
      var b = new window.maplibregl.LngLatBounds();
      f.forEach(function (x) { b.extend(x.geometry.coordinates); });
      map.fitBounds(b, { padding: 40, maxZoom: 12, duration: 0 });
    }
  }

  function renderAreas() {
    var ol = $('[data-ov-areas]');
    var foot = $('[data-ov-areas-foot]');
    if (data.areas === undefined && !errors.areas) return;
    ol.textContent = '';
    foot.textContent = '';
    if (!data.areas) { ol.appendChild(h('li', 'box__error', L.t('error.card'))); return; }
    var list = data.areas.areas.slice().sort(function (a, b) {
      return (AREA_ORDER[a.level] - AREA_ORDER[b.level]) || ((b.max_depth_cm || 0) - (a.max_depth_cm || 0));
    });
    if (!list.length) ol.appendChild(h('li', 'areas__empty', L.t('ad.ov.areasNone')));
    (showAllAreas ? list : list.slice(0, AREAS_SHOWN)).forEach(function (d, i) {
      var li = h('li', 'areas__row');
      li.style.setProperty('--i', i);
      var btn = h('button', 'areas__btn');
      btn.type = 'button';
      btn.appendChild(A.text('span', 'areas__name', d.district));
      btn.appendChild(h('span', 'areas__meta', L.t('ad.ov.depth', { d: isNum(d.max_depth_cm) ? A.num(d.max_depth_cm, 0) : '–', f: d.flooded_points, n: d.road_points })));
      btn.appendChild(A.tag(A.levelLabel(d.level), A.TONE[d.level]));
      btn.addEventListener('click', function () {
        if (mapReady && isNum(d.lat)) map.flyTo({ center: [d.lon, d.lat], zoom: 12.5, duration: A.reduceMotion() ? 0 : 1200 });
      });
      li.appendChild(btn);
      ol.appendChild(li);
    });
    if (list.length > AREAS_SHOWN) {
      var more = h('li', 'areas__more');
      var mb = h('button', 'link-btn', showAllAreas ? L.t('water.showLess') : L.t('water.showAll', { n: list.length }));
      mb.type = 'button';
      mb.addEventListener('click', function () { showAllAreas = !showAllAreas; renderAreas(); });
      more.appendChild(mb);
      ol.appendChild(more);
    }
    foot.textContent = L.t('ad.ov.monitored', { n: data.areas.monitored_districts }) +
      (data.areas.updated_at ? ' · ' + L.t('status.updated', { time: A.time(data.areas.updated_at) }) : '');
    fitAreas();
  }

  /* ---------- What is waiting ---------- */

  function renderAttention() {
    var box = $('[data-attn]');
    var c = A.counts;
    box.textContent = '';
    if (c.alerts === null && c.reports === null) return;
    var items = [];
    if (c.alerts) items.push(['admin-alerts.html', 'orange', L.t(c.alerts === 1 ? 'ad.ov.attnAlert1' : 'ad.ov.attnAlerts', { n: c.alerts })]);
    if (c.reports) items.push(['admin-reports.html', 'red', L.t(c.reports === 1 ? 'ad.ov.attnReport1' : 'ad.ov.attnReports', { n: c.reports })]);
    if (c.pump && c.pump.pump === 'on') items.push(['admin-hardware.html', 'teal', L.t('ad.ov.attnPump', { n: c.pump.seconds_left })]);
    if (!items.length) {
      box.appendChild(h('p', 'attn__clear', L.t('ad.ov.attnNone')));
      return;
    }
    box.appendChild(h('p', 'attn__label', L.t('ad.ov.attn')));
    items.forEach(function (it) {
      var a = h('a', 'attn__item attn__item--' + it[1]);
      a.href = it[0];
      a.appendChild(h('span', 'attn__dot'));
      a.appendChild(h('span', null, it[2]));
      a.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>');
      box.appendChild(a);
    });
  }

  /* ---------- Loading ---------- */

  // /risk goes through GW.loadRisk: at most once every 5 minutes across pages. Sample data is not the current level.
  function load(key, path, opts) {
    var get = key === 'risk' ? GW.loadRisk().then(function (res) {
      if (res.mode === 'sample') throw res;
      return res.data;
    }) : A.api(path, opts);
    return get.then(function (d) {
      data[key] = d;
      errors[key] = null;
    }, function (err) {
      if (key === 'risk' && err.status === 503) { data.risk = null; errors.risk = null; return; }
      if (key === 'history' && err.kind === 'http' && err.status === 404) { data.history = null; errors.history = null; return; }
      errors[key] = err;
      // A failed /risk (or sample data) shows as an error, not as "no data to assess" (null = the backend's 503)
      if (data[key] === undefined && key !== 'risk') data[key] = null;
    });
  }

  function render() {
    renderAttention();
    renderLevel();
    renderRain();
    renderDams();
    renderRiskTag();
    renderChart(true);
    renderAreas();
  }

  var tasks = [
    A.every(5 * 60 * 1000, function () { return load('risk', '/risk').then(renderRiskTag); }, 'overview'),
    A.every(60 * 1000, function () {
      return load('river', '/stations/latest?kind=river').then(function () { renderLevel(); renderRiskTag(); });
    }, 'overview'),
    A.every(5 * 60 * 1000, function () {
      return load('history', '/stations/history?kind=river&code=' + STATION + '&hours=24').then(function () { renderLevel(); renderChart(false); });
    }, 'overview'),
    A.every(5 * 60 * 1000, function () { return load('rain', '/stations/latest?kind=rain').then(renderRain); }, 'overview'),
    A.every(30 * 60 * 1000, function () { return load('dams', '/dams/latest').then(renderDams); }, 'overview'),
    A.every(60 * 1000, function () { return load('areas', '/admin/affected-areas').then(renderAreas); }, 'overview')
  ];

  document.addEventListener('adm:counts', function () { if (A.current() === 'overview') renderAttention(); });

  A.view('overview', {
    enter: function () {
      render();
      tasks.forEach(function (t) { t.due(); });
      // The map needs its box laid out first
      requestAnimationFrame(function () {
        makeMap();
        if (map) map.resize();
      });
    },
    render: function () {
      lastDrawnKey = '';
      render();
    }
  });
})(window.GW = window.GW || {});
