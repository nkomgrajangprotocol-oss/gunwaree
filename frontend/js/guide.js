/* GunWaree: the one-time guide to the app: one for users (the user pages), one for admins (the admin pages).

   Starts just after the "This is a demo website" box (js/demo.js) is closed, or, if that box is not showing on this
   page, once the page has appeared. It walks through each part of the app: a light ring picks out the part on the
   page and a card explains it. Back and Next move between steps (Next also skips a step); the last step finishes.
   The cross asks first ("Close the tutorial?"): Yes closes it, No goes back to the same step. Esc does the same as
   the cross. Finishing or closing is remembered for this tab only (sessionStorage gw_guide = 'done' for users,
   gw_guide_admin = 'done' for admins), so each shows once per tab: a new tab or window shows it again.
   The admin guide also goes before the Hardware control notice (js/admin/hardware.js waits for it).
   While it is open, the missing-data note (js/notice.js) waits for it. No requests are made. */

(function (GW) {
  'use strict';

  var L = GW.lang;
  var h = GW.fmt.h;

  // Admin pages carry <html data-area="admin">: only an admin gets the admin guide, and only users get theirs
  var adminArea = document.documentElement.getAttribute('data-area') === 'admin';
  var session = GW.session && GW.session.get();
  var isAdmin = !!(session && session.role === 'admin');
  if (adminArea !== isAdmin) return;
  var KEY = adminArea ? 'gw_guide_admin' : 'gw_guide';
  try { if (sessionStorage.getItem(KEY) === 'done') return; } catch (e) { /* storage blocked: show it */ }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var phone = window.matchMedia('(max-width: 640px)');

  // Each step: its text (key + '.title' and key + '.body'), and where the part is on the page
  // (the first visible match; none = the card in the middle)
  var USER_STEPS = [
    { key: 'guide.welcome', targets: [] },
    { key: 'guide.menu', targets: ['.sidebar .nav__list', '.tabbar'] },
    { key: 'guide.risk', targets: ['[data-card="risk"]', '[data-rstage]', '.sidebar [data-nav="risk"]', '.tabbar [data-nav="risk"]'] },
    { key: 'guide.near', targets: ['[data-near-open]'] },
    { key: 'guide.levels', targets: ['.sidebar [data-group]', '.tabbar [data-sheet-toggle]'] },
    { key: 'guide.reports', targets: ['.sidebar [data-nav="reports"]', '.tabbar [data-nav="reports"]'] },
    { key: 'guide.bell', targets: ['[data-bell]'] },
    { key: 'guide.live', targets: ['.live-btn'] },
    { key: 'guide.lang', targets: ['.topbar .lang-switch'] },
    { key: 'guide.account', targets: ['.sidebar [data-account]', '.topbar__account'] },
    { key: 'guide.sos', targets: ['.sidebar .nav__item--sos'] },
    { key: 'guide.done', targets: ['[data-demo-open]'] }
  ];
  var ADMIN_STEPS = [
    { key: 'gd.welcome', targets: [] },
    { key: 'gd.menu', targets: ['.sidebar .nav__list', '.tabbar'] },
    { key: 'gd.dashboard', targets: ['.sidebar [data-nav="admin"]', '.tabbar [data-nav="admin"]'] },
    { key: 'gd.alerts', targets: ['.sidebar [data-nav="admin-alerts"]', '.tabbar [data-nav="admin-alerts"]'] },
    { key: 'gd.reports', targets: ['.sidebar [data-nav="admin-reports"]', '.tabbar [data-nav="admin-reports"]'] },
    { key: 'gd.hardware', targets: ['.sidebar [data-nav="admin-hardware"]', '.tabbar [data-nav="admin-hardware"]'] },
    { key: 'gd.bell', targets: ['[data-bell]'] },
    { key: 'guide.live', targets: ['.live-btn'] },
    { key: 'guide.lang', targets: ['.topbar .lang-switch'] },
    { key: 'gd.account', targets: ['.sidebar [data-account]', '.topbar__account'] },
    { key: 'guide.done', targets: ['[data-demo-open]'] }
  ];
  var STEPS = adminArea ? ADMIN_STEPS : USER_STEPS;

  var step = 0;
  var target = null;
  var active = false;

  /* ---------- The overlay: a full-screen modal dialog holding the ring and the card ---------- */

  var dialog = h('dialog', 'guide');
  if (typeof dialog.showModal !== 'function') return;
  dialog.setAttribute('aria-labelledby', 'guide-title');
  dialog.setAttribute('aria-describedby', 'guide-body');

  var spot = h('div', 'guide__spot');
  spot.setAttribute('aria-hidden', 'true');
  var card = h('div', 'guide__card');

  var closeBtn = h('button', 'guide__close');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var count = h('p', 'guide__count');
  var title = h('h2', 'guide__title');
  title.id = 'guide-title';
  var body = h('p', 'guide__body');
  body.id = 'guide-body';
  var dots = h('div', 'guide__dots');
  dots.setAttribute('aria-hidden', 'true');
  var foot = h('div', 'guide__foot');
  var backBtn = h('button', 'guide__back');
  backBtn.type = 'button';
  var nextBtn = h('button', 'btn guide__next');
  nextBtn.type = 'button';
  foot.appendChild(backBtn);
  foot.appendChild(nextBtn);

  // "Close the tutorial?" in place of the step, inside the same card
  var ask = h('div', 'guide__ask');
  ask.hidden = true;
  var askTitle = h('h2', 'guide__title');
  var askBody = h('p', 'guide__body');
  var askFoot = h('div', 'guide__foot');
  var noBtn = h('button', 'guide__back');
  noBtn.type = 'button';
  var yesBtn = h('button', 'btn guide__next');
  yesBtn.type = 'button';
  askFoot.appendChild(noBtn);
  askFoot.appendChild(yesBtn);
  ask.appendChild(askTitle);
  ask.appendChild(askBody);
  ask.appendChild(askFoot);

  var stepBox = h('div', 'guide__step');
  stepBox.appendChild(count);
  stepBox.appendChild(title);
  stepBox.appendChild(body);
  stepBox.appendChild(dots);
  stepBox.appendChild(foot);

  card.appendChild(closeBtn);
  card.appendChild(stepBox);
  card.appendChild(ask);
  dialog.appendChild(spot);
  dialog.appendChild(card);
  document.body.appendChild(dialog);

  STEPS.forEach(function () { dots.appendChild(h('span')); });

  /* ---------- Finding and framing the part of the page ---------- */

  function visible(e) {
    if (!e || !e.isConnected) return false;
    var r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(e);
    // offsetParent is null for fixed elements (the phone tab bar), so those count as visible too
    return cs.visibility !== 'hidden' && cs.display !== 'none' && (e.offsetParent !== null || cs.position === 'fixed');
  }

  function findTarget(s) {
    for (var i = 0; i < s.targets.length; i++) {
      var list = document.querySelectorAll(s.targets[i]);
      for (var j = 0; j < list.length; j++) if (visible(list[j])) return list[j];
    }
    return null;
  }

  var raf = 0;
  function place() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var vw = window.innerWidth, vh = window.innerHeight;
      var cw = card.offsetWidth, ch = card.offsetHeight;
      var gap = 14;
      card.classList.remove('is-center');
      if (!target || !visible(target)) {
        spot.classList.add('is-none');
        card.classList.add('is-center');
        card.style.left = Math.round((vw - cw) / 2) + 'px';
        card.style.top = Math.round((vh - ch) / 2) + 'px';
        return;
      }
      var r = target.getBoundingClientRect();
      var pad = 6;
      spot.classList.remove('is-none');
      spot.style.left = Math.round(r.left - pad) + 'px';
      spot.style.top = Math.round(r.top - pad) + 'px';
      spot.style.width = Math.round(r.width + pad * 2) + 'px';
      spot.style.height = Math.round(r.height + pad * 2) + 'px';

      var x, y;
      if (phone.matches) {
        // Phones: the card spans the width, on the half of the screen away from the part
        x = Math.round((vw - cw) / 2);
        y = (r.top + r.height / 2) > vh / 2 ? Math.max(12, r.top - pad - gap - ch) : Math.min(vh - ch - 12, r.bottom + pad + gap);
        if (y < 12) y = 12;
      } else if (r.right + pad + gap + cw <= vw - 12 && r.left < vw * 0.35) {
        // A part on the left (the sidebar): the card to its right
        x = r.right + pad + gap;
        y = Math.min(Math.max(12, r.top), vh - ch - 12);
      } else if (r.bottom + pad + gap + ch <= vh - 12) {
        // Below it when there is room
        x = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
        y = r.bottom + pad + gap;
      } else if (r.top - pad - gap - ch >= 12) {
        // Otherwise above it
        x = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
        y = r.top - pad - gap - ch;
      } else {
        // A tall part: beside it, on whichever side has room, so the card never covers it
        x = r.left - pad - gap - cw >= 12 ? r.left - pad - gap - cw : Math.min(r.right + pad + gap, vw - cw - 12);
        y = Math.min(Math.max(12, r.top + r.height / 2 - ch / 2), vh - ch - 12);
      }
      card.style.left = Math.round(x) + 'px';
      card.style.top = Math.round(y) + 'px';
    });
  }

  /* ---------- Steps ---------- */

  function fill() {
    var s = STEPS[step];
    var last = step === STEPS.length - 1;
    count.textContent = L.t('guide.step', { n: step + 1, total: STEPS.length });
    title.textContent = L.t(s.key + '.title');
    body.textContent = L.t(s.key + '.body');
    backBtn.textContent = L.t('guide.back');
    backBtn.disabled = step === 0;
    nextBtn.textContent = L.t(last ? 'guide.finish' : 'guide.next');
    closeBtn.setAttribute('aria-label', L.t('guide.close'));
    closeBtn.title = L.t('guide.close');
    askTitle.textContent = L.t('guide.askTitle');
    askBody.textContent = L.t('guide.askBody');
    noBtn.textContent = L.t('guide.no');
    yesBtn.textContent = L.t('guide.yes');
    Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('is-on', i === step); });
  }

  function show(i) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    target = findTarget(STEPS[step]);
    fill();
    if (target) {
      var r = target.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) {
        target.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
        setTimeout(place, reduce.matches ? 0 : 420);
      }
    }
    place();
    card.classList.remove('is-turning');
    if (!reduce.matches) { void card.offsetWidth; card.classList.add('is-turning'); }
    nextBtn.focus();
  }

  function finish() {
    active = false;
    try { sessionStorage.setItem(KEY, 'done'); } catch (e) { /* storage blocked */ }
    dialog.close();
  }

  function askClose() {
    stepBox.hidden = true;
    ask.hidden = false;
    closeBtn.hidden = true;
    place();
    noBtn.focus();
  }
  function keepGoing() {
    ask.hidden = true;
    stepBox.hidden = false;
    closeBtn.hidden = false;
    place();
    nextBtn.focus();
  }

  backBtn.addEventListener('click', function () { if (step > 0) show(step - 1); });
  nextBtn.addEventListener('click', function () {
    if (step === STEPS.length - 1) finish(); else show(step + 1);
  });
  closeBtn.addEventListener('click', askClose);
  noBtn.addEventListener('click', keepGoing);
  yesBtn.addEventListener('click', finish);
  // Esc works like the cross: ask first. Esc on the question goes back to the step.
  // Handled on keydown, because Chrome may skip the cancelable 'cancel' event and close the dialog outright.
  function onEsc() { if (ask.hidden) askClose(); else keepGoing(); }
  dialog.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    onEsc();
  });
  dialog.addEventListener('cancel', function (e) {
    e.preventDefault();
  });
  dialog.addEventListener('close', function () {
    // Closed by the browser rather than by Finish or "Yes" (for example a phone's back gesture):
    // open it again and ask, like the cross
    if (active) {
      try { dialog.showModal(); } catch (e) { dialog.setAttribute('open', ''); }
      askClose();
      return;
    }
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    document.dispatchEvent(new CustomEvent('gw:guide-closed'));
    dialog.remove();
  });
  document.addEventListener('gw:lang', function () { if (active) { fill(); place(); } });

  /* ---------- Starting ---------- */

  var started = false;
  function start() {
    if (started) return;
    started = true;
    active = true;
    try { dialog.showModal(); } catch (e) { dialog.setAttribute('open', ''); }
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    show(0);
  }

  // Other boxes (js/notice.js) wait while the guide is open or about to open
  GW.guide = { busy: function () { return !started || active; } };

  function startSoon() { setTimeout(start, 350); }
  if (GW.demo && GW.demo.busy()) {
    document.addEventListener('gw:demo-closed', startSoon, { once: true });
  } else {
    Promise.resolve(window.gwRevealed).then(startSoon, startSoon);
    setTimeout(startSoon, 1500);
  }
})(window.GW = window.GW || {});
