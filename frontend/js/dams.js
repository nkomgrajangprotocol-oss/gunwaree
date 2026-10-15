/* GunWaree Dam levels: the four storage dams above Bangkok and the Chao Phraya diversion dam.

   Endpoint            Refresh      Used for
   GET /dams/latest    30 minutes   map markers, selected dam, watchlist

   Rules from the plan: dam data is daily ("Daily data as of ..."), never called live; null is
   "Awaiting report", never 0; the Chao Phraya dam has no storage, only flow (outflow, from station
   C.13, already converted to million m³/day) plus the backend's note. Status is the ThaiWater storage
   scale, worked out here from pct. The map is OpenFreeMap (OpenStreetMap data) drawn by js/maps.js. */

(function (GW) {
  'use strict';

  var lang = GW.lang;
  var F = GW.fmt;
  var h = F.h;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var REFRESH_MS = 30 * 60 * 1000;

  // ThaiWater storage scale
  var CLASSES = [
    { key: 'critlow', max: 30, tone: 'grey' },
    { key: 'low', max: 50, tone: 'grey' },
    { key: 'moderate', max: 80, tone: 'green' },
    { key: 'high', max: 100, tone: 'orange' },
    { key: 'over', max: Infinity, tone: 'red' }
  ];

  var state = { dams: null, mode: null, error: null, selected: null, query: '', type: 'all', shownPct: {} };

  /* ---------- Data helpers ---------- */

  function isMissing(v) { return v === null || v === undefined; }
  function isStorage(d) { return !isMissing(d.pct) || !isMissing(d.capacity); }
  function typeOf(d) { return isStorage(d) ? 'reservoir' : 'diversion'; }

  function storageClass(pct) {
    if (isMissing(pct)) return null;
    for (var i = 0; i < CLASSES.length; i++) if (pct <= CLASSES[i].max) return CLASSES[i];
    return CLASSES[CLASSES.length - 1];
  }

  function place(th) { return GW.PLACE_EN[th] || th; }

  function damName(d, which) {
    var l = which || lang.get();
    return l === 'th' ? 'เขื่อน' + d.name : place(d.name) + ' Dam';
  }

  function provinceName(d, which) {
    if (!d.province) return '';
    return (which || lang.get()) === 'th' ? d.province : place(d.province);
  }

  // million m³ per day to m³ per second
  function toCms(mcmPerDay) { return mcmPerDay * 1e6 / 86400; }

  function perDay(v) { return isMissing(v) ? lang.t('status.awaiting') : lang.t('dams.perDay', { v: F.num(v, 2) }); }

  function asOf(d) {
    var t = F.time(d.measured_at);
    return t ? lang.t('dams.asOf', { date: t }) : '';
  }

  function findDam(name) {
    return (state.dams || []).filter(function (d) { return d.name === name; })[0] || null;
  }

  function matches(d) {
    if (state.type !== 'all' && typeOf(d) !== state.type) return false;
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    return [d.name, place(d.name), damName(d, 'en'), damName(d, 'th'), d.province || '', place(d.province || ''),
      lang.t('dams.' + typeOf(d))].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  /* ---------- Map ---------- */

  var stage = $('.map-card__stage');
  var map = null;
  var markers = {};      // dam name -> marker element
  var pins = [];         // MapLibre markers on the map

  function hasPos(d) { return typeof d.lat === 'number' && typeof d.lon === 'number'; }

  // Every dam in view, flat and facing north
  function showAll(m, animate) {
    var list = (state.dams || []).filter(hasPos);
    if (!m || !list.length) return;
    var b = new window.maplibregl.LngLatBounds();
    list.forEach(function (d) { b.extend([d.lon, d.lat]); });
    m.fitBounds(b, { padding: { top: 60, bottom: 50, left: 50, right: 190 }, pitch: 0, bearing: 0, duration: animate ? 1200 : 0, maxZoom: 8 });
  }

  // Selecting a dam flies there and tilts the map so the valley reads in 3D
  function flyTo(d) {
    if (!map || !hasPos(d)) return;
    map.flyTo({ center: [d.lon, d.lat], zoom: 9.2, pitch: 54, bearing: -16, speed: 0.9, curve: 1.45, padding: { right: 120 } });
  }

  function markerLabel(d) {
    if (typeOf(d) === 'reservoir') return isMissing(d.pct) ? lang.t('status.awaiting') : F.num(d.pct, 1) + '%';
    return isMissing(d.outflow) ? lang.t('status.awaiting') : F.num(toCms(d.outflow), 0) + ' ' + lang.t('dams.cms');
  }

  function drawMarkers(fillFromEmpty) {
    if (!map || !state.dams) return;
    pins.forEach(function (p) { p.remove(); });
    pins = [];
    markers = {};
    state.dams.forEach(function (d) {
      if (!hasPos(d)) return;
      var res = typeOf(d) === 'reservoir';
      var el = h('button', 'dpin dpin--' + typeOf(d));
      el.type = 'button';
      el.setAttribute('aria-label', lang.t('dams.select', { name: damName(d) }) + ', ' + markerLabel(d));
      var cup = h('span', 'dpin__cup');
      var water = h('span', 'dpin__water');
      cup.appendChild(water);
      el.appendChild(cup);
      el.appendChild(h('span', 'dpin__ring'));
      var label = h('span', 'dpin__label', damName(d));
      label.appendChild(h('small', null, markerLabel(d)));
      el.appendChild(label);
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        select(d.name, true);
      });
      var level = res && !isMissing(d.pct) ? Math.max(0, Math.min(100, d.pct)) + '%' : '';
      if (!fillFromEmpty || F.reduceMotion()) water.style.height = level;
      pins.push(new window.maplibregl.Marker({ element: el }).setLngLat([d.lon, d.lat]).addTo(map));
      markers[d.name] = el;
      // The water rises in each marker once it is on the map
      if (fillFromEmpty && !F.reduceMotion()) {
        requestAnimationFrame(function () { requestAnimationFrame(function () { water.style.height = level; }); });
      }
    });
    applyFilter();
    markSelected(false);
  }

  function markSelected(pulse) {
    Object.keys(markers).forEach(function (k) {
      var on = k === state.selected;
      markers[k].classList.toggle('is-selected', on);
      markers[k].setAttribute('aria-pressed', String(on));
      markers[k].parentNode && (markers[k].style.zIndex = on ? '2' : '');
      if (on && pulse) F.replay(markers[k], 'is-pulsing', 2300);
    });
  }

  GW.maps.create(stage, { center: [100.4, 16.2], zoom: 6, onReset: function (m) { showAll(m, true); } }).then(function (m) {
    map = m;
    if (!m) return;
    drawMarkers(true);
    showAll(m, false);
  });

  /* ---------- Selected dam ---------- */

  var detail = $('[data-dam-detail]');

  // Water tank: the fill rises to the stored share; a slow wave moves on the surface
  var WAVE = (function () {
    var d = 'M-240 0';
    for (var x = -240; x < 480; x += 60) d += ' q15 -5 30 0 t30 0';
    return d + ' V200 H-240 Z';
  })();

  function tank(pct) {
    var wrap = h('div', 'tank');
    wrap.innerHTML =
      '<svg viewBox="0 0 240 150" aria-hidden="true">' +
      '<defs><clipPath id="tank-clip"><rect x="1" y="1" width="238" height="148" rx="10"/></clipPath></defs>' +
      '<g clip-path="url(#tank-clip)">' +
      '<rect class="tank__bg" x="0" y="0" width="240" height="150"/>' +
      '<g class="tank__water"><path class="tank__wave tank__wave--back" d="' + WAVE + '"/><path class="tank__wave" d="' + WAVE + '"/></g>' +
      '<line class="tank__line" x1="0" x2="240" y1="30" y2="30"/>' +
      '<text class="tank__mark" x="232" y="25" text-anchor="end">80%</text>' +
      '</g>' +
      '<rect class="tank__frame" x="1" y="1" width="238" height="148" rx="10"/>' +
      '</svg>';
    var water = wrap.querySelector('.tank__water');
    var target = 150 * (1 - Math.max(0, Math.min(100, pct)) / 100);
    var from = state.shownPct.tank === undefined ? 150 : 150 * (1 - Math.max(0, Math.min(100, state.shownPct.tank)) / 100);
    water.style.transform = 'translateY(' + from + 'px)';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { water.style.transform = 'translateY(' + target + 'px)'; });
    });
    return wrap;
  }

  function flowStripes(cms) {
    var wrap = h('div', 'flowbox');
    var lines = '';
    for (var i = 0; i < 6; i++) {
      lines += '<path class="flowbox__line" d="M-20 ' + (16 + i * 22) + ' H260" style="--d:' + (i % 3) * 0.4 + 's"/>';
    }
    wrap.innerHTML = '<svg viewBox="0 0 240 150" aria-hidden="true"><rect class="tank__bg" x="1" y="1" width="238" height="148" rx="10"/>' +
      lines + '<rect class="tank__frame" x="1" y="1" width="238" height="148" rx="10"/></svg>';
    var speed = 0.6 + 2.4 * Math.min(1, cms / 3000);
    wrap.style.setProperty('--flow-dur', (2.2 / speed).toFixed(2) + 's');
    return wrap;
  }

  function stat(dl, labelText, valueText, cls) {
    var row = h('div', 'dstat' + (cls ? ' ' + cls : ''));
    row.appendChild(h('dt', null, labelText));
    row.appendChild(h('dd', null, valueText));
    dl.appendChild(row);
  }

  function renderDetail(animate) {
    var d = findDam(state.selected);
    if (!state.dams) {
      if (state.error) { detail.textContent = ''; detail.appendChild(h('p', 'card__error', lang.t('dams.error'))); }
      return;
    }
    detail.textContent = '';
    if (!d) return;
    var res = typeOf(d) === 'reservoir';
    detail.classList.remove('is-swapping');
    if (animate && !F.reduceMotion()) { void detail.offsetWidth; detail.classList.add('is-swapping'); }

    detail.appendChild(h('p', 'dam-detail__eyebrow', lang.t(res ? 'dams.selectedRes' : 'dams.selectedDiv')));
    detail.appendChild(h('h2', 'dam-detail__name', damName(d)));
    var other = lang.get() === 'th' ? 'en' : 'th';
    var sub = h('p', 'dam-detail__sub');
    var otherName = h('span', null, damName(d, other));
    if (other === 'th') otherName.lang = 'th';
    sub.appendChild(otherName);
    if (d.province) sub.appendChild(document.createTextNode(' · ' + provinceName(d)));
    detail.appendChild(sub);

    var cls = storageClass(d.pct);
    detail.appendChild(h('span', 'pill dam-detail__pill lv-' + (cls ? cls.tone : 'grey'), cls ? lang.t('dams.cls.' + cls.key) : lang.t('dams.flowOnly')));

    var hero = h('div', 'dam-hero');
    var big = h('p', 'dam-hero__num');
    var numEl = h('span', 'dam-hero__value');
    big.appendChild(numEl);

    if (res) {
      hero.appendChild(tank(d.pct || 0));
      if (isMissing(d.pct)) numEl.textContent = lang.t('status.awaiting');
      else {
        big.appendChild(h('span', 'dam-hero__unit', '%'));
        F.countUp(numEl, d.pct, 1, animate ? 0 : d.pct, 900);
      }
      var cap = h('div', 'dam-hero__text');
      cap.appendChild(big);
      cap.appendChild(h('p', 'dam-hero__label', lang.t('dams.stored')));
      hero.appendChild(cap);
      detail.appendChild(hero);
      state.shownPct.tank = d.pct || 0;

      var dl = h('dl', 'dstats');
      stat(dl, lang.t('dams.volume'), isMissing(d.volume) || isMissing(d.capacity)
        ? lang.t('status.awaiting') : lang.t('dams.volumeOf', { v: F.num(d.volume, 0), c: F.num(d.capacity, 0) }));
      if (!isMissing(d.volume) && !isMissing(d.capacity)) {
        var free = Math.max(0, d.capacity - d.volume);
        stat(dl, lang.t('dams.space'), lang.t('dams.spaceVal', { v: F.num(free, 0) }) + ' (' + F.num(free / d.capacity * 100, 1) + '%)');
      }
      stat(dl, lang.t('dams.inflow'), perDay(d.inflow));
      stat(dl, lang.t('dams.outflow'), perDay(d.outflow));
      detail.appendChild(dl);

      if (!isMissing(d.inflow) && !isMissing(d.outflow) && d.inflow !== d.outflow) {
        var filling = d.inflow > d.outflow;
        var trend = h('p', 'dam-trend ' + (filling ? 'is-filling' : 'is-draining'));
        trend.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + (filling ? 'M8 13V3M3.5 7.5 8 3l4.5 4.5' : 'M8 3v10M3.5 8.5 8 13l4.5-4.5') +
          '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        trend.appendChild(document.createTextNode(lang.t(filling ? 'dams.filling' : 'dams.draining')));
        detail.appendChild(trend);
      }
    } else {
      var cms = isMissing(d.outflow) ? null : toCms(d.outflow);
      hero.appendChild(flowStripes(cms || 0));
      var capD = h('div', 'dam-hero__text');
      if (cms === null) numEl.textContent = lang.t('status.awaiting');
      else {
        big.appendChild(h('span', 'dam-hero__unit', lang.t('dams.cms')));
        F.countUp(numEl, cms, 0, animate ? 0 : cms, 900);
      }
      capD.appendChild(big);
      capD.appendChild(h('p', 'dam-hero__label', lang.t('dams.discharge')));
      hero.appendChild(capD);
      detail.appendChild(hero);

      var dl2 = h('dl', 'dstats');
      stat(dl2, lang.t('dams.outflow'), perDay(d.outflow));
      detail.appendChild(dl2);
      if (d.note) detail.appendChild(F.thai('p', 'dam-detail__note', d.note));
      detail.appendChild(h('p', 'dam-detail__note', lang.t('dams.noStorage')));
    }
    detail.appendChild(h('p', 'dam-detail__asof card__time', asOf(d)));
  }

  /* ---------- Watchlist ---------- */

  var rowsEl = $('[data-dam-rows]');
  var emptyEl = $('[data-dam-empty]');
  var barsDone = false;

  function renderTable() {
    rowsEl.textContent = '';
    if (!state.dams) {
      if (state.error) {
        var tr0 = h('tr');
        var td0 = h('td', 'card__error', lang.t('dams.error'));
        td0.colSpan = 5;
        tr0.appendChild(td0);
        rowsEl.appendChild(tr0);
      }
      return;
    }
    var animateBars = !barsDone && !F.reduceMotion();
    state.dams.forEach(function (d) {
      var res = typeOf(d) === 'reservoir';
      var tr = h('tr', 'dam-row');
      tr.setAttribute('data-name', d.name);

      var td1 = h('td', 'dam-row__dam');
      var btn = h('button', 'dam-row__btn');
      btn.type = 'button';
      btn.appendChild(h('span', 'dam-row__name', damName(d)));
      var other = lang.get() === 'th' ? 'en' : 'th';
      var o = h('span', 'dam-row__alt', damName(d, other));
      if (other === 'th') o.lang = 'th';
      btn.appendChild(o);
      btn.addEventListener('click', function () { select(d.name, true, true); });
      td1.appendChild(btn);
      tr.appendChild(td1);

      var td2 = h('td', 'dam-row__province');
      td2.appendChild(h('span', null, provinceName(d)));
      if (d.province) {
        var po = h('span', 'dam-row__alt', provinceName(d, other));
        if (other === 'th') po.lang = 'th';
        td2.appendChild(po);
      }
      tr.appendChild(td2);

      tr.appendChild(h('td', 'dam-row__type', lang.t(res ? 'dams.reservoir' : 'dams.diversion')));

      var td4 = h('td', 'dam-row__storage');
      if (res) {
        if (isMissing(d.pct)) td4.appendChild(h('span', 'lv-grey', lang.t('status.awaiting')));
        else {
          td4.appendChild(h('span', 'dam-row__main', lang.t('dams.pctStored', { p: F.num(d.pct, 1) })));
          var bar = h('span', 'minibar');
          var fill = h('span', 'minibar__fill');
          fill.style.setProperty('--w', Math.max(0, Math.min(100, d.pct)) + '%');
          if (animateBars) fill.classList.add('is-growing');
          bar.appendChild(fill);
          td4.appendChild(bar);
          td4.appendChild(h('span', 'dam-row__alt', lang.t('dams.pctFree', { p: F.num(Math.max(0, 100 - d.pct), 1) })));
        }
      } else if (isMissing(d.outflow)) {
        td4.appendChild(h('span', 'lv-grey', lang.t('status.awaiting')));
      } else {
        td4.appendChild(h('span', 'dam-row__main', F.num(toCms(d.outflow), 0) + ' ' + lang.t('dams.cms')));
        td4.appendChild(h('span', 'dam-row__alt', perDay(d.outflow)));
      }
      tr.appendChild(td4);

      var cls = storageClass(d.pct);
      var td5 = h('td', 'dam-row__status');
      td5.appendChild(h('span', 'pill lv-' + (cls ? cls.tone : 'grey'), cls ? lang.t('dams.cls.' + cls.key) : lang.t('dams.flowOnly')));
      tr.appendChild(td5);

      rowsEl.appendChild(tr);
    });
    barsDone = true;

    var res = state.dams.filter(function (d) { return typeOf(d) === 'reservoir'; }).length;
    $('[data-watch-sub]').textContent = lang.t('dams.watchSub', { n: state.dams.length, r: res, d: state.dams.length - res });
    var dates = state.dams.map(function (d) { return String(d.measured_at || '').slice(0, 10); }).filter(Boolean).sort();
    var latest = dates.pop();
    var asof = latest ? lang.t('dams.asOf', { date: F.time(latest) }) : '';
    $('[data-watch-time]').textContent = asof;
    $('[data-dams-asof]').textContent = asof;
    applyFilter();
    markRows();
  }

  function markRows() {
    rowsEl.querySelectorAll('.dam-row').forEach(function (tr) {
      var on = tr.getAttribute('data-name') === state.selected;
      tr.classList.toggle('is-selected', on);
      var b = tr.querySelector('.dam-row__btn');
      if (b) b.setAttribute('aria-pressed', String(on));
    });
  }

  function applyFilter() {
    var any = false;
    (state.dams || []).forEach(function (d) {
      var ok = matches(d);
      any = any || ok;
      var tr = rowsEl.querySelector('[data-name="' + d.name + '"]');
      if (tr) tr.hidden = !ok;
      if (markers[d.name]) markers[d.name].classList.toggle('is-dim', !ok);
    });
    emptyEl.hidden = !state.dams || any;
  }

  /* ---------- Selection ---------- */

  function select(name, animate, fromTable) {
    var changed = name !== state.selected;
    state.selected = name;
    if (changed) state.shownPct.tank = undefined;
    markSelected(animate && changed);
    markRows();
    renderDetail(animate && changed);
    if (animate && changed) flyTo(findDam(name));
    if (fromTable && window.matchMedia('(max-width: 920px)').matches) {
      detail.scrollIntoView({ behavior: F.reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  // Start on the dam most likely to matter: the fullest reservoir
  function defaultDam() {
    var list = (state.dams || []).filter(function (d) { return !isMissing(d.pct); });
    list.sort(function (a, b) { return b.pct - a.pct; });
    return (list[0] || (state.dams || [])[0] || {}).name || null;
  }

  /* ---------- Status pill ---------- */

  var statusEl = $('[data-status]');
  var connecting = false;

  function renderStatus() {
    var mode, text;
    if (state.mode === 'sample') { mode = 'sample'; text = lang.t('status.sample'); }
    else if ((state.dams || []).some(function (d) { return d.source === 'sim'; })) { mode = 'sim'; text = lang.t('status.sim'); }
    else if (state.mode === 'live') { mode = 'live'; text = lang.t('status.live'); }
    else if (connecting) { mode = 'connecting'; text = lang.t('status.connecting'); }
    else { statusEl.textContent = ''; return; }
    statusEl.setAttribute('data-mode', mode);
    statusEl.textContent = text;
    if (mode === 'sample') statusEl.title = lang.t('status.sampleHint', { url: GW.BASE_URL });
    else statusEl.removeAttribute('title');
  }

  /* ---------- Loading ---------- */

  var retryTimer = 0;

  // While someone is reading the page (pointer over a [data-hold] section), a refresh waits
  // and runs as soon as they move away. The first load always runs.
  var pendingRefresh = false;
  function heldBack() {
    if (!GW.hold || !GW.hold.active()) return false;
    pendingRefresh = true;
    GW.hold.deferred();
    return true;
  }
  if (GW.hold) GW.hold.onRelease(function () {
    if (!pendingRefresh) return;
    pendingRefresh = false;
    load();
  });

  function load() {
    if (state.dams && heldBack()) return Promise.resolve();
    return GW.load('/dams/latest', 'dams.json', {
      auth: false,
      onSlow: function () { connecting = true; renderStatus(); }
    }).then(function (res) {
      var first = !state.dams;
      state.dams = res.data || [];
      state.mode = res.mode;
      state.error = null;
      if (res.mode === 'live') GW.pulse();
      if (!state.selected || !findDam(state.selected)) state.selected = defaultDam();
      drawMarkers(first);
      if (first) showAll(map, false);
      renderTable();
      renderDetail(first);
    }, function (err) {
      state.error = err;
      if (!state.dams) { renderTable(); renderDetail(false); }
    }).then(function () {
      renderStatus();
      // Showing the offline snapshot: try the backend again soon
      if (state.mode === 'sample' && !retryTimer) {
        retryTimer = setTimeout(function () { retryTimer = 0; load(); }, 15000);
      }
    });
  }

  $('[data-dam-search]').addEventListener('input', function (e) { state.query = e.target.value; applyFilter(); });
  $('[data-dam-type]').addEventListener('change', function (e) { state.type = e.target.value; applyFilter(); });

  document.addEventListener('gw:lang', function () {
    if (!state.dams) return;
    drawMarkers(false);
    renderTable();
    renderDetail(false);
    renderStatus();
  });

  load();
  setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);
})(window.GW = window.GW || {});
