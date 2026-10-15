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
  GW.request = function (path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var session = GW.session.get();
    var sentToken = !!(session && opts.auth !== false);
    if (sentToken) headers.Authorization = 'Bearer ' + session.token;

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, GW.TIMEOUT_MS);
    var slowTimer = opts.onSlow ? setTimeout(opts.onSlow, GW.SLOW_MS) : 0;

    function done() {
      clearTimeout(timer);
      clearTimeout(slowTimer);
    }

    return fetch(GW.BASE_URL + path, {
      method: opts.method || 'GET',
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

  /* Bilingual message for an ApiError. `overrides` maps a status code to a message for this screen. */
  GW.messageFor = function (err, overrides) {
    var e = GW.t.errors;
    if (!err || err.kind === 'network') return e.network;
    if (err.kind === 'timeout') return e.timeout;
    if (overrides && overrides[err.status]) return overrides[err.status];
    return e[err.status] || e.server;
  };
})(window.GW = window.GW || {});
