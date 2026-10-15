/* GunWaree app shell, shared by every page with the sidebar.

   - Shared formatting helpers (GW.fmt)
   - Sidebar: collapse to icons and back (remembered on this device), tooltips while collapsed,
     the Levels group (opens in place, or as a flyout while collapsed), the account menu
   - Small screens: account button in the top bar, Levels sheet above the tab bar
   - Page changes: remembers where the menu item was clicked so the next page can ripple out from it
     (the reveal itself is in each page's <head>); clicking the current page never reloads it
   - Alert bell: GET /alerts every 30 seconds (public). Other scripts read GW.shell.alerts
     and listen for "gw:alerts". Logging out fires "gw:session".
   - GW.pulse(): the ripple on the data-status dot each time fresh data arrives */

(function (GW) {
  'use strict';

  var L = GW.lang;
  var root = document.documentElement;
  var SEVERITY_TONE = { watch: 'yellow', warning: 'orange', critical: 'red' };

  var ICON_PERSON = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="9" cy="6" r="3.25"/><path d="M2.75 16c.6-3.1 3.2-5 6.25-5s5.65 1.9 6.25 5" stroke-linecap="round"/></svg>';
  var ICON_CHEV = '<svg class="account__chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_IN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3.5h4a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M3.5 10h8.5M9 6.5 12.5 10 9 13.5"/></svg>';
  var ICON_OUT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h4"/><path d="M8 10h8.5M13.5 6.5 17 10l-3.5 3.5"/></svg>';
  var ICON_ADD = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="7" r="3.25"/><path d="M2.5 16.5c.6-3 2.8-4.8 5.5-4.8 1.3 0 2.5.4 3.4 1.1M15 11v6M12 14h6"/></svg>';

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

  // Restart a one-shot CSS animation class on an element
  function replay(el, cls, ms) {
    if (!el || reduceMotion()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el['_t_' + cls]);
    el['_t_' + cls] = setTimeout(function () { el.classList.remove(cls); }, ms || 1200);
  }

  GW.fmt = { h: h, thai: thai, locale: locale, num: num, time: time, updated: updated, levelLabel: levelLabel,
    reduceMotion: reduceMotion, countUp: countUp, replay: replay, SEVERITY_TONE: SEVERITY_TONE };

  // Ripple on the status dot whenever fresh data arrives
  GW.pulse = function () { replay(document.querySelector('[data-status]'), 'is-pulse', 1200); };

  /* ---------- Floating layer: one tooltip and one popover at a time ---------- */

  var tip = h('div', 'gw-tip');
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  var pop = h('div', 'gw-pop');
  pop.hidden = true;
  document.body.appendChild(pop);
  var popOwner = null;

  function showTip(el) {
    var text = el.getAttribute('data-tip');
    if (!text) return;
    tip.textContent = text;
    var r = el.getBoundingClientRect();
    tip.style.left = (r.right + 12) + 'px';
    tip.style.top = (r.top + r.height / 2 - 16) + 'px';
    tip.classList.add('is-on');
  }
  function hideTip() { tip.classList.remove('is-on'); }

  function closePop(focusOwner) {
    if (pop.hidden) return;
    pop.hidden = true;
    pop.className = 'gw-pop';
    if (popOwner) {
      popOwner.setAttribute('aria-expanded', 'false');
      if (focusOwner) popOwner.focus();
    }
    popOwner = null;
  }

  // Place the popover next to its owner: to the right of the collapsed sidebar, below elsewhere
  function openPop(owner, kind, build) {
    if (popOwner === owner && !pop.hidden) { closePop(); return; }
    closePop();
    hideTip();
    pop.textContent = '';
    build(pop);
    var r = owner.getBoundingClientRect();
    var side = owner.closest('.sidebar') && (root.classList.contains('sb-mini') || kind === 'fly');
    pop.className = 'gw-pop gw-pop--' + kind + (side ? ' is-side' : '');
    pop.hidden = false;
    var w = pop.offsetWidth;
    var hgt = pop.offsetHeight;
    var left, top;
    if (side) {
      left = r.right + 12;
      top = Math.min(r.top - 6, window.innerHeight - hgt - 12);
    } else if (owner.closest('.sidebar')) {
      left = r.left;
      top = r.bottom + 6;
      w = Math.max(w, r.width);
      pop.style.minWidth = r.width + 'px';
    } else {
      left = Math.min(r.right - w, window.innerWidth - w - 12);
      top = r.bottom + 8;
    }
    pop.style.left = Math.max(12, left) + 'px';
    pop.style.top = Math.max(12, top) + 'px';
    popOwner = owner;
    owner.setAttribute('aria-expanded', 'true');
    var first = pop.querySelector('a, button');
    if (first) first.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    if (pop.hidden) return;
    if (pop.contains(e.target) || (popOwner && popOwner.contains(e.target))) return;
    closePop();
  });
  window.addEventListener('resize', function () { closePop(); hideTip(); });
  document.addEventListener('scroll', function () { hideTip(); }, true);

  /* ---------- Account ---------- */

  function sessionRole(session) {
    if (!session) return L.t('account.guest');
    return L.t(session.role === 'admin' ? 'account.admin' : 'account.client');
  }

  function avatar(session) {
    var a = h('span', 'account__avatar');
    a.setAttribute('aria-hidden', 'true');
    if (session) a.textContent = String(session.username || '?').charAt(0).toUpperCase();
    else a.innerHTML = ICON_PERSON;
    return a;
  }

  function renderAccount() {
    var session = GW.session.get();
    document.querySelectorAll('[data-account]').forEach(function (btn) {
      btn.textContent = '';
      btn.classList.toggle('is-signed', !!session);
      btn.appendChild(avatar(session));
      if (btn.hasAttribute('data-compact')) return;
      var text = h('span', 'account__text');
      text.appendChild(h('span', 'account__name', session ? session.username : L.t('profile.guest')));
      text.appendChild(h('span', 'account__role', sessionRole(session)));
      btn.appendChild(text);
      btn.insertAdjacentHTML('beforeend', ICON_CHEV);
      btn.setAttribute('data-tip', session ? session.username : L.t('account.label'));
    });
  }

  function popItem(tag, icon, label, sub) {
    var el = h(tag, 'gw-pop__item');
    if (tag === 'button') el.type = 'button';
    el.insertAdjacentHTML('afterbegin', icon);
    var t = h('span');
    t.appendChild(document.createTextNode(label));
    if (sub) t.appendChild(h('span', 'gw-pop__sub', sub));
    el.appendChild(t);
    return el;
  }

  function buildAccount(box) {
    var session = GW.session.get();
    var who = h('div', 'gw-pop__who');
    who.appendChild(h('p', 'gw-pop__name', session ? session.username : L.t('profile.guest')));
    who.appendChild(h('p', 'gw-pop__role', sessionRole(session)));
    box.appendChild(who);
    if (session) {
      var out = popItem('button', ICON_OUT, L.t('profile.logout'));
      out.addEventListener('click', function () {
        GW.session.clear();
        closePop();
        renderAccount();
        document.dispatchEvent(new CustomEvent('gw:session'));
      });
      box.appendChild(out);
    } else {
      var login = popItem('a', ICON_IN, L.t('profile.login'));
      login.href = GW.authUrl('login');
      var signup = popItem('a', ICON_ADD, L.t('reports.signup'));
      signup.href = GW.authUrl('signup');
      box.appendChild(login);
      box.appendChild(signup);
    }
  }

  document.querySelectorAll('[data-account]').forEach(function (btn) {
    btn.addEventListener('click', function () { openPop(btn, 'account', buildAccount); });
  });

  /* ---------- Sidebar: collapse and expand ---------- */

  var toggle = document.querySelector('[data-sb-toggle]');

  function isMini() { return root.classList.contains('sb-mini'); }

  function syncToggle() {
    if (!toggle) return;
    var mini = isMini();
    var key = mini ? 'sb.expand' : 'sb.collapse';
    toggle.setAttribute('aria-expanded', String(!mini));
    toggle.setAttribute('data-i18n-tip', key);
    toggle.setAttribute('data-tip', L.t(key));
    var label = toggle.querySelector('[data-sb-toggle-label]');
    label.setAttribute('data-i18n', key);
    label.textContent = L.t(key);
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var mini = !isMini();
      root.classList.toggle('sb-mini', mini);
      try { localStorage.setItem('gw_sidebar', mini ? 'mini' : 'full'); } catch (e) { /* storage blocked */ }
      closePop();
      hideTip();
      syncToggle();
      document.dispatchEvent(new CustomEvent('gw:sidebar', { detail: { mini: mini } }));
    });
  }
  syncToggle();
  // Turn on the width animation only after the first paint, so a remembered state never animates in
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('sb-ready'); }); });

  // Tooltips only while collapsed, when the labels are hidden
  var sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tip]');
      if (el && isMini() && sidebar.contains(el)) showTip(el); else hideTip();
    });
    sidebar.addEventListener('mouseleave', hideTip);
    sidebar.addEventListener('focusin', function (e) {
      var el = e.target.closest('[data-tip]');
      if (el && isMini()) showTip(el);
    });
    sidebar.addEventListener('focusout', hideTip);
  }

  /* ---------- Levels group ---------- */

  var LEVELS = [
    { key: 'dams', href: 'dams.html', name: 'nav.dams', sub: 'nav.damsSub' },
    { key: 'water', href: 'water.html', name: 'nav.water', sub: 'nav.waterSub' }
  ];

  function currentPage() { return (window.location.pathname.split('/').pop() || 'home.html'); }

  function buildLevels(box) {
    box.appendChild(h('p', 'gw-pop__title', L.t('nav.levels')));
    LEVELS.forEach(function (lv) {
      var src = document.querySelector('.nav__sub [data-nav="' + lv.key + '"] .ic');
      var a = popItem('a', src ? src.outerHTML : '', L.t(lv.name), L.t(lv.sub));
      a.href = lv.href;
      a.setAttribute('data-nav', lv.key);
      if (currentPage() === lv.href) { a.classList.add('is-active'); a.setAttribute('aria-current', 'page'); }
      box.appendChild(a);
    });
  }

  document.querySelectorAll('[data-group-toggle]').forEach(function (btn) {
    var group = btn.closest('[data-group]');
    btn.addEventListener('click', function () {
      if (isMini()) { openPop(btn, 'fly', buildLevels); return; }
      var open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* ---------- Small screens: Levels sheet ---------- */

  var sheet = document.querySelector('[data-sheet]');
  var sheetBtn = document.querySelector('[data-sheet-toggle]');

  function setSheet(open) {
    if (!sheet) return;
    sheet.hidden = !open;
    sheetBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      var first = sheet.querySelector('.sheet__item');
      if (first) first.focus({ preventScroll: true });
    } else {
      sheetBtn.focus({ preventScroll: true });
    }
  }
  if (sheet && sheetBtn) {
    sheetBtn.addEventListener('click', function () { setSheet(sheet.hidden); });
    sheet.querySelector('[data-sheet-close]').addEventListener('click', function () { setSheet(false); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!pop.hidden) closePop(true);
    if (sheet && !sheet.hidden) setSheet(false);
    hideTip();
  });

  /* ---------- Page changes ---------- */

  // Clicking a menu link: a 3D press, then remember where it was so the next page can ripple out from it.
  // Clicking the page you are already on does nothing but say "you are here".
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href$=".html"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!a.closest('.sidebar, .tabbar, .sheet, .gw-pop, .topbar')) return;
    var target = a.getAttribute('href').split('#')[0];
    if (target === currentPage()) {
      e.preventDefault();
      replay(a, 'is-here', 500);
      closePop();
      if (sheet && !sheet.hidden) setSheet(false);
      return;
    }
    var r = a.getBoundingClientRect();
    var x = e.clientX || r.left + r.width / 2;
    var y = e.clientY || r.top + r.height / 2;
    try { sessionStorage.setItem('gw_vt', JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (err) { /* storage blocked */ }
    replay(a, 'is-pressing', 400);
  });

  /* ---------- Bell ---------- */

  GW.shell = { alerts: null, error: null };

  var bellBtn = document.querySelector('[data-bell]');
  var bellPanel = document.querySelector('[data-bell-panel]');
  var lastCount = null;

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
    // A new alert arrived: the bell rings and the badge pops
    if (lastCount !== null && n > lastCount) {
      replay(bellBtn, 'is-ringing', 1000);
      replay(count, 'is-pop', 500);
    }
    lastCount = n;
  }

  function setBell(open) {
    bellPanel.hidden = !open;
    bellBtn.setAttribute('aria-expanded', String(open));
  }

  if (bellBtn) {
    bellBtn.addEventListener('click', function () {
      if (bellPanel.hidden) replay(bellBtn, 'is-ringing', 1000);
      setBell(bellPanel.hidden);
    });
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

  /* ---------- Hold refreshes while someone is reading ----------
     Sections marked [data-hold] pause the page's automatic refresh while the pointer is over them or
     keyboard focus is inside. A refresh that comes due meanwhile waits, and runs as soon as they move away
     (after a short grace, so gliding from one card to the next does not trigger it). */

  var holdRegions = Array.prototype.slice.call(document.querySelectorAll('[data-hold]'));
  var holding = 0;
  var releaseTimer = 0;
  var releaseFns = [];
  var pausedEl = null;

  function setPaused(on) {
    if (!pausedEl) {
      // A small chip in the corner, so it is visible wherever the reader has scrolled to
      pausedEl = h('p', 'data-paused');
      pausedEl.setAttribute('role', 'status');
      pausedEl.hidden = true;
      document.body.appendChild(pausedEl);
    }
    pausedEl.textContent = L.t('status.paused');
    pausedEl.hidden = !on;
  }

  function holdStart() {
    holding++;
    clearTimeout(releaseTimer);
  }
  function holdEnd() {
    holding = Math.max(0, holding - 1);
    clearTimeout(releaseTimer);
    if (holding) return;
    releaseTimer = setTimeout(function () {
      if (holding) return;
      setPaused(false);
      releaseFns.forEach(function (fn) { fn(); });
    }, 500);
  }

  holdRegions.forEach(function (el) {
    el.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') holdStart(); });
    el.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') holdEnd(); });
    el.addEventListener('focusin', function (e) { if (!e.relatedTarget || !el.contains(e.relatedTarget)) holdStart(); });
    el.addEventListener('focusout', function (e) { if (!e.relatedTarget || !el.contains(e.relatedTarget)) holdEnd(); });
  });

  GW.hold = {
    // True while someone is reading: the caller should wait instead of refreshing
    active: function () { return holding > 0; },
    // A refresh was skipped: show it in the top bar until the reader moves away
    deferred: function () { setPaused(true); },
    // Run fn when the reader moves away
    onRelease: function (fn) { releaseFns.push(fn); }
  };

  /* ---------- Start ---------- */

  renderAccount();
  renderBell();
  loadAlerts();
  setInterval(function () { if (!document.hidden) loadAlerts(); }, 30 * 1000);

  // Language change: the switch letters turn over and the page content turns with them
  document.addEventListener('gw:lang', function () {
    renderAccount();
    renderBell();
    syncToggle();
    closePop();
    if (pausedEl) pausedEl.textContent = L.t('status.paused');
    replay(document.querySelector('.lang-switch'), 'is-flipping', 600);
    replay(document.querySelector('.content'), 'is-lang-turn', 600);
  });

  // Logged in or out in another tab: update this one too
  window.addEventListener('storage', function (e) {
    if (e.key !== 'gw_session' && e.key !== null) return;
    renderAccount();
    document.dispatchEvent(new CustomEvent('gw:session'));
  });
  document.addEventListener('gw:session', renderAccount);

  // Admin accounts use the admin pages only: signing in as one (here or in another tab) moves this page there.
  // The admin pages handle the other direction themselves (js/admin/core.js).
  document.addEventListener('gw:session', function () {
    var s = GW.session.get();
    if (s && s.role === 'admin' && root.getAttribute('data-area') !== 'admin') window.location.replace(GW.url('admin'));
  });
})(window.GW = window.GW || {});
