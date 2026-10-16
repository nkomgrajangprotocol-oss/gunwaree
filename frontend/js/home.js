/* GunWaree Home: the flood overview, built only from our backend.

   Endpoint                         Refresh        Card
   GET /risk                        5 minutes      risk score in the hero, advisory banner
   GET /districts/latest            60 seconds     district level counts, districts to watch
   GET /stations/latest?kind=river  60 seconds     Chao Phraya at Bangkok Bridge, Ayutthaya reading
   GET /stations/latest?kind=canal  60 seconds     Bangkok canals near or over their banks
   GET /stations/latest?kind=rain   60 seconds     rainfall
   GET /dams/latest                 30 minutes     dam storage (daily data)
   GET /alerts                      30 seconds     alert banner (polled by js/shell.js, which also runs the bell)

   Rules from the plan: null is shown as "Awaiting report", never 0; every reading shows its time
   (already Thai time, never converted); dam data is labelled as daily; the risk score is a
   level from a simple rule (B2), not a percentage, an AI model or an official warning. When the backend cannot be reached,
   snapshots from /sample are shown and the page says so. */

(function (GW) {
  'use strict';

  var L = GW.lang;

  var RISK = {
    none: { tone: 'green', step: 1 },
    watch: { tone: 'yellow', step: 2 },
    warning: { tone: 'orange', step: 3 },
    critical: { tone: 'red', step: 4 }
  };
  var DISTRICT_LEVELS = [['danger', 'red'], ['high', 'orange'], ['medium', 'yellow'], ['safe', 'green'], ['nodata', 'grey']];
  var DISTRICT_TONE = { danger: 'red', high: 'orange', medium: 'yellow', safe: 'green', nodata: 'grey' };
  var SEVERITY_TONE = { watch: 'yellow', warning: 'orange', critical: 'red' };
  var STATION_BANGKOK_BRIDGE = '4';
  var STATION_AYUTTHAYA = '39';

  var UNITS = {
    m: { en: 'm', th: 'ม.' },
    mm: { en: 'mm', th: 'มม.' }
  };

  var ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5M12 17.2v.3" stroke-linecap="round"/></svg>';

  // What the page knows. undefined = still loading.
  var data = { risk: undefined, districts: undefined, river: undefined, canal: undefined, rain: undefined, dams: undefined, alerts: null };
  var errors = {};
  var modes = {};
  var connecting = false;

  /* ---------- Small helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // Place names and alert messages come from the backend in Thai
  function thai(tag, cls, text) {
    var e = h(tag, cls, text);
    e.lang = 'th';
    return e;
  }

  function locale() { return L.get() === 'th' ? 'th-TH' : 'en-GB'; }
  function unit(k) { return L.pick(UNITS[k]); }

  function fmtNum(v, digits) {
    return Number(v).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // "YYYY-MM-DD HH:MM:SS" (Thai time) or "YYYY-MM-DD", formatted without any time-zone shift
  function fmtTime(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || '');
    if (!m) return null;
    var hasTime = m[4] !== undefined;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 0, hasTime ? +m[5] : 0));
    var opts = hasTime
      ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }
      : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat(locale(), opts).format(d);
  }

  function updated(s) {
    var t = fmtTime(s);
    return t ? L.t('status.updated', { time: t }) : '';
  }

  function latestTime(list, key) {
    var best = null;
    (list || []).forEach(function (x) { if (x[key] && (!best || x[key] > best)) best = x[key]; });
    return best;
  }

  function levelLabel(level) {
    return GW.t.levels[level] ? L.pick(GW.t.levels[level]) : level;
  }

  function placeName(name) {
    return L.get() === 'en' && GW.PLACE_EN[name] ? GW.PLACE_EN[name] : name;
  }

  // A sentence with one Thai place name inside it, keeping the name marked as Thai
  function sentenceWithPlace(cls, key, place) {
    var p = h('p', cls);
    var bits = L.t(key, { station: '\u0000' }).split('\u0000');
    p.appendChild(document.createTextNode(bits[0]));
    p.appendChild(thai('span', null, place));
    if (bits[1]) p.appendChild(document.createTextNode(bits[1]));
    return p;
  }

  function awaiting(body) {
    body.appendChild(h('p', 'metric__awaiting', L.t('status.awaiting')));
  }

  function cardError(body) {
    body.appendChild(h('p', 'card__error', L.t('error.card')));
  }

  function findStation(list, code) {
    for (var i = 0; list && i < list.length; i++) if (String(list[i].code) === code) return list[i];
    return null;
  }

  /* ---------- Risk (hero card) ---------- */

  function renderRisk() {
    var card = $('[data-card="risk"]');
    if (data.risk === undefined && !errors.risk) return;
    card.textContent = '';
    card.appendChild(h('p', 'card__label', L.t('risk.label')));

    if (!data.risk) {
      var row0 = h('div', 'risk-card__row');
      row0.appendChild(h('p', 'risk-card__level risk-card__level--msg lv-grey', data.risk === null ? L.t('risk.nodata') : L.t('error.card')));
      card.appendChild(row0);
      card.appendChild(h('p', 'risk-card__meta', L.t('risk.target')));
      return;
    }

    var r = data.risk;
    var meta = RISK[r.level] || RISK.none;

    // Sample data (the server could not be reached): labelled on the card, never shown as the current level
    if (modes.risk === 'sample') {
      card.appendChild(h('p', 'sample-tag', L.t('sample.badge')));
      var rowS = h('div', 'risk-card__row');
      rowS.appendChild(h('p', 'risk-card__level risk-card__level--msg lv-grey', L.t('sample.level', { level: levelLabel(r.level) })));
      card.appendChild(rowS);
      card.appendChild(h('p', 'risk-card__desc', L.t('sample.notCurrent')));
      card.appendChild(h('p', 'risk-card__meta', L.t('risk.target')));
      return;
    }

    var row = h('div', 'risk-card__row');
    // A level from rule B2, not a probability: no percentage is shown (risk_percent is only 0, 33, 67 or 100)
    row.appendChild(h('p', 'risk-card__level lv-' + meta.tone, levelLabel(r.level)));
    card.appendChild(row);
    card.appendChild(h('p', 'risk-card__desc', L.t('risk.desc.' + r.level)));

    var scale = h('div', 'scale');
    scale.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 4; i++) scale.appendChild(h('span', i < meta.step ? 'on-' + meta.tone : ''));
    card.appendChild(scale);

    card.appendChild(h('p', 'risk-card__meta', L.t('risk.target')));
    card.appendChild(h('p', 'risk-card__meta', L.t('risk.how')));
    var ay = findStation(data.river, STATION_AYUTTHAYA);
    if (ay && ay.water_level !== null && ay.bank !== null) {
      card.appendChild(h('p', 'risk-card__meta', L.t('risk.reading', { wl: fmtNum(ay.water_level, 2), bank: fmtNum(ay.bank, 2) })));
    }
    var foot = h('p', 'risk-card__meta');
    foot.appendChild(document.createTextNode(updated(r.created_at) + '. '));
    foot.appendChild(h('strong', null, L.t('risk.official')));
    card.appendChild(foot);
  }

  /* ---------- Banner: a sent alert, or an advisory when the score is high ---------- */

  function renderBanner() {
    var banner = $('[data-banner]');
    var alert = data.alerts && data.alerts.length ? data.alerts[0] : null;
    var r = data.risk;
    var high = r && modes.risk !== 'sample' && (r.level === 'warning' || r.level === 'critical');

    banner.textContent = '';
    if (!alert && !high) {
      banner.hidden = true;
      return;
    }

    var bodyEl = h('div', 'banner__body');
    var metaText;
    if (alert) {
      banner.setAttribute('data-tone', SEVERITY_TONE[alert.severity] || 'yellow');
      bodyEl.appendChild(h('p', 'banner__title', L.t('banner.alert')));
      bodyEl.appendChild(thai('p', 'banner__text', alert.message));
      metaText = levelLabel(alert.severity) + (alert.sent_at ? ', ' + fmtTime(alert.sent_at) : '');
    } else {
      banner.setAttribute('data-tone', RISK[r.level].tone);
      bodyEl.appendChild(h('p', 'banner__title', L.t('banner.advisory', { level: levelLabel(r.level) })));
      bodyEl.appendChild(h('p', 'banner__text', L.t('banner.guidance')));
      metaText = L.t('risk.official');
    }
    banner.insertAdjacentHTML('afterbegin', ICON_WARN);
    banner.appendChild(bodyEl);
    banner.appendChild(h('p', 'banner__meta', metaText));
    banner.hidden = false;
  }

  /* ---------- Districts ---------- */

  function renderDistricts() {
    var card = $('[data-card="districts"]');
    var list = data.districts;
    if (list === undefined && !errors.districts) return;
    var ul = $('[data-levels]', card);
    ul.textContent = '';
    if (!list) {
      ul.appendChild(h('li', 'card__error', L.t('error.card')));
      return;
    }
    var counts = {};
    list.forEach(function (d) { counts[d.level] = (counts[d.level] || 0) + 1; });
    DISTRICT_LEVELS.forEach(function (pair) {
      var n = counts[pair[0]] || 0;
      var li = h('li', 'level-chip level-chip--' + pair[1]);
      li.appendChild(h('p', 'level-chip__name', levelLabel(pair[0])));
      li.appendChild(h('p', 'level-chip__count', n === 1 ? L.t('districts.count1') : L.t('districts.count', { n: n })));
      ul.appendChild(li);
    });
    $('[data-time]', card).textContent = updated(latestTime(list, 'measured_at'));
  }

  function renderWatch() {
    var card = $('[data-card="watch"]');
    var list = data.districts;
    if (list === undefined && !errors.districts) return;
    var body = $('[data-body]', card);
    body.textContent = '';
    if (!list) { cardError(body); return; }

    var flagged = list
      .filter(function (d) { return d.level === 'danger' || d.level === 'high' || d.level === 'medium'; })
      .sort(function (a, b) { return (b.max_depth_cm || 0) - (a.max_depth_cm || 0); })
      .slice(0, 6);

    if (!flagged.length) {
      body.appendChild(h('p', 'watch__empty', L.t('watch.empty')));
    } else {
      var ol = h('ol', 'watch-list');
      ol.setAttribute('role', 'list');
      flagged.forEach(function (d) {
        var li = h('li');
        li.appendChild(thai('span', 'watch__name', d.district));
        li.appendChild(h('span', 'pill lv-' + DISTRICT_TONE[d.level], levelLabel(d.level)));
        li.appendChild(h('span', 'watch__depth', d.max_depth_cm === null ? L.t('status.awaiting') : L.t('watch.depth', { d: fmtNum(d.max_depth_cm, 0) })));
        li.appendChild(h('span', 'watch__points card__time', L.t('watch.points', { n: d.road_points })));
        ol.appendChild(li);
      });
      body.appendChild(ol);
    }
    $('[data-time]', card).textContent = updated(latestTime(list, 'measured_at'));
  }

  /* ---------- River ---------- */

  function metricValue(body, value, unitText) {
    var v = h('p', 'metric__value');
    v.appendChild(h('span', 'metric__num', value));
    v.appendChild(h('span', 'metric__unit', unitText));
    body.appendChild(v);
  }

  function renderRiver() {
    var card = $('[data-card="river"]');
    if (data.river === undefined && !errors.river) return;
    var body = $('[data-body]', card);
    body.textContent = '';
    if (!data.river) { cardError(body); return; }

    var st = findStation(data.river, STATION_BANGKOK_BRIDGE);
    if (!st || st.water_level === null) {
      awaiting(body);
    } else {
      metricValue(body, fmtNum(st.water_level, 2), unit('m'));
      if (GW.isStale(st.measured_at)) body.appendChild(h('p', 'metric__note stale-tag', GW.staleText(st.measured_at)));
      if (st.bank !== null) {
        var diff = st.bank - st.water_level;
        var key = diff >= 0 ? 'river.below' : 'river.above';
        var note = h('p', 'metric__note ' + (diff >= 0 ? 'lv-green' : 'lv-red'),
          L.t(key, { d: fmtNum(Math.abs(diff), 2), bank: fmtNum(st.bank, 2) }));
        body.appendChild(note);
      }
    }
    var foot = h('p', 'metric__foot card__time', st ? updated(st.measured_at) : '');
    body.appendChild(foot);
  }

  /* ---------- Canals ---------- */

  function renderCanal() {
    var card = $('[data-card="canal"]');
    if (data.canal === undefined && !errors.canal) return;
    var body = $('[data-body]', card);
    var place = $('[data-canal-place]', card);
    body.textContent = '';
    if (!data.canal) { cardError(body); place.textContent = ''; return; }

    // Only gauges with a reading from the last 3 hours (GW.isStale) and a real bank height count
    var withLevel = data.canal.filter(function (s) { return s.water_level !== null && s.measured_at; });
    var fresh = withLevel.filter(function (s) { return !GW.isStale(s.measured_at); });
    place.textContent = L.t('canal.sub', { n: fresh.length });

    var banked = fresh.filter(function (s) { return s.bank !== null && s.bank > 0; });
    if (!banked.length) { awaiting(body); return; }

    var above = banked.filter(function (s) { return s.water_level >= s.bank; });
    var near = banked.filter(function (s) { var gap = s.bank - s.water_level; return gap > 0 && gap <= 0.3; });

    metricValue(body, String(above.length), L.t('canal.unit'));
    body.appendChild(h('p', 'metric__note ' + (above.length ? 'lv-red' : 'lv-green'), L.t('canal.above')));
    body.appendChild(h('p', 'metric__note ' + (near.length ? 'lv-orange' : ''), L.t('canal.near', { n: near.length })));

    var closest = banked.reduce(function (a, b) { return (b.bank - b.water_level) < (a.bank - a.water_level) ? b : a; });
    body.appendChild(sentenceWithPlace('metric__note', 'canal.closest',
      closest.name + ' (' + fmtNum(closest.water_level, 2) + ' / ' + fmtNum(closest.bank, 2) + ' ' + unit('m') + ')'));
    body.appendChild(h('p', 'metric__foot card__time', updated(latestTime(fresh, 'measured_at'))));
  }

  /* ---------- Rain ---------- */

  // Thai Meteorological Department classes for 24-hour rainfall
  function rainClass(mm) {
    if (mm <= 0) return 'none';
    if (mm <= 10) return 'light';
    if (mm <= 35) return 'moderate';
    if (mm <= 90) return 'heavy';
    return 'veryheavy';
  }

  function renderRain() {
    var card = $('[data-card="rain"]');
    if (data.rain === undefined && !errors.rain) return;
    var body = $('[data-body]', card);
    body.textContent = '';
    var place = $('[data-rain-place]', card);
    if (!data.rain) { cardError(body); place.textContent = ''; return; }

    var reporting = data.rain.filter(function (s) { return s.rain_24h !== null && s.rain_24h !== undefined; });
    place.textContent = L.t('rain.reporting', { n: reporting.length });
    if (!reporting.length) { awaiting(body); return; }

    var top = reporting.reduce(function (a, b) { return b.rain_24h > a.rain_24h ? b : a; });
    metricValue(body, fmtNum(top.rain_24h, 1), unit('mm'));
    var cls = rainClass(top.rain_24h);
    var tone = cls === 'veryheavy' ? 'lv-red' : cls === 'heavy' ? 'lv-orange' : cls === 'moderate' ? 'lv-yellow' : 'lv-green';
    body.appendChild(h('p', 'metric__note ' + tone, L.t('rain.class.' + cls)));
    body.appendChild(sentenceWithPlace('metric__note', 'rain.highest', top.name + (top.district ? ' (' + top.district + ')' : '')));
    body.appendChild(h('p', 'metric__foot card__time', updated(top.measured_at)));
  }

  /* ---------- Dams ---------- */

  function renderDams() {
    var card = $('[data-card="dams"]');
    if (data.dams === undefined && !errors.dams) return;
    var body = $('[data-body]', card);
    var dateEl = $('[data-dams-date]', card);
    body.textContent = '';
    if (!data.dams) { cardError(body); dateEl.textContent = ''; return; }

    // The four storage dams; Chao Phraya (Chai Nat) is a barrage with flow only, no storage figures
    var storage = data.dams.filter(function (d) { return d.pct !== null && d.volume !== null && d.capacity; });
    var dates = storage.map(function (d) { return String(d.measured_at || '').slice(0, 10); });
    var asOf = dates.sort().pop();
    dateEl.textContent = asOf ? L.t('dams.daily', { date: fmtTime(asOf) }) : '';

    if (!storage.length) { awaiting(body); return; }

    var vol = 0, cap = 0;
    storage.forEach(function (d) { vol += d.volume; cap += d.capacity; });
    var pct = (vol / cap) * 100;
    metricValue(body, fmtNum(pct, 1), '%');
    body.appendChild(h('p', 'metric__note', L.t('dams.free', { pct: fmtNum(Math.max(0, 100 - pct), 1) })));

    var bars = h('div', 'dam-bars');
    storage.forEach(function (d) {
      var row = h('div', 'dam-bar');
      var name = placeName(d.name);
      row.appendChild(name === d.name ? thai('span', null, name) : h('span', null, name));
      row.appendChild(h('span', 'dam-bar__pct', fmtNum(d.pct, 1) + '%'));
      var track = h('div', 'dam-bar__track');
      var fill = h('div', 'dam-bar__fill');
      fill.style.width = Math.min(100, Math.max(0, d.pct)) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
    });
    body.appendChild(bars);
  }

  /* ---------- Status and date ---------- */

  function anySimulated() {
    return [data.river, data.canal, data.rain, data.dams].some(function (list) {
      return (list || []).some(function (s) { return s.source === 'sim'; });
    });
  }

  function renderStatus() {
    var el = $('[data-status]');
    var vals = Object.keys(modes).map(function (k) { return modes[k]; });
    var mode, text;
    if (vals.indexOf('sample') >= 0) { mode = 'sample'; text = L.t('status.sample'); }
    else if (anySimulated()) { mode = 'sim'; text = L.t('status.sim'); }
    else if (vals.length) { mode = 'live'; text = L.t('status.live'); }
    else if (connecting) { mode = 'connecting'; text = L.t('status.connecting'); }
    else { el.textContent = ''; return; }
    el.setAttribute('data-mode', mode);
    el.textContent = text;
    if (mode === 'sample') el.title = L.t('status.sampleHint');
    else el.removeAttribute('title');
  }

  function renderToday() {
    var el = $('[data-today]');
    el.textContent = new Intl.DateTimeFormat(locale(), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok'
    }).format(new Date());
  }

  function renderAll() {
    renderToday();
    renderRisk();
    renderBanner();
    renderDistricts();
    renderWatch();
    renderRiver();
    renderCanal();
    renderRain();
    renderDams();
    renderStatus();
  }

  /* ---------- Loading ---------- */

  // Other scripts on this page (js/near.js) read the same data instead of calling the backend again
  function changed(key) {
    document.dispatchEvent(new CustomEvent('gw:data', { detail: { key: key } }));
  }

  GW.home = {
    data: data,
    modes: modes,
    errors: errors,
    h: h,
    thai: thai,
    fmtNum: fmtNum,
    fmtTime: fmtTime,
    updated: updated,
    unit: unit,
    levelLabel: levelLabel,
    placeName: placeName,
    sentenceWithPlace: sentenceWithPlace,
    RISK: RISK,
    DISTRICT_TONE: DISTRICT_TONE,
    SEVERITY_TONE: SEVERITY_TONE
  };

  function onSlow() {
    if (connecting) return;
    connecting = true;
    renderStatus();
  }

  function loader(key, path, sampleFile, after) {
    return function () {
      var get = key === 'risk' ? GW.loadRisk({ onSlow: onSlow }) : GW.load(path, sampleFile, { auth: false, onSlow: onSlow });
      return get.then(function (res) {
        data[key] = res.data;
        modes[key] = res.mode;
        errors[key] = null;
        if (res.mode === 'live') GW.pulse();
      }, function (err) {
        if (key === 'risk' && err.status === 503) {
          data.risk = null;          // the backend answered: no recent data to assess
          modes.risk = 'live';
          errors.risk = null;
        } else {
          errors[key] = err;
        }
      }).then(function () {
        after();
        renderStatus();
        scheduleRetry();
        changed(key);
      });
    };
  }

  // While showing sample data, try the backend again every 15 seconds so the page
  // switches to live data as soon as the server is up (normal refresh times are much longer).
  // Not /risk: it is asked at most once every 5 minutes (GW.loadRisk), so it waits for its own round.
  var retryTimer = 0;
  function scheduleRetry() {
    var onSample = Object.keys(modes).some(function (k) { return k !== 'risk' && modes[k] === 'sample'; });
    if (!onSample || retryTimer) return;
    retryTimer = setTimeout(function () {
      retryTimer = 0;
      if (!GW.live.on()) return;   // live refreshes off: wait until they are turned back on
      loaders.forEach(function (fn) { if (fn !== loadRisk) fn(); });
    }, 15000);
  }

  var loadRisk = loader('risk', '/risk', 'risk.json', function () { renderRisk(); renderBanner(); });
  var loadDistricts = loader('districts', '/districts/latest', 'districts.json', function () { renderDistricts(); renderWatch(); });
  var loadRiver = loader('river', '/stations/latest?kind=river', 'stations-river.json', function () { renderRiver(); renderRisk(); });
  var loadCanal = loader('canal', '/stations/latest?kind=canal', 'stations-canal.json', renderCanal);
  var loadRain = loader('rain', '/stations/latest?kind=rain', 'stations-rain.json', renderRain);
  var loadDams = loader('dams', '/dams/latest', 'dams.json', renderDams);
  var loaders = [loadRisk, loadDistricts, loadRiver, loadCanal, loadRain, loadDams];

  // Sent alerts come from the shell (js/shell.js), which polls GET /alerts every 30 seconds
  function syncAlerts() {
    data.alerts = GW.shell ? GW.shell.alerts : null;
    renderBanner();
    changed('alerts');
  }

  function every(ms, fn) {
    setInterval(function () { if (!document.hidden && GW.live.on()) fn(); }, ms);
  }

  renderAll();
  loadRisk();
  loadDistricts();
  loadRiver();
  loadCanal();
  loadRain();
  loadDams();
  syncAlerts();

  every(5 * 60 * 1000, loadRisk);
  every(60 * 1000, loadDistricts);
  every(60 * 1000, loadRiver);
  every(60 * 1000, loadCanal);
  every(60 * 1000, loadRain);
  every(30 * 60 * 1000, loadDams);

  document.addEventListener('gw:lang', renderAll);
  // Live refreshes turned back on: fetch everything now (/risk still at most once every 5 minutes)
  document.addEventListener('gw:live', function (e) { if (e.detail.on) loaders.forEach(function (fn) { fn(); }); });
  document.addEventListener('gw:alerts', syncAlerts);
})(window.GW = window.GW || {});
