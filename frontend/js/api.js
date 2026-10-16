/* GunWaree API client: the one place that knows the backend address.
   Every page calls the backend through GW.request(). Never call POPNIX, RID or Open-Meteo from the browser. */

(function (GW) {
  'use strict';

  // Backend address: the team's Railway deployment. It allows this site through CORS when it is
  // served from Live Server (http://127.0.0.1:5500 or http://localhost:5500); a hosted copy of the
  // site needs its own origin added to the backend's CORS list.
  // To use a backend running on this machine instead: 'http://127.0.0.1:8000'.
  GW.BASE_URL = 'https://gunwaree-production.up.railway.app';

  GW.TIMEOUT_MS = 60000;   // a sleeping free-tier backend can take 30 to 60 s to wake
  GW.SLOW_MS = 4000;       // after this, show "connecting" so the page never looks stuck

  // Site root, worked out from this script's own URL so pages in sub-folders resolve links correctly
  var script = document.currentScript;
  GW.ROOT = script ? script.src.replace(/js\/api\.js(\?.*)?$/, '') : '';

  // Where each role lands after signing in.
  GW.ROUTES = {
    home: 'home.html',
    login: 'login.html',
    signup: 'signup.html',
    client: 'home.html',
    admin: 'admin.html'     // the Response Center
  };

  GW.url = function (key) {
    var path = GW.ROUTES[key];
    return path ? GW.ROOT + path : null;
  };

  /* Where to go back to after logging in. Only a page of this site (name.html, optional #section)
     is accepted, so a crafted link cannot send someone to another website. */
  var NEXT_RE = /^[a-z][a-z-]*\.html(#[a-z-]+)?$/;

  GW.safeNext = function (value) {
    if (value === undefined) value = new URLSearchParams(window.location.search).get('next');
    return value && NEXT_RE.test(value) ? value : null;
  };

  // The current page as a `next` value, e.g. "reports.html#mine"
  GW.herePage = function () {
    var page = window.location.pathname.split('/').pop() || 'home.html';
    return GW.safeNext(page + window.location.hash) || GW.safeNext(page);
  };

  // The login (or signup) page, set to come back to `next` (default: this page)
  GW.authUrl = function (key, next) {
    var url = GW.url(key);
    var back = GW.safeNext(next === undefined ? GW.herePage() : next);
    return back ? url + '?next=' + encodeURIComponent(back) : url;
  };

  /* ---------- Session: token, role and username only. Never the password. ---------- */

  var KEY = 'gw_session';
  var TOKEN_TTL_MS = 24 * 60 * 60 * 1000;   // backend tokens expire after 24 hours

  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }

  GW.session = {
    get: function () {
      var raw = null;
      var stores = [store('localStorage'), store('sessionStorage')];
      for (var i = 0; i < stores.length && !raw; i++) {
        try { raw = stores[i] && stores[i].getItem(KEY); } catch (e) { raw = null; }
      }
      if (!raw) return null;
      try {
        var s = JSON.parse(raw);
        if (!s.token || Date.now() > s.expires_at) { GW.session.clear(); return null; }
        return s;
      } catch (e) {
        return null;
      }
    },

    // remember = true keeps the session after the browser closes (localStorage);
    // otherwise it lasts for this tab only (sessionStorage)
    save: function (data, remember) {
      GW.session.clear();
      var s = {
        token: data.token,
        role: data.role,
        username: data.username,
        expires_at: Date.now() + TOKEN_TTL_MS
      };
      var target = store(remember ? 'localStorage' : 'sessionStorage');
      try { if (target) target.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: session lives only in memory */ }
      return s;
    },

    clear: function () {
      ['localStorage', 'sessionStorage'].forEach(function (kind) {
        var st = store(kind);
        try { if (st) st.removeItem(KEY); } catch (e) { /* ignore */ }
      });
    }
  };

  /* ---------- Requests ---------- */

  function ApiError(status, kind, detail) {
    this.status = status;   // HTTP status, or 0 when the request never got an answer
    this.kind = kind;       // 'http', 'network' or 'timeout'
    this.detail = detail;   // backend detail (Thai only); show GW.messageFor() instead
  }

  /*
    GW.request('/auth/login', { method: 'POST', body: {...}, onSlow: fn })
    Resolves with the parsed JSON body. Rejects with an ApiError.
  */
  // Public data: a GET of these never carries the sign-in token
  var PUBLIC_GET = /^\/(stations\/latest|stations\/history|districts\/latest|dams\/latest|risk|alerts)(\?|$)/;

  GW.request = function (path, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    // Content-Type only goes with a body (POST, PATCH)
    var headers = opts.body === undefined ? {} : { 'Content-Type': 'application/json' };
    var session = GW.session.get();
    var isPublic = method === 'GET' && PUBLIC_GET.test(path);
    var sentToken = !!(session && opts.auth !== false && !isPublic);
    if (sentToken) headers.Authorization = 'Bearer ' + session.token;

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, GW.TIMEOUT_MS);
    var slowTimer = opts.onSlow ? setTimeout(opts.onSlow, GW.SLOW_MS) : 0;

    function done() {
      clearTimeout(timer);
      clearTimeout(slowTimer);
    }

    return fetch(GW.BASE_URL + path, {
      method: method,
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal
    }).then(function (res) {
      return res.text().then(function (text) {
        done();
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (res.ok) return data;

        // An expired or rejected token: drop it and send the person to log in
        if (res.status === 401 && sentToken && opts.redirectOn401 !== false) {
          GW.session.clear();
          window.location.assign(GW.authUrl('login'));
        }
        throw new ApiError(res.status, 'http', data && data.detail);
      });
    }, function (err) {
      done();
      throw new ApiError(0, err && err.name === 'AbortError' ? 'timeout' : 'network');
    });
  };

  /*
    Public data with an offline fallback. If the backend cannot be reached (network error, timeout
    or a 5xx), load the snapshot in /sample and say so. A real answer such as 503 "no data yet"
    is passed to the caller instead.
    Resolves { data, mode: 'live' | 'sample' }.
  */
  GW.load = function (path, sampleFile, opts) {
    return GW.request(path, opts).then(function (data) {
      return { data: data, mode: 'live' };
    }, function (err) {
      if (err.kind === 'http' && (err.status < 500 || err.status === 503)) throw err;
      return fetch(GW.ROOT + 'sample/' + sampleFile)
        .then(function (res) {
          if (!res.ok) throw err;
          return res.json();
        })
        .then(function (data) { return { data: data, mode: 'sample' }; }, function () { throw err; });
    });
  };

  /* ---------- Live refreshes: one switch for every automatic refresh ----------
     On by default. Off (the "Live refreshes" button in the top bar, after a warning) stops every timed refresh and
     retry on every page until it is turned back on; pages still load once when opened, and still update after
     something the person does. Remembered on this device: localStorage gw_live = 'off'. Turning it back on fires
     'gw:live' so each page fetches its data again straight away. */

  var LIVE_KEY = 'gw_live';
  var liveOn = true;
  try { liveOn = localStorage.getItem(LIVE_KEY) !== 'off'; } catch (e) { liveOn = true; }

  GW.live = {
    on: function () { return liveOn; },
    set: function (on) {
      on = !!on;
      if (on === liveOn) return;
      liveOn = on;
      try {
        if (on) localStorage.removeItem(LIVE_KEY); else localStorage.setItem(LIVE_KEY, 'off');
      } catch (e) { /* storage blocked: this page still follows the choice */ }
      document.dispatchEvent(new CustomEvent('gw:live', { detail: { on: on } }));
    }
  };

  // The same switch in another tab
  window.addEventListener('storage', function (e) {
    if (e.key !== LIVE_KEY) return;
    var on = e.newValue !== 'off';
    if (on === liveOn) return;
    liveOn = on;
    document.dispatchEvent(new CustomEvent('gw:live', { detail: { on: on } }));
  });

  /* ---------- Rule-based risk level: GET /risk at most once every 5 minutes across pages ----------
     Each call stores a prediction row on the server, so the latest answer (or failure) and its time are kept in
     sessionStorage and reused for 5 minutes, also after moving to another page. Only the /risk answer is kept.
    GW.loadRisk({ onSlow }) resolves { data, mode: 'live' | 'sample', at } like GW.load, and rejects with an
    ApiError (503 = no recent reading to assess). `at` is when the answer was fetched (Date.now() time). */

  GW.RISK_MS = 5 * 60 * 1000;
  var RISK_KEY = 'gw_risk';
  var riskPending = null;

  function readRisk() {
    var st = store('sessionStorage');
    try {
      var c = st && JSON.parse(st.getItem(RISK_KEY));
      var age = c ? Date.now() - c.at : Infinity;
      return age >= 0 && age < GW.RISK_MS ? c : null;
    } catch (e) {
      return null;
    }
  }

  function settleRisk(c) {
    if (c.err) {
      var err = new ApiError(c.err.status, c.err.kind, c.err.detail);
      err.at = c.at;
      return Promise.reject(err);
    }
    return Promise.resolve({ data: c.data, mode: c.mode, at: c.at });
  }

  GW.loadRisk = function (opts) {
    var cached = readRisk();
    if (cached) return settleRisk(cached);
    if (!riskPending) {
      riskPending = GW.load('/risk', 'risk.json', { auth: false, onSlow: opts && opts.onSlow }).then(function (res) {
        return { at: Date.now(), mode: res.mode, data: res.data };
      }, function (err) {
        return { at: Date.now(), err: { status: err.status, kind: err.kind, detail: err.detail } };
      }).then(function (c) {
        riskPending = null;
        var st = store('sessionStorage');
        try { if (st) st.setItem(RISK_KEY, JSON.stringify(c)); } catch (e) { /* storage blocked: this page still waits 5 minutes */ }
        return c;
      });
    }
    return riskPending.then(settleRisk);
  };

  /* ---------- Old readings ----------
     Backend times are Thai wall-clock time ("YYYY-MM-DD HH:MM[:SS]"), read with the same pattern as
     js/admin/core.js (no time-zone shift) and compared with the current Thai time.
     A reading older than 3 hours is not current: the backend does not use one for /risk either. */

  GW.STALE_MS = 3 * 3600000;

  GW.wallValue = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : NaN;
  };

  GW.nowThai = function () { return Date.now() + 7 * 3600000; };

  GW.isStale = function (measuredAt) {
    var t = GW.wallValue(measuredAt);
    return !isFinite(t) || GW.nowThai() - t > GW.STALE_MS;
  };

  // "Last reading at 23:10 (not updating)"
  GW.staleText = function (measuredAt, key) {
    var t = GW.wallValue(measuredAt);
    var clock = isFinite(t) ? new Intl.DateTimeFormat(GW.lang.get() === 'th' ? 'th-TH' : 'en-GB',
      { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(t)) : '–';
    return GW.lang.t(key || 'stale.label', { time: clock });
  };

  /* Bilingual message for an ApiError. `overrides` maps a status code to a message for this screen. */
  GW.messageFor = function (err, overrides) {
    var e = GW.t.errors;
    if (!err || err.kind === 'network') return e.network;
    if (err.kind === 'timeout') return e.timeout;
    if (overrides && overrides[err.status]) return overrides[err.status];
    return e[err.status] || e.server;
  };
})(window.GW = window.GW || {});
