/* GunWaree app shell, shared by every page with the sidebar: shared formatting, the profile at the
   foot of the sidebar, and the alert bell.

   GET /alerts is public, polled every 30 seconds. Other scripts read GW.shell.alerts and listen for
   "gw:alerts". Logging out fires "gw:session" so a page can redraw what depends on the session. */

(function (GW) {
  'use strict';

  var L = GW.lang;
  var SEVERITY_TONE = { watch: 'yellow', warning: 'orange', critical: 'red' };

  var ICON_PERSON = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="9" cy="6" r="3.25"/><path d="M2.75 16c.6-3.1 3.2-5 6.25-5s5.65 1.9 6.25 5" stroke-linecap="round"/></svg>';

  /* ---------- Shared formatting ---------- */

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // Place names, alert messages and other backend text arrive in Thai
  function thai(tag, cls, text) {
    var e = h(tag, cls, text);
    e.lang = 'th';
    return e;
  }

  function locale() { return L.get() === 'th' ? 'th-TH' : 'en-GB'; }

  function num(v, digits) {
    return Number(v).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // "YYYY-MM-DD HH:MM:SS" (already Thai time) or "YYYY-MM-DD", formatted without any time-zone shift
  function time(s) {
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
    var t = time(s);
    return t ? L.t('status.updated', { time: t }) : '';
  }

  function levelLabel(level) {
    return GW.t.levels[level] ? L.pick(GW.t.levels[level]) : level;
  }

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Count a number up from 0 (or from `from`) for a short moment; instant with reduced motion
  function countUp(el, to, digits, from, ms) {
    digits = digits || 0;
    if (reduceMotion() || !isFinite(to)) { el.textContent = num(to, digits); return; }
    var start = performance.now();
    var a = from || 0;
    ms = ms || 700;
    (function step(now) {
      var p = Math.min(1, (now - start) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = num(a + (to - a) * e, digits);
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  GW.fmt = { h: h, thai: thai, locale: locale, num: num, time: time, updated: updated, levelLabel: levelLabel,
    reduceMotion: reduceMotion, countUp: countUp, SEVERITY_TONE: SEVERITY_TONE };

  /* ---------- Profile ---------- */

  function renderProfile() {
    var session = GW.session.get();
    document.querySelectorAll('[data-profile]').forEach(function (p) {
      p.textContent = '';
      var avatar = h('span', 'profile__avatar');
      if (session) avatar.textContent = String(session.username || '?').charAt(0).toUpperCase();
      else avatar.innerHTML = ICON_PERSON;
      avatar.setAttribute('aria-hidden', 'true');

      var text = h('div', 'profile__text');
      text.appendChild(h('p', 'profile__hello', L.t('profile.hello')));
      text.appendChild(h('p', 'profile__name', session ? session.username : L.t('profile.guest')));

      var action;
      if (session) {
        action = h('button', 'profile__action', L.t('profile.logout'));
        action.type = 'button';
        action.addEventListener('click', function () {
          GW.session.clear();
          renderProfile();
          document.dispatchEvent(new CustomEvent('gw:session'));
        });
      } else {
        action = h('a', 'profile__action', L.t('profile.login'));
        action.href = GW.authUrl('login');
      }
      p.appendChild(avatar);
      p.appendChild(text);
      p.appendChild(action);
    });
  }

  /* ---------- Bell ---------- */

  GW.shell = { alerts: null, error: null };

  var bellBtn = document.querySelector('[data-bell]');
  var bellPanel = document.querySelector('[data-bell-panel]');

  function renderBell() {
    if (!bellBtn) return;
    var bodyEl = document.querySelector('[data-bell-body]');
    var count = document.querySelector('[data-bell-count]');
    var list = GW.shell.alerts;
    bodyEl.textContent = '';

    if (GW.shell.error && !list) {
      bodyEl.appendChild(h('p', null, L.t('bell.error')));
    } else if (!list || !list.length) {
      bodyEl.appendChild(h('p', null, L.t('bell.none')));
    } else {
      var ul = h('ul', 'bell__list');
      ul.setAttribute('role', 'list');
      list.forEach(function (al) {
        var li = h('li');
        li.appendChild(thai('p', null, al.message));
        li.appendChild(h('p', 'bell__meta lv-' + (SEVERITY_TONE[al.severity] || 'grey'),
          levelLabel(al.severity) + (al.sent_at ? ', ' + time(al.sent_at) : '')));
        ul.appendChild(li);
      });
      bodyEl.appendChild(ul);
    }
    var n = list ? list.length : 0;
    count.hidden = !n;
    count.textContent = n > 9 ? '9+' : String(n);
  }

  function setBell(open) {
    bellPanel.hidden = !open;
    bellBtn.setAttribute('aria-expanded', String(open));
  }

  if (bellBtn) {
    bellBtn.addEventListener('click', function () { setBell(bellPanel.hidden); });
    document.addEventListener('click', function (e) {
      if (!bellPanel.hidden && !e.target.closest('.bell')) setBell(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !bellPanel.hidden) {
        setBell(false);
        bellBtn.focus();
      }
    });
  }

  // Sent alerts are public: no token. There is no sample file on purpose,
  // so an offline page never shows an alert that was not really sent.
  function loadAlerts() {
    return GW.request('/alerts', { auth: false }).then(function (list) {
      GW.shell.alerts = list || [];
      GW.shell.error = null;
    }, function (err) {
      GW.shell.error = err;
    }).then(function () {
      renderBell();
      document.dispatchEvent(new CustomEvent('gw:alerts'));
    });
  }

  renderProfile();
  renderBell();
  loadAlerts();
  setInterval(function () { if (!document.hidden) loadAlerts(); }, 30 * 1000);

  document.addEventListener('gw:lang', function () {
    renderProfile();
    renderBell();
  });
})(window.GW = window.GW || {});
