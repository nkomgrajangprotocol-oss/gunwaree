/* GunWaree Water levels: river and canal gauges around Bangkok, and road flood points.

   Endpoint                                              Refresh     Used for
   GET /stations/latest?kind=river                       60 seconds  map, list, detail
   GET /stations/latest?kind=canal                       60 seconds  map, list, detail
   GET /stations/latest?kind=road                        60 seconds  map, list, detail
   GET /stations/latest?kind=canal&scope=bangkok_test    60 seconds  the team's ESP32 test sensor (shown only when it reports)

   Rules from the plan: units are m for water_level (above mean sea level), cm for depth_cm; where warn and
   crit are given they set the colour; every value shows its measured_at (Thai time, never converted); null
   is "Awaiting report", never 0; a reading older than 6 hours is "No recent report"; sample files stand in
   when the backend cannot be reached, and the page says so.

   Status, worst first:
     over    river/canal at or over the bank; road 30 cm or deeper
     crit    at or over crit (Bangkok Drainage Office level); road over 10 cm
     warn    at or over warn; road 5 to 10 cm
     normal  everything below
     stale   no value, or older than 6 hours */

(function (GW) {
  'use strict';

  var lang = GW.lang;
  var F = GW.fmt;
  var h = F.h;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var KINDS = ['river', 'canal', 'road'];
  var SAMPLE = { river: 'stations-river.json', canal: 'stations-canal.json', road: 'stations-road.json' };
  var REFRESH_MS = 60 * 1000;
  var FRESH_MS = 6 * 3600 * 1000;
  var LIST_SHORT = 12;
  var ORDER = ['over', 'crit', 'warn', 'normal', 'stale'];
  var TONE = { over: 'red', crit: 'orange', warn: 'yellow', normal: 'green', stale: 'grey' };
  var COLOR = { over: '#D65A4A', crit: '#E0893F', warn: '#E2C15A', normal: '#5FB98F', stale: '#8C9EA0' };
  var KIND_KEY = { river: 'water.river', canal: 'water.canal', road: 'water.road' };
  var BANGKOK = [[100.33, 13.55], [100.95, 13.98]];

  var state = {
    data: { river: null, canal: null, road: null },
    modes: {},
    errors: {},
    items: [],          // every station with its worked-out status
    kind: 'all',
    status: null,
    query: '',
    selected: null,
    showAll: false,
    listShown: false,
    kit: null
  };

  /* ---------- Data ---------- */

  function isMissing(v) { return v === null || v === undefined; }

  function timeValue(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : NaN;
  }

  function valueOf(s) { return s.kind === 'road' ? s.depth_cm : s.water_level; }

  function statusOf(s, newest) {
    var v = valueOf(s);
    if (isMissing(v) || !(newest - timeValue(s.measured_at) <= FRESH_MS)) return 'stale';
    if (s.kind === 'road') {
      if (v >= 30) return 'over';
      if (v > 10) return 'crit';
      if (v >= 5) return 'warn';
      return 'normal';
    }
    if (!isMissing(s.bank) && s.bank > 0 && v >= s.bank) return 'over';
    if (!isMissing(s.crit) && v >= s.crit) return 'crit';
    if (!isMissing(s.warn) && v >= s.warn) return 'warn';
    return 'normal';
  }

  // How close to trouble: smaller is more urgent (used to sort within a status)
  function margin(s) {
    var v = valueOf(s);
    if (isMissing(v)) return Infinity;
    if (s.kind === 'road') return -v;
    if (!isMissing(s.bank) && s.bank > 0) return s.bank - v;
    if (!isMissing(s.crit)) return s.crit - v;
    return 50;
  }

  function hasPos(s) { return typeof s.lat === 'number' && typeof s.lon === 'number' && !(s.lat === 0 && s.lon === 0); }

  function build() {
    var items = [];
    KINDS.forEach(function (k) {
      var list = state.data[k] || [];
      var newest = Math.max.apply(null, list.map(function (s) { return timeValue(s.measured_at); }).filter(isFinite).concat([-Infinity]));
      list.forEach(function (s) {
        var st = statusOf(s, newest);
        items.push({ s: s, id: k + ':' + s.code, kind: k, status: st, rank: ORDER.indexOf(st), margin: margin(s) });
      });
    });
    items.sort(function (a, b) { return a.rank - b.rank || a.margin - b.margin; });
    state.items = items;
  }

  function find(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function matchesText(it) {
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    var s = it.s;
    return [s.name, s.district, s.code, lang.t(KIND_KEY[it.kind])].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function matchesKind(it) { return state.kind === 'all' || it.kind === state.kind; }
  function visible(it) { return matchesKind(it) && matchesText(it) && (!state.status || it.status === state.status); }

  /* ---------- Formatting ---------- */

  function valueText(it) {
    var v = valueOf(it.s);
    if (isMissing(v)) return lang.t('status.awaiting');
    return it.kind === 'road' ? lang.t('water.cm', { d: F.num(v, 0) }) : F.num(v, 2) + ' ' + lang.t('water.msl');
  }

  function kindLine(it) {
    var parts = [lang.t(KIND_KEY[it.kind])];
    if (it.s.district) parts.push(it.s.district);
    return parts.join(' · ');
  }

  function statusPill(st) { return h('span', 'pill lv-' + TONE[st], lang.t('wst.' + st)); }

  /* ---------- Tiles and chips ---------- */

  function renderCounts() {
    var counts = { over: 0, crit: 0, warn: 0, normal: 0, stale: 0 };
    var kinds = { all: 0, river: 0, canal: 0, road: 0 };
    state.items.forEach(function (it) {
      if (matchesText(it)) { kinds.all++; kinds[it.kind]++; }
      if (matchesKind(it) && matchesText(it)) counts[it.status]++;
    });
    document.querySelectorAll('[data-wstat]').forEach(function (b) {
      var k = b.getAttribute('data-wstat');
      var n = b.querySelector('[data-wstat-n]');
      var prev = +n.getAttribute('data-v') || 0;
      if (prev !== counts[k] || !n.hasAttribute('data-v')) F.countUp(n, counts[k], 0, prev, 600);
      n.setAttribute('data-v', counts[k]);
      b.setAttribute('aria-pressed', String(state.status === k));
    });
    document.querySelectorAll('[data-kind-n]').forEach(function (el) {
      el.textContent = state.items.length ? F.num(kinds[el.getAttribute('data-kind-n')], 0) : '';
    });
  }

  document.querySelectorAll('[data-kind]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.kind = b.getAttribute('data-kind');
      document.querySelectorAll('[data-kind]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      refreshView(true);
    });
  });
  document.querySelectorAll('[data-wstat]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-wstat');
      state.status = state.status === k ? null : k;
      refreshView(true);
    });
  });
  $('[data-water-search]').addEventListener('input', function (e) {
    state.query = e.target.value;
    refreshView(false);
  });

  /* ---------- Map ---------- */

  var stage = $('.map-card__stage');
  var map = null;
  var selPin = null;
  var tipPopup = null;

  function geojson() {
    return {
      type: 'FeatureCollection',
      features: state.items.filter(function (it) { return hasPos(it.s); }).map(function (it) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [it.s.lon, it.s.lat] },
          properties: { id: it.id, kind: it.kind, status: it.status, color: COLOR[it.status], rank: it.rank }
        };
      })
    };
  }

  function mapFilter() {
    var ids = state.items.filter(visible).map(function (it) { return it.id; });
    return ['in', ['get', 'id'], ['literal', ids]];
  }

  function syncMap() {
    if (!map || !map.getSource('stations')) return;
    map.getSource('stations').setData(geojson());
    var f = mapFilter();
    map.setFilter('st-dot', f);
    map.setFilter('st-halo', ['all', f, ['<=', ['get', 'rank'], 1]]);
    placeSelPin();
  }

  function setupLayers(m) {
    m.addSource('stations', { type: 'geojson', data: geojson() });
    // A soft halo under stations that are overflowing or critical, so they stand out from a distance
    m.addLayer({
      id: 'st-halo',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.22,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 9, 14, 20],
        'circle-pitch-alignment': 'map'
      }
    });
    m.addLayer({
      id: 'st-dot',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          9, ['match', ['get', 'kind'], 'river', 5.5, 'canal', 4, 3.2],
          14, ['match', ['get', 'kind'], 'river', 11, 'canal', 8.5, 7]],
        'circle-stroke-color': ['match', ['get', 'kind'], 'road', '#0A303A', '#FFFFFF'],
        'circle-stroke-width': ['match', ['get', 'kind'], 'road', 1.2, 1.6]
      },
      // Worse statuses draw on top
      layout: { 'circle-sort-key': ['-', 10, ['get', 'rank']] }
    });
    syncMap();

    tipPopup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'map-tip' });
    m.on('mousemove', 'st-dot', function (e) {
      var f = e.features && e.features[0];
      var it = f && find(f.properties.id);
      if (!it) return;
      m.getCanvas().style.cursor = 'pointer';
      var box = h('div');
      box.appendChild(F.thai('strong', null, it.s.name || it.s.code));
      box.appendChild(h('span', null, valueText(it) + ' · ' + lang.t('wst.' + it.status)));
      tipPopup.setLngLat(f.geometry.coordinates).setDOMContent(box).addTo(m);
    });
    m.on('mouseleave', 'st-dot', function () {
      m.getCanvas().style.cursor = '';
      tipPopup.remove();
    });
    m.on('click', 'st-dot', function (e) {
      var f = e.features && e.features[0];
      if (f) select(f.properties.id, true);
    });
  }

  function placeSelPin() {
    var it = state.selected && find(state.selected);
    if (!map || !it || !hasPos(it.s)) { if (selPin) { selPin.remove(); selPin = null; } return; }
    if (!selPin) {
      var el = h('div', 'wpin');
      el.appendChild(h('span', 'wpin__ring'));
      el.appendChild(h('span', 'wpin__dot'));
      selPin = new window.maplibregl.Marker({ element: el });
    }
    selPin.getElement().style.setProperty('--wpin', COLOR[it.status]);
    selPin.setLngLat([it.s.lon, it.s.lat]).addTo(map);
  }

  function flyTo(it) {
    if (!map || !it || !hasPos(it.s)) return;
    map.flyTo({ center: [it.s.lon, it.s.lat], zoom: 15, pitch: 55, bearing: -20, speed: 1.1, curve: 1.4 });
  }

  function showAll(m, animate) {
    m.fitBounds(BANGKOK, { padding: 30, pitch: 0, bearing: 0, duration: animate ? 1100 : 0 });
  }

  GW.maps.create(stage, { bounds: BANGKOK, onReset: function (m) { showAll(m, true); } }).then(function (m) {
    map = m;
    if (!m) return;
    setupLayers(m);
  });

  /* ---------- Detail ---------- */

  var detail = $('[data-wdetail]');
  var shownLevel = null;

  var WAVE = (function () {
    var d = 'M-120 0';
    for (var x = -120; x < 240; x += 40) d += ' q10 -4 20 0 t20 0';
    return d + ' V260 H-120 Z';
  })();

  // A staff gauge: water rises to the reading, with the bank and the control levels drawn as lines
  function gauge(it) {
    var s = it.s;
    var v = valueOf(s);
    var road = it.kind === 'road';
    var lines = [];
    var lo, hi;
    if (road) {
      lo = 0;
      hi = Math.max(40, (v || 0) + 10);
      lines = [{ v: 30, cls: 'bank', label: '30' }, { v: 10, cls: 'crit', label: '10' }, { v: 5, cls: 'warn', label: '5' }];
    } else {
      if (!isMissing(s.bank) && s.bank > 0) lines.push({ v: s.bank, cls: 'bank', label: F.num(s.bank, 2) });
      if (!isMissing(s.crit)) lines.push({ v: s.crit, cls: 'crit', label: F.num(s.crit, 2) });
      if (!isMissing(s.warn)) lines.push({ v: s.warn, cls: 'warn', label: F.num(s.warn, 2) });
      var vals = lines.map(function (l) { return l.v; }).concat(isMissing(v) ? [] : [v]);
      lo = Math.min.apply(null, vals.concat([0])) - 0.4;
      hi = Math.max.apply(null, vals.concat([0.5])) + 0.4;
    }
    var H = 220;
    function y(val) { return H - (val - lo) / (hi - lo) * H; }
    var ticks = '';
    for (var i = 1; i < 10; i++) ticks += '<line class="gauge__tick" x1="0" x2="' + (i % 5 ? 10 : 18) + '" y1="' + (i * H / 10) + '" y2="' + (i * H / 10) + '"/>';
    var lineSvg = lines.map(function (l) {
      var yy = y(l.v).toFixed(1);
      return '<line class="gauge__line gauge__line--' + l.cls + '" x1="0" x2="120" y1="' + yy + '" y2="' + yy + '"/>' +
        '<text class="gauge__label" x="116" y="' + (yy - 4) + '" text-anchor="end">' + l.label + '</text>';
    }).join('');
    var wrap = h('div', 'gauge');
    wrap.innerHTML = '<svg viewBox="0 0 120 ' + H + '" aria-hidden="true">' +
      '<defs><clipPath id="gauge-clip"><rect x="1" y="1" width="118" height="' + (H - 2) + '" rx="8"/></clipPath></defs>' +
      '<g clip-path="url(#gauge-clip)"><rect class="gauge__bg" x="0" y="0" width="120" height="' + H + '"/>' +
      '<g class="gauge__water"><path class="gauge__wave" d="' + WAVE + '"/></g>' + ticks + lineSvg + '</g>' +
      '<rect class="gauge__frame" x="1" y="1" width="118" height="' + (H - 2) + '" rx="8"/></svg>';
    var water = wrap.querySelector('.gauge__water');
    var target = isMissing(v) ? H : Math.max(0, Math.min(H, y(v)));
    var from = shownLevel === null ? H : shownLevel;
    water.style.transform = 'translateY(' + from + 'px)';
    requestAnimationFrame(function () { requestAnimationFrame(function () { water.style.transform = 'translateY(' + target + 'px)'; }); });
    shownLevel = target;
    return wrap;
  }

  function stat(dl, label, value) {
    var row = h('div', 'dstat');
    row.appendChild(h('dt', null, label));
    row.appendChild(h('dd', null, value));
    dl.appendChild(row);
  }

  function renderDetail(animate) {
    var it = state.selected && find(state.selected);
    detail.textContent = '';
    if (!it) {
      if (state.items.length || KINDS.every(function (k) { return state.data[k] || state.errors[k]; })) {
        detail.appendChild(h('p', 'wdetail__empty', state.items.length ? lang.t('water.pick') : lang.t('water.error')));
      }
      return;
    }
    var s = it.s;
    var v = valueOf(s);
    var road = it.kind === 'road';
    detail.classList.remove('is-swapping');
    if (animate && !F.reduceMotion()) { void detail.offsetWidth; detail.classList.add('is-swapping'); }

    detail.appendChild(h('p', 'wdetail__eyebrow', lang.t(KIND_KEY[it.kind])));
    detail.appendChild(F.thai('h2', 'wdetail__name', s.name || s.code));
    if (s.district) detail.appendChild(F.thai('p', 'wdetail__sub', s.district));
    detail.appendChild(statusPill(it.status));

    var hero = h('div', 'whero');
    hero.appendChild(gauge(it));
    var text = h('div');
    var big = h('p', 'whero__num');
    var num = h('span', 'whero__value');
    big.appendChild(num);
    if (isMissing(v)) num.textContent = lang.t('status.awaiting');
    else {
      F.countUp(num, v, road ? 0 : 2, animate ? (road ? 0 : v - 0.5) : v, 800);
      big.appendChild(h('span', 'whero__unit', road ? lang.t('water.cm', { d: '' }).trim() : lang.t('water.msl')));
    }
    text.appendChild(big);
    text.appendChild(h('p', 'dam-hero__label', lang.t(road ? 'water.depth' : 'water.level')));
    if (!road && !isMissing(v)) {
      var note;
      if (!isMissing(s.bank) && s.bank > 0) {
        var gap = s.bank - v;
        note = h('p', 'whero__note lv-' + TONE[it.status === 'stale' ? 'stale' : it.status],
          lang.t(gap >= 0 ? 'water.toBank' : 'water.overBank', { d: F.num(Math.abs(gap), 2) }));
      } else {
        note = h('p', 'whero__note lv-grey', lang.t('water.noBank'));
      }
      text.appendChild(note);
    }
    hero.appendChild(text);
    detail.appendChild(hero);

    var dl = h('dl', 'dstats');
    if (!road) {
      if (!isMissing(s.bank) && s.bank > 0) stat(dl, lang.t('water.bank'), F.num(s.bank, 2) + ' ' + lang.t('water.msl'));
      if (!isMissing(s.crit)) stat(dl, lang.t('water.critLv'), F.num(s.crit, 2) + ' ' + lang.t('water.msl'));
      if (!isMissing(s.warn)) stat(dl, lang.t('water.warnLv'), F.num(s.warn, 2) + ' ' + lang.t('water.msl'));
    }
    stat(dl, lang.t('water.code'), String(s.code).replace(/^bma:/, ''));
    detail.appendChild(dl);
    if (it.status === 'stale') detail.appendChild(h('p', 'wdetail__stale', lang.t('water.stale')));
    detail.appendChild(h('p', 'dam-detail__asof card__time', F.updated(s.measured_at)));
  }

  /* ---------- List ---------- */

  var listEl = $('[data-wlist]');
  var moreBtn = $('[data-wlist-more]');

  function renderList(animate) {
    var vis = state.items.filter(visible);
    listEl.textContent = '';
    $('[data-wlist-empty]').hidden = !!vis.length || !state.items.length;
    $('[data-wlist-sub]').textContent = state.items.length ? lang.t('water.count', { n: F.num(vis.length, 0) }) + ' · ' + lang.t('water.listSub') : '';
    var shown = state.showAll ? vis : vis.slice(0, LIST_SHORT);
    shown.forEach(function (it, i) {
      var li = h('li', 'wrow' + (it.id === state.selected ? ' is-selected' : ''));
      if (animate && !F.reduceMotion()) { li.classList.add('is-in'); li.style.setProperty('--i', Math.min(i, 12)); }
      li.style.setProperty('--wst', COLOR[it.status]);
      var b = h('button', 'wrow__btn');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(it.id === state.selected));
      b.appendChild(h('span', 'wrow__dot'));
      var name = F.thai('span', 'wrow__name', it.s.name || it.s.code);
      name.appendChild(h('span', 'wrow__kind', kindLine(it)));
      b.appendChild(name);
      var val = h('span', 'wrow__value', valueText(it));
      val.appendChild(h('small', null, F.time(it.s.measured_at) || ''));
      b.appendChild(val);
      b.appendChild(statusPill(it.status));
      b.addEventListener('click', function () { select(it.id, true, true); });
      li.appendChild(b);
      listEl.appendChild(li);
    });
    moreBtn.hidden = vis.length <= LIST_SHORT;
    moreBtn.textContent = state.showAll ? lang.t('water.showLess') : lang.t('water.showAll', { n: F.num(vis.length, 0) });
  }

  moreBtn.addEventListener('click', function () {
    state.showAll = !state.showAll;
    renderList(false);
  });

  /* ---------- Selection ---------- */

  function select(id, animate, fromList) {
    var changed = id !== state.selected;
    state.selected = id;
    if (changed) shownLevel = null;
    renderDetail(animate && changed);
    renderList(false);
    placeSelPin();
    if (animate && changed) flyTo(find(id));
    if (fromList && window.matchMedia('(max-width: 1180px)').matches) {
      stage.scrollIntoView({ behavior: F.reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    }
  }

  function refreshView(animateList) {
    renderCounts();
    renderList(animateList);
    syncMap();
  }

  /* ---------- Test sensor (ESP32) ---------- */

  function renderKit() {
    var box = $('[data-kit]');
    var list = state.kit || [];
    box.hidden = !list.length;
    if (!list.length) return;
    var body = $('[data-kit-body]');
    body.textContent = '';
    list.forEach(function (s) {
      var row = h('div', 'kit-row');
      var left = h('div');
      left.appendChild(F.thai('p', 'wrow__name', s.name || s.code));
      left.appendChild(h('p', 'wrow__kind', s.code));
      row.appendChild(left);
      row.appendChild(h('p', 'whero__value', isMissing(s.water_level) ? lang.t('status.awaiting') : lang.t('water.cm', { d: F.num(s.water_level * 100, 1) })));
      var tone = { green: 'green', yellow: 'yellow', red: 'red' }[s.status] || 'grey';
      row.appendChild(h('span', 'pill lv-' + tone, s.status ? lang.t('kit.' + s.status) : lang.t('status.awaiting')));
      body.appendChild(row);
      $('[data-kit-time]').textContent = F.updated(s.measured_at);
    });
  }

  function loadKit() {
    if (state.kit && GW.hold && GW.hold.active()) return Promise.resolve();
    return GW.request('/stations/latest?kind=canal&scope=bangkok_test', { auth: false }).then(function (list) {
      state.kit = list || [];
    }, function () { state.kit = null; }).then(renderKit);
  }

  /* ---------- Status pill ---------- */

  var statusEl = $('[data-status]');
  var connecting = false;

  function renderStatus() {
    var modes = Object.keys(state.modes).map(function (k) { return state.modes[k]; });
    var sim = state.items.some(function (it) { return it.s.source === 'sim'; });
    var mode, text;
    if (modes.indexOf('sample') >= 0) { mode = 'sample'; text = lang.t('status.sample'); }
    else if (sim) { mode = 'sim'; text = lang.t('status.sim'); }
    else if (modes.length) { mode = 'live'; text = lang.t('status.live'); }
    else if (connecting) { mode = 'connecting'; text = lang.t('status.connecting'); }
    else { statusEl.textContent = ''; return; }
    statusEl.setAttribute('data-mode', mode);
    statusEl.textContent = text;
    if (mode === 'sample') statusEl.title = lang.t('status.sampleHint', { url: GW.BASE_URL }); else statusEl.removeAttribute('title');
  }

  function renderTime() {
    var newest = null;
    state.items.forEach(function (it) { if (it.s.measured_at && (!newest || it.s.measured_at > newest)) newest = it.s.measured_at; });
    var t = newest ? F.updated(newest) : '';
    $('[data-water-time]').textContent = t;
    $('[data-wlist-time]').textContent = t;
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
    loadKit();
  });

  function load() {
    if (state.listShown && heldBack()) return Promise.resolve();
    return Promise.all(KINDS.map(function (k) {
      return GW.load('/stations/latest?kind=' + k, SAMPLE[k], {
        auth: false,
        onSlow: function () { connecting = true; renderStatus(); }
      }).then(function (res) {
        state.data[k] = res.data || [];
        state.modes[k] = res.mode;
        state.errors[k] = null;
      }, function (err) { state.errors[k] = err; });
    })).then(function () {
      var first = !state.listShown;
      build();
      if (state.selected && !find(state.selected)) state.selected = null;
      // Start on the most urgent station so the page opens on what matters
      if (first && !state.selected) {
        var inView = state.items.filter(function (it) {
          return it.status !== 'stale' && hasPos(it.s) &&
            it.s.lon >= BANGKOK[0][0] && it.s.lon <= BANGKOK[1][0] && it.s.lat >= BANGKOK[0][1] && it.s.lat <= BANGKOK[1][1];
        });
        if (inView.length) state.selected = inView[0].id;
      }
      renderCounts();
      renderList(first && state.items.length > 0);
      renderDetail(first);
      renderTime();
      renderStatus();
      syncMap();
      if (state.items.length) state.listShown = true;
      if (Object.keys(state.modes).some(function (k) { return state.modes[k] === 'live'; })) GW.pulse();
      var onSample = Object.keys(state.modes).some(function (k) { return state.modes[k] === 'sample'; });
      if (onSample && !retryTimer) retryTimer = setTimeout(function () { retryTimer = 0; load(); }, 15000);
    });
  }

  document.addEventListener('gw:lang', function () {
    renderCounts();
    renderList(false);
    renderDetail(false);
    renderTime();
    renderStatus();
    renderKit();
  });

  load();
  loadKit();
  setInterval(function () { if (!document.hidden) { load(); loadKit(); } }, REFRESH_MS);
})(window.GW = window.GW || {});
