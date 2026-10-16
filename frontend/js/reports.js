/* GunWaree Rescue reports: send a report, then follow it.

   Endpoint                 Who            Used for
   POST /incidents          client         send a report {description, address, phone, lat, lon}
   GET /incidents/mine      client         my reports, on opening the page or its tab and after sending (no timed refresh)

   Rules from the plan: user_id comes from the token, never from the form; lat and lon are optional
   but sent together, as numbers; the phone check here is a convenience, the backend validates;
   401 goes to the login page (GW.request does that), 403 says "no permission"; statuses are shown
   in the chosen language. Guests and admins see a short explanation instead of the form. */

(function (GW) {
  'use strict';

  var lang = GW.lang;
  var F = GW.fmt;
  var h = F.h;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var MAX_DESC = 500;
  var BANGKOK = [13.7563, 100.5018];
  var STATUS_ORDER = ['new', 'in_progress', 'resolved'];
  var STATUS_TONE = { new: 'teal', in_progress: 'yellow', resolved: 'green' };

  function statusLabel(s) {
    var m = GW.t.incidentStatus[s];
    return m ? lang.pick(m) : s;
  }

  function reportId(id) { return 'GW-' + String(id).padStart(4, '0'); }

  function session() { return GW.session.get(); }
  function isClient() { var s = session(); return !!(s && s.role === 'client'); }

  /* ---------- Tabs (#new, #mine) ---------- */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  var thumb = $('[data-seg-thumb]');
  var current = 'new';

  function placeThumb() {
    var active = tabs.filter(function (t) { return t.getAttribute('data-tab') === current; })[0];
    if (!active || !thumb) return;
    thumb.style.width = active.offsetWidth + 'px';
    thumb.style.transform = 'translateX(' + (active.offsetLeft - 4) + 'px)';
  }

  function setTab(name, opts) {
    opts = opts || {};
    if (name !== 'new' && name !== 'mine') name = 'new';
    current = name;
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && opts.focus) t.focus();
    });
    document.querySelectorAll('[data-panel]').forEach(function (p) {
      var on = p.getAttribute('data-panel') === name;
      if (on && p.hidden) {
        p.hidden = false;
        p.classList.remove('is-entering');
        void p.offsetWidth;           // restart the entrance animation
        p.classList.add('is-entering');
      } else if (!on) {
        p.hidden = true;
      }
    });
    placeThumb();
    if (opts.moved) F.replay(thumb, 'is-moving', 400);
    if (window.location.hash !== '#' + name) {
      history.replaceState(null, '', '#' + name);
    }
    if (name === 'new') ensureMap();
    if (name === 'mine') { renderMine(); if (isClient()) loadMine(); }
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { setTab(t.getAttribute('data-tab'), { moved: t.getAttribute('data-tab') !== current }); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var next = tabs[(i + d + tabs.length) % tabs.length];
      setTab(next.getAttribute('data-tab'), { focus: true, moved: true });
    });
  });

  window.addEventListener('hashchange', function () { setTab(window.location.hash.slice(1)); });
  window.addEventListener('resize', placeThumb);

  /* ---------- Gates: guests log in, admins cannot report ---------- */

  function renderGate(el, which) {
    var s = session();
    el.textContent = '';
    if (s && s.role === 'client') { el.hidden = true; return false; }
    el.hidden = false;
    if (s) {
      el.appendChild(h('p', 'gate__title', lang.pick(GW.t.errors[403])));
      el.appendChild(h('p', 'gate__text', lang.t('reports.gateAdmin')));
      return true;
    }
    el.appendChild(h('p', 'gate__title', lang.t(which === 'mine' ? 'reports.gateMineTitle' : 'reports.gateTitle')));
    el.appendChild(h('p', 'gate__text', lang.t('reports.gateText')));
    var actions = h('div', 'gate__actions');
    var login = h('a', 'btn gate__btn', lang.t('profile.login'));
    login.href = GW.authUrl('login', 'reports.html#' + which);
    var signup = h('a', 'btn btn--secondary gate__btn', lang.t('reports.signup'));
    signup.href = GW.authUrl('signup', 'reports.html#' + which);
    actions.appendChild(login);
    actions.appendChild(signup);
    el.appendChild(actions);
    return true;
  }

  var form = $('[data-report-form]');
  var sent = $('[data-sent]');

  function renderGates() {
    var gatedNew = renderGate($('[data-gate="new"]'), 'new');
    if (gatedNew) { form.hidden = true; sent.hidden = true; }
    else if (sent.hidden) form.hidden = false;

    var gatedMine = renderGate($('[data-gate="mine"]'), 'mine');
    $('[data-mine]').hidden = gatedMine;
    if (gatedMine) { mine.list = null; mine.prev = {}; updateCount(); }
    if (current === 'new') ensureMap();
  }

  /* ---------- Form ---------- */

  var desc = form.elements.description;
  var address = form.elements.address;
  var phone = form.elements.phone;
  var counter = $('[data-counter]');
  var alertBox = $('[data-form-alert]');
  var submitBtn = $('[data-submit]');
  var submitLabel = $('[data-submit-label]');

  function updateCounter() {
    var n = desc.value.length;
    counter.textContent = lang.t('form.count', { n: F.num(n, 0), max: F.num(MAX_DESC, 0) });
    counter.classList.toggle('is-near', n >= MAX_DESC * 0.9);
  }
  desc.addEventListener('input', updateCounter);

  function setError(fieldName, key) {
    var field = $('[data-field="' + fieldName + '"]', form);
    var err = field.querySelector('.field__error');
    field.classList.toggle('is-invalid', !!key);
    err.hidden = !key;
    err.textContent = key ? lang.t(key) : '';
    return !key;
  }

  function phoneDigits(v) { return v.replace(/\D/g, ''); }

  function validPhone(v) {
    if (!v) return true;
    if (!/^[0-9+\-\s().]+$/.test(v)) return false;
    var d = phoneDigits(v);
    if (d.indexOf('66') === 0 && /^\+/.test(v.trim())) d = '0' + d.slice(2);   // +66 81 ... -> 081 ...
    return d.length === 9 || d.length === 10;
  }

  function validate() {
    var ok = true;
    ok = setError('description', desc.value.trim() ? null : 'form.errDesc') && ok;
    ok = setError('where', address.value.trim() || pin ? null : 'form.errWhere') && ok;
    ok = setError('phone', validPhone(phone.value.trim()) ? null : 'form.errPhone') && ok;
    return ok;
  }

  // Clear an error as soon as the person fixes it
  desc.addEventListener('input', function () { if (desc.value.trim()) setError('description', null); });
  address.addEventListener('input', function () { if (address.value.trim()) setError('where', null); });
  phone.addEventListener('input', function () { if (validPhone(phone.value.trim())) setError('phone', null); });

  var busy = false;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    alertBox.textContent = '';
    if (!validate()) {
      var first = form.querySelector('.is-invalid textarea, .is-invalid input');
      if (first) first.focus();
      return;
    }
    var body = {
      description: desc.value.trim(),
      address: address.value.trim() || null,
      phone: phone.value.trim() || null
    };
    if (pin) { body.lat = pin.lat; body.lon = pin.lon; }

    busy = true;
    submitBtn.setAttribute('aria-busy', 'true');
    F.replay(submitBtn, 'is-launching', 700);
    submitLabel.textContent = lang.t('form.sending');
    GW.request('/incidents', {
      method: 'POST',
      body: body,
      onSlow: function () { submitLabel.textContent = lang.pick(GW.t.states.connecting); }
    }).then(function (res) {
      showSent(res && res.id);
      mine.stale = true;
      loadMine();
    }, function (err) {
      if (err.status === 403) { renderGates(); return; }
      alertBox.textContent = lang.pick(GW.messageFor(err));
    }).then(function () {
      busy = false;
      submitBtn.removeAttribute('aria-busy');
      submitLabel.textContent = lang.t('form.submit');
    });
  });

  function showSent(id) {
    var rid = id ? reportId(id) : '';
    $('[data-sent-id]').textContent = rid;
    $('[data-sent-text]').textContent = lang.t('form.sentText', { id: rid });
    sent.setAttribute('data-id', rid);
    form.hidden = true;
    sent.hidden = false;
    sent.classList.remove('is-shown');
    void sent.offsetWidth;
    sent.classList.add('is-shown');
    sent.focus();
  }

  $('[data-another]').addEventListener('click', function () {
    form.reset();
    clearPin();
    ['description', 'where', 'phone'].forEach(function (f) { setError(f, null); });
    alertBox.textContent = '';
    updateCounter();
    sent.hidden = true;
    form.hidden = false;
    ensureMap();
    desc.focus();
  });

  /* ---------- Map pin (OpenFreeMap through js/maps.js) ---------- */

  var map = null;
  var mapLoading = false;
  var marker = null;
  var pin = null;   // { lat, lon } while a pin is set; only ever sent with the report
  var readout = $('[data-pin-readout]');
  var clearBtn = $('[data-clear-pin]');
  var locateBtn = $('[data-locate]');
  var mapEl = $('[data-map]');
  var mapFailed = false;
  var readoutKey = null;

  var PIN_HTML = '<span class="pin__drop"><svg viewBox="0 0 32 40" aria-hidden="true">' +
    '<path d="M16 38s12-12.2 12-22A12 12 0 0 0 4 16c0 9.8 12 22 12 22Z" fill="#0A303A" stroke="#C4F7F2" stroke-width="2"/>' +
    '<circle cx="16" cy="16" r="4.5" fill="#7CEBE3"/></svg></span><span class="pin__ripple"></span>';

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  function renderReadout() {
    if (readoutKey) { readout.textContent = lang.t(readoutKey); return; }
    readout.textContent = pin
      ? lang.t('form.pinAt', { lat: pin.lat.toFixed(5), lon: pin.lon.toFixed(5) })
      : lang.t(mapFailed ? 'form.mapOffline' : 'form.noPin');
  }

  // The pin drops in with a bounce and a ripple where it lands
  function setPin(lat, lon) {
    pin = { lat: round6(lat), lon: round6(lon) };
    readoutKey = null;
    if (map) {
      if (!marker) {
        var el = h('div', 'pin');
        el.innerHTML = PIN_HTML;
        marker = new window.maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map);
        marker.on('dragend', function () {
          var p = marker.getLngLat();
          pin = { lat: round6(p.lat), lon: round6(p.lng) };
          renderReadout();
        });
      } else {
        marker.setLngLat([lon, lat]);
      }
      F.replay(marker.getElement(), 'is-dropping', 1200);
    }
    clearBtn.hidden = false;
    setError('where', null);
    renderReadout();
  }

  // Removing the pin lifts it off the map
  function clearPin() {
    pin = null;
    clearBtn.hidden = true;
    readoutKey = null;
    renderReadout();
    if (!marker) return;
    var old = marker;
    marker = null;
    if (F.reduceMotion()) { old.remove(); return; }
    old.getElement().classList.add('is-lifting');
    setTimeout(function () { old.remove(); }, 260);
  }

  function ensureMap() {
    if (map) { map.resize(); return; }
    if (mapLoading || mapFailed || form.hidden || current !== 'new') return;
    mapLoading = true;
    GW.maps.create(mapEl, { center: [BANGKOK[1], BANGKOK[0]], zoom: 11 }).then(function (m) {
      mapLoading = false;
      if (!m) {
        mapFailed = true;
        mapEl.hidden = true;
        renderReadout();
        return;
      }
      map = m;
      map.on('click', function (e) { setPin(e.lngLat.lat, e.lngLat.lng); });
      // Keyboard: arrows pan the map, Enter pins its centre
      map.getCanvas().addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var c = map.getCenter();
          setPin(c.lat, c.lng);
        }
      });
      if (pin) setPin(pin.lat, pin.lon);
      renderReadout();
    });
  }

  // Use my location: the crosshair spins while the browser looks, then the map flies there in 3D
  locateBtn.addEventListener('click', function () {
    if (!navigator.geolocation || !window.isSecureContext) { readoutKey = 'form.locateFail'; renderReadout(); return; }
    readoutKey = 'form.locating';
    renderReadout();
    locateBtn.disabled = true;
    locateBtn.classList.add('is-busy');
    function done() { locateBtn.disabled = false; locateBtn.classList.remove('is-busy'); }
    navigator.geolocation.getCurrentPosition(function (p) {
      done();
      setPin(p.coords.latitude, p.coords.longitude);
      if (map) map.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 16.5, pitch: 50, bearing: -15, speed: 1.2 });
    }, function () {
      done();
      readoutKey = 'form.locateFail';
      renderReadout();
    }, { timeout: 10000, maximumAge: 0 });
  });

  clearBtn.addEventListener('click', clearPin);

  /* ---------- My reports ---------- */

  var mine = { list: null, error: null, prev: {}, shown: {}, stale: true, loading: false, at: null };
  var listEl = $('[data-report-list]');
  var countEl = $('[data-mine-count]');
  var announceEl = $('[data-mine-announce]');
  var tallyNums = {};
  document.querySelectorAll('[data-tally]').forEach(function (li) {
    tallyNums[li.getAttribute('data-tally')] = { el: li.querySelector('[data-tally-num]'), value: 0 };
  });

  function loadMine() {
    if (!isClient() || mine.loading) return;
    mine.loading = true;
    GW.request('/incidents/mine').then(function (list) {
      mine.list = list || [];
      mine.error = null;
      mine.at = new Date();
      setLive();
    }, function (err) {
      if (err.status === 403) { renderGates(); return; }
      mine.error = err;
    }).then(function () {
      mine.loading = false;
      renderMine();
    });
  }

  function updateCount() {
    var n = mine.list ? mine.list.length : 0;
    countEl.hidden = !n;
    countEl.textContent = String(n);
    placeThumb();
  }

  function renderTally() {
    var counts = { all: 0, new: 0, in_progress: 0, resolved: 0 };
    (mine.list || []).forEach(function (r) {
      counts.all++;
      if (counts[r.status] !== undefined) counts[r.status]++;
    });
    Object.keys(tallyNums).forEach(function (k) {
      var t = tallyNums[k];
      if (t.value !== counts[k] || !t.done) F.countUp(t.el, counts[k], 0, t.done ? t.value : 0, 650);
      t.value = counts[k];
      t.done = true;
    });
    document.querySelectorAll('[data-status-label]').forEach(function (el) {
      el.textContent = statusLabel(el.getAttribute('data-status-label'));
    });
  }

  function track(status) {
    var step = STATUS_ORDER.indexOf(status);
    var wrap = h('div', 'track');
    wrap.setAttribute('data-step', String(step));
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', lang.t('mine.progress') + ': ' + statusLabel(status));
    var bar = h('div', 'track__bar');
    var fill = h('span', 'track__fill track__fill--' + (STATUS_TONE[status] || 'teal'));
    fill.style.setProperty('--p', step < 0 ? 0 : step / (STATUS_ORDER.length - 1));
    bar.appendChild(fill);
    wrap.appendChild(bar);
    var labels = h('ol', 'track__steps');
    labels.setAttribute('aria-hidden', 'true');
    STATUS_ORDER.forEach(function (s, i) {
      labels.appendChild(h('li', i <= step ? 'is-done' : '', statusLabel(s)));
    });
    wrap.appendChild(labels);
    return wrap;
  }

  function reportItem(r, index, animate) {
    var li = h('li', 'report');
    li.setAttribute('data-id', r.id);
    if (animate) { li.classList.add('is-in'); li.style.setProperty('--i', index); }

    var top = h('div', 'report__top');
    top.appendChild(h('span', 'report__id', reportId(r.id)));
    top.appendChild(h('span', 'pill lv-' + (STATUS_TONE[r.status] || 'grey'), statusLabel(r.status)));
    li.appendChild(top);

    li.appendChild(h('p', 'report__desc', r.description));
    var where = r.address ? r.address : lang.t('mine.noAddress');
    var meta = h('p', 'report__meta');
    meta.appendChild(h('span', r.address ? null : 'report__none', where));
    var sentAt = F.time(r.created_at);
    if (sentAt) meta.appendChild(document.createTextNode(' · ' + lang.t('mine.sent', { time: sentAt })));
    li.appendChild(meta);
    if (typeof r.lat === 'number' && typeof r.lon === 'number') {
      li.appendChild(h('p', 'report__meta', lang.t('mine.pinned', { lat: r.lat.toFixed(5), lon: r.lon.toFixed(5) })));
    }
    li.appendChild(track(r.status));
    if (r.updated_at && r.updated_at !== r.created_at) {
      li.appendChild(h('p', 'report__meta report__changed', lang.t('mine.changedAt', { time: F.time(r.updated_at) })));
    }
    return li;
  }

  function renderMine() {
    updateCount();
    if (!isClient()) return;
    var timeEl = $('[data-mine-time]');
    timeEl.textContent = mine.at ? lang.t('status.updated', {
      time: new Intl.DateTimeFormat(F.locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(mine.at)
    }) : '';

    if (!mine.list) {
      if (mine.error) {
        listEl.textContent = '';
        listEl.appendChild(h('li', 'card__error', lang.t('mine.error')));
      }
      return;
    }
    // Nothing changed since the last poll: leave the list exactly as it is, so the page never "refreshes"
    var sig = JSON.stringify(mine.list) + '|' + lang.get() + '|' + current;
    if (sig === mine.sig) return;
    mine.sig = sig;
    renderTally();
    listEl.textContent = '';

    if (!mine.list.length) {
      var empty = h('li', 'report-empty');
      empty.appendChild(h('p', null, lang.t('mine.empty')));
      var go = h('a', 'text-link', lang.t('mine.emptyAction'));
      go.href = '#new';
      empty.appendChild(go);
      listEl.appendChild(empty);
      return;
    }

    var changed = [];
    mine.list.forEach(function (r, i) {
      var first = !mine.shown[r.id];
      var li = reportItem(r, i, first && current === 'mine');
      var before = mine.prev[r.id];
      if (before && before !== r.status) {
        li.classList.add('is-changed');
        changed.push(lang.t('mine.nowStatus', { id: reportId(r.id), status: statusLabel(r.status) }));
      }
      listEl.appendChild(li);
      if (current === 'mine') mine.shown[r.id] = true;
      mine.prev[r.id] = r.status;
    });
    if (changed.length) announceEl.textContent = changed.join('. ');
  }

  /* ---------- Data status pill ---------- */

  var statusEl = $('[data-status]');
  function setLive() {
    statusEl.setAttribute('data-mode', 'live');
    statusEl.textContent = lang.t('status.live');
  }
  document.addEventListener('gw:alerts', function () { if (!GW.shell.error) setLive(); });

  /* ---------- Start ---------- */

  function renderText() {
    updateCounter();
    renderReadout();
    renderTally();
    renderMine();
    if (statusEl.textContent) setLive();
    if (!sent.hidden) $('[data-sent-text]').textContent = lang.t('form.sentText', { id: sent.getAttribute('data-id') || '' });
    renderGates();
    placeThumb();
  }

  renderGates();
  updateCounter();
  setTab(window.location.hash.slice(1) || 'new');
  // No timed refresh on this page: "My reports" loads when the page opens, when its tab is opened and after a report is sent
  loadMine();

  document.addEventListener('gw:lang', renderText);
  document.addEventListener('gw:session', function () { renderGates(); renderMine(); });
  // Fonts change tab widths once they load
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeThumb);
})(window.GW = window.GW || {});
