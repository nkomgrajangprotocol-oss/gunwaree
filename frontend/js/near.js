/* GunWaree Home: "Conditions near you".

   The visitor presses the button, the browser asks for their location, and the dialog shows the
   gauges closest to them. Everything is worked out in this browser from data the page already has
   (js/home.js) plus GET /stations/latest?kind=road. The location is never sent anywhere, never
   stored (not even in localStorage) and is dropped when the dialog closes.

   Rules from the plan: ask for the location only on a button press; skip stations without
   coordinates and never treat (0, 0) as one; show the distance and measured_at next to every value;
   null is "Awaiting report"; nothing within 15 km means outside Bangkok; when location is refused,
   unavailable or slow, the visitor picks a district instead; the sample location is always labelled;
   the Ayutthaya card is about northern runoff, not the visitor's spot, and shows a level, not a percent. */

(function (GW) {
  'use strict';

  var dialog = document.querySelector('[data-near]');
  var openBtn = document.querySelector('[data-near-open]');
  if (!dialog || !openBtn || !GW.home || typeof dialog.showModal !== 'function') {
    if (openBtn) openBtn.hidden = true;
    return;
  }

  var L = GW.lang;
  var H = GW.home;
  var h = H.h;
  var thai = H.thai;

  var RANGE_KM = 15;             // nearest gauge further than this: outside the covered area
  var ROADS_TTL_MS = 60 * 1000;  // road gauges refresh every 60 s, like the other station data
  var SAMPLE = { lat: 13.7445, lon: 100.5300, name: { en: 'Pathum Wan district', th: 'เขตปทุมวัน' } };

  var body = dialog.querySelector('[data-near-body]');
  var select = dialog.querySelector('[data-near-select]');
  var pickForm = dialog.querySelector('[data-near-pick]');

  // What the dialog shows. The coordinates live only in this variable while the dialog is open.
  // mode: locating | mine | sample | district | failed
  var view = null;
  var ask = 0;   // bumped on close so a late geolocation answer is ignored

  var roads = { list: null, mode: null, at: 0, error: null, pending: null };

  /* ---------- Data ---------- */

  function loadRoads() {
    if (roads.list && Date.now() - roads.at < ROADS_TTL_MS) return Promise.resolve();
    if (roads.pending) return roads.pending;
    roads.pending = GW.load('/stations/latest?kind=road', 'stations-road.json', { auth: false }).then(function (res) {
      roads.list = res.data || [];
      roads.mode = res.mode;
      roads.at = Date.now();
      roads.error = null;
    }, function (err) {
      roads.error = err;
    }).then(function () {
      roads.pending = null;
      render();
    });
    return roads.pending;
  }

  function hasPos(s) {
    return typeof s.lat === 'number' && typeof s.lon === 'number' && isFinite(s.lat) && isFinite(s.lon) &&
      !(s.lat === 0 && s.lon === 0);
  }

  function km(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Stations sorted by distance from a point, each as { s, km }
  function byDistance(list, at) {
    return (list || []).filter(hasPos)
      .map(function (s) { return { s: s, km: km(at.lat, at.lon, s.lat, s.lon) }; })
      .sort(function (a, b) { return a.km - b.km; });
  }

  // The closest station that is reporting a value; if none is, the closest one at all
  function nearestReporting(list, at, field) {
    var all = byDistance(list, at);
    for (var i = 0; i < all.length; i++) if (all[i].s[field] !== null && all[i].s[field] !== undefined) return all[i];
    return all[0] || null;
  }

  function findDistrict(name) {
    var list = H.data.districts || [];
    for (var i = 0; i < list.length; i++) if (list[i].district === name) return list[i];
    return null;
  }

  /* ---------- Small view helpers ---------- */

  function isMissing(v) { return v === null || v === undefined; }

  function kmText(d) { return L.t('near.km', { km: H.fmtNum(d, 1) }); }

  function meta(parts) {
    return h('p', 'near-row__meta', parts.filter(Boolean).join(' · '));
  }

  function section(titleKey) {
    var sec = h('section', 'near-sec');
    sec.appendChild(h('h3', 'near-sec__title', L.t(titleKey)));
    body.appendChild(sec);
    return sec;
  }

  function row(sec, nameEl, valueEl, metaParts) {
    var r = h('div', 'near-row');
    var left = h('div', 'near-row__main');
    left.appendChild(nameEl);
    left.appendChild(meta(metaParts));
    r.appendChild(left);
    r.appendChild(valueEl);
    sec.appendChild(r);
    return r;
  }

  function value(text, tone) {
    return h('p', 'near-row__value' + (tone ? ' lv-' + tone : ''), text);
  }

  function stationName(s, withDistrict) {
    var p = h('p', 'near-row__name');
    p.appendChild(thai('span', null, s.name || s.code));
    if (withDistrict && s.district) {
      p.appendChild(document.createTextNode(' '));
      p.appendChild(thai('span', 'near-row__district', s.district));
    }
    return p;
  }

  // A sentence with a place name inside it. Thai names are marked as Thai text.
  function withPlace(cls, key, name, isThai) {
    if (!isThai) return h('p', cls, L.t(key, { station: name }));
    return H.sentenceWithPlace(cls, key, name);
  }

  function status(key) {
    body.appendChild(h('p', 'near__status', L.t(key)));
  }

  function notice(text) {
    body.appendChild(h('p', 'near__notice', text));
  }

  /* ---------- Sections ---------- */

  function roadSection(items, inDistrict) {
    var sec = section(inDistrict ? 'near.roadsDistrict' : 'near.roads');
    if (!items.length) {
      sec.appendChild(h('p', 'near-row__meta', L.t('near.noRoads')));
      return;
    }
    items.forEach(function (it) {
      var s = it.s;
      var v = isMissing(s.depth_cm)
        ? value(L.t('status.awaiting'), 'grey')
        : value(L.t('near.cm', { d: H.fmtNum(s.depth_cm, 0) }), s.depth_cm > 10 ? 'orange' : s.depth_cm >= 5 ? 'yellow' : 'green');
      row(sec, stationName(s, !inDistrict), v, [it.km === undefined ? null : kmText(it.km), H.updated(s.measured_at)]);
    });
  }

  function districtSection(name) {
    if (!name) return;
    var sec = h('section', 'near-sec');
    sec.appendChild(withPlace('near-sec__title', 'near.district', name, true));
    body.appendChild(sec);

    var d = findDistrict(name);
    var r = h('div', 'near-row');
    var left = h('div', 'near-row__main');
    if (!d || d.level === 'nodata' || isMissing(d.max_depth_cm)) {
      left.appendChild(h('p', 'near-row__name', '-'));
      left.appendChild(meta([d ? H.levelLabel('nodata') : L.t('status.awaiting')]));
      r.appendChild(left);
    } else {
      var tone = H.DISTRICT_TONE[d.level] || 'grey';
      left.appendChild(h('p', 'near-row__name', L.t('watch.depth', { d: H.fmtNum(d.max_depth_cm, 0) })));
      left.appendChild(meta([L.t('watch.points', { n: d.road_points }), H.updated(d.measured_at)]));
      r.appendChild(left);
      r.appendChild(h('span', 'pill lv-' + tone, H.levelLabel(d.level)));
    }
    sec.appendChild(r);
  }

  function waterSection(at) {
    var sec = section('near.water');
    var it = at && nearestReporting((H.data.canal || []).concat(H.data.river || []), at, 'water_level');
    if (!it) { sec.appendChild(h('p', 'near-row__meta', L.t('status.awaiting'))); return; }
    var s = it.s;
    var wrap = h('div', 'near-row__value');
    if (isMissing(s.water_level)) {
      wrap.appendChild(h('span', 'lv-grey', L.t('status.awaiting')));
    } else {
      wrap.appendChild(h('span', null, H.fmtNum(s.water_level, 2) + ' ' + H.unit('m')));
      var note;
      if (isMissing(s.bank) || s.bank <= 0) note = h('span', 'near-row__sub lv-grey', L.t('near.noBank'));
      else if (s.water_level >= s.bank) note = h('span', 'near-row__sub lv-red', L.t('near.atBank'));
      else {
        var gap = s.bank - s.water_level;
        note = h('span', 'near-row__sub ' + (gap <= 0.3 ? 'lv-orange' : 'lv-green'), L.t('near.belowBank', { d: H.fmtNum(gap, 2) }));
      }
      wrap.appendChild(note);
    }
    var bank = !isMissing(s.bank) && s.bank > 0 ? L.t('near.bank', { bank: H.fmtNum(s.bank, 2) }) : null;
    row(sec, stationName(s, false), wrap, [kmText(it.km), bank, H.updated(s.measured_at)]);
  }

  function rainSection(at, districtName) {
    var sec = section('near.rain');
    var it = at ? nearestReporting(H.data.rain, at, 'rain_24h') : null;
    if (!it && districtName) {
      // A district without road gauges has no middle point; use a rain gauge in that district if there is one
      var inDistrict = (H.data.rain || []).filter(function (s) { return s.district === districtName; });
      if (inDistrict.length) it = { s: inDistrict[0] };
    }
    if (!it) { sec.appendChild(h('p', 'near-row__meta', L.t('status.awaiting'))); return; }
    var s = it.s;
    var v = isMissing(s.rain_24h) ? value(L.t('status.awaiting'), 'grey') : value(H.fmtNum(s.rain_24h, 1) + ' ' + H.unit('mm'));
    row(sec, stationName(s, true), v, [it.km === undefined ? null : kmText(it.km), H.updated(s.measured_at)]);
  }

  function northSection() {
    var sec = section('near.north');
    var r = H.data.risk;
    var left = h('div', 'near-row__main');
    var rowEl = h('div', 'near-row');
    left.appendChild(h('p', 'near-row__name', L.t('near.rule')));
    if (r) {
      left.appendChild(meta([L.t('risk.target'), H.updated(r.created_at)]));
      rowEl.appendChild(left);
      var tone = (H.RISK[r.level] || H.RISK.none).tone;
      rowEl.appendChild(h('span', 'pill lv-' + tone, H.levelLabel(r.level)));
    } else {
      left.appendChild(meta([r === null ? L.t('risk.nodata') : L.t('status.awaiting')]));
      rowEl.appendChild(left);
    }
    sec.appendChild(rowEl);
  }

  function alertSection() {
    var sec = section('near.alert');
    var al = H.data.alerts && H.data.alerts[0];
    if (!al) { sec.appendChild(h('p', 'near-row__meta', L.t('near.noAlert'))); return; }
    var left = h('div', 'near-row__main');
    left.appendChild(thai('p', 'near-row__name', al.message));
    left.appendChild(meta([H.levelLabel(al.severity), al.sent_at ? H.fmtTime(al.sent_at) : null]));
    var rowEl = h('div', 'near-row');
    rowEl.appendChild(left);
    sec.appendChild(rowEl);
  }

  /* ---------- Render ---------- */

  function fillSelect() {
    var list = H.data.districts;
    var keep = select.value;
    select.textContent = '';
    var first = h('option', null, L.t('near.pickNone'));
    first.value = '';
    select.appendChild(first);
    (list || []).map(function (d) { return d.district; })
      .sort(function (a, b) { return a.localeCompare(b, 'th'); })
      .forEach(function (name) {
        var o = h('option', null, name);
        o.value = name;
        o.lang = 'th';
        select.appendChild(o);
      });
    select.value = keep;
  }

  function onSample() {
    return roads.mode === 'sample' || Object.keys(H.modes).some(function (k) { return H.modes[k] === 'sample'; });
  }

  function render() {
    if (!dialog.open || !view) return;
    body.textContent = '';
    if (select.options.length < 2) fillSelect();

    if (view.mode === 'locating') { status('near.locating'); return; }
    if (view.mode === 'failed') { notice(L.t('near.' + view.reason)); return; }
    if (!roads.list) {
      if (roads.error) notice(L.t('near.error'));
      else status('near.loading');
      return;
    }

    // Where the readings are measured from
    var at = null;
    var where;
    if (view.mode === 'mine') {
      at = view;
      where = h('p', 'near__where', L.t('near.whereMine'));
    } else if (view.mode === 'sample') {
      at = view;
      where = withPlace('near__where', 'near.whereSample', L.pick(SAMPLE.name), L.get() === 'th');
      where.insertBefore(h('span', 'near__tag', L.t('near.sampleTag')), where.firstChild);
    } else {
      where = withPlace('near__where', 'near.whereDistrict', view.district, true);
    }
    body.appendChild(where);
    if (onSample()) notice(L.t('status.sample'));

    if (view.mode === 'district') {
      var inDistrict = roads.list.filter(function (s) { return s.district === view.district && hasPos(s); });
      if (inDistrict.length) {
        at = {
          lat: inDistrict.reduce(function (t, s) { return t + s.lat; }, 0) / inDistrict.length,
          lon: inDistrict.reduce(function (t, s) { return t + s.lon; }, 0) / inDistrict.length
        };
        body.appendChild(h('p', 'near-row__meta', L.t('near.fromCentre')));
      }
      var deepest = inDistrict.slice().sort(function (a, b) { return (b.depth_cm === null ? -1 : b.depth_cm) - (a.depth_cm === null ? -1 : a.depth_cm); });
      roadSection(deepest.slice(0, 3).map(function (s) { return { s: s }; }), true);
      districtSection(view.district);
      waterSection(at);
      rainSection(at, view.district);
    } else {
      var nearRoads = byDistance(roads.list, at);
      var water = nearestReporting((H.data.canal || []).concat(H.data.river || []), at, 'water_level');
      var rain = nearestReporting(H.data.rain, at, 'rain_24h');
      var closest = [nearRoads[0], water, rain].filter(Boolean).map(function (x) { return x.km; });
      if (!closest.length || Math.min.apply(null, closest) > RANGE_KM) {
        notice(L.t('near.outside'));
        return;
      }
      roadSection(nearRoads.slice(0, 3), false);
      districtSection(nearRoads[0] && nearRoads[0].s.district);
      waterSection(at);
      rainSection(at);
    }
    northSection();
    alertSection();
  }

  /* ---------- Actions ---------- */

  function show(next) {
    view = next;
    render();
    if (next.mode !== 'locating' && next.mode !== 'failed') loadRoads();
  }

  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) { show({ mode: 'failed', reason: 'insecure' }); return; }
    var mine = ++ask;
    show({ mode: 'locating' });
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (mine !== ask) return;
      show({ mode: 'mine', lat: pos.coords.latitude, lon: pos.coords.longitude });
    }, function (err) {
      if (mine !== ask) return;
      var reason = err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable';
      show({ mode: 'failed', reason: reason });
    }, { timeout: 10000, maximumAge: 0, enableHighAccuracy: false });
  }

  openBtn.addEventListener('click', function () {
    fillSelect();
    dialog.showModal();
    loadRoads();   // start the download while the browser asks for permission
    locate();
  });

  dialog.querySelector('[data-near-mine]').addEventListener('click', locate);
  dialog.querySelector('[data-near-sample]').addEventListener('click', function () {
    ask++;
    show({ mode: 'sample', lat: SAMPLE.lat, lon: SAMPLE.lon });
  });
  pickForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!select.value) { select.focus(); return; }
    ask++;
    show({ mode: 'district', district: select.value });
  });

  dialog.querySelector('[data-near-close]').addEventListener('click', function () { dialog.close(); });
  // A click on the dimmed area outside the panel closes it too (Esc is handled by <dialog>)
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', function () {
    if (dialog.open) return;   // the close event is queued; ignore it if the dialog was reopened first
    ask++;
    view = null;   // forget the location
    body.textContent = '';
    openBtn.focus();
  });

  document.addEventListener('gw:data', function (e) {
    if (e.detail && e.detail.key === 'districts') fillSelect();
    render();
  });
  document.addEventListener('gw:lang', function () {
    fillSelect();
    render();
  });
})(window.GW = window.GW || {});
