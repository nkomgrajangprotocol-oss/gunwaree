/* GunWaree: the "This is a demo website" box, wording from the Captain (demo.* in js/lang.js).

   Shown in the middle of the screen every time someone presses Enter on the intro page (the page they land on
   carries .is-arriving-sky, set in its <head> from the intro's sessionStorage gw_warp), and the first time anyone
   opens the app some other way. Closing it ("Got it" or Esc) is remembered on this device (localStorage
   gw_demo_notice = 'off'), so it does not come back on other pages until the next Enter.
   "About this demo" at the foot of every app page ([data-demo-open]) opens it again.
   It reuses the dialog and look of the missing-data note (js/notice.js, .notice in css/app.css); that note waits
   until this box is closed, so the two never open on top of each other. No requests are made. */

(function (GW) {
  'use strict';

  var KEY = 'gw_demo_notice';
  var lang = GW.lang;
  var h = GW.fmt.h;

  var dialog = h('dialog', 'notice notice--demo');
  if (typeof dialog.showModal !== 'function') return;
  dialog.setAttribute('aria-labelledby', 'demo-title');
  dialog.setAttribute('aria-describedby', 'demo-lead');

  var panel = h('div', 'notice__panel');
  var title = h('h2', 'notice__title');
  title.id = 'demo-title';
  var lead = h('p', 'demo__lead');
  lead.id = 'demo-lead';
  var list = h('ol', 'demo__list');
  list.setAttribute('role', 'list');
  var foot = h('div', 'notice__foot demo__foot');
  var ok = h('button', 'btn notice__ok');
  ok.type = 'button';
  foot.appendChild(ok);
  panel.appendChild(title);
  panel.appendChild(lead);
  panel.appendChild(list);
  dialog.appendChild(panel);
  dialog.appendChild(foot);
  document.body.appendChild(dialog);

  // Item 5 with its two links: the {privacy} and {terms} places in the sentence become links
  function itemWithLinks() {
    var li = h('li');
    var parts = lang.t('demo.p5', { privacy: '\u0001', terms: '\u0002' }).split(/([\u0001\u0002])/);
    parts.forEach(function (part) {
      if (part === '\u0001' || part === '\u0002') {
        var a = h('a', null, lang.t(part === '\u0001' ? 'demo.privacy' : 'demo.terms'));
        a.href = part === '\u0001' ? 'privacy.html' : 'terms.html';
        li.appendChild(a);
      } else if (part) {
        li.appendChild(document.createTextNode(part));
      }
    });
    return li;
  }

  function fill() {
    title.textContent = lang.t('demo.title');
    lead.textContent = lang.t('demo.lead');
    list.textContent = '';
    ['demo.p1', 'demo.p2', 'demo.p3', 'demo.p4'].forEach(function (key) { list.appendChild(h('li', null, lang.t(key))); });
    list.appendChild(itemWithLinks());
    ok.textContent = lang.t('demo.ok');
  }
  fill();
  document.addEventListener('gw:lang', fill);

  var seen = false;
  try { seen = localStorage.getItem(KEY) === 'off'; } catch (e) { /* storage blocked: show it */ }
  var fromIntro = document.documentElement.classList.contains('is-arriving-sky');
  var pending = !seen || fromIntro;   // will open by itself on this page

  function open() {
    if (dialog.open) return;
    try { dialog.showModal(); } catch (e) { dialog.setAttribute('open', ''); }
    panel.scrollTop = 0;
    ok.focus();
  }

  ok.addEventListener('click', function () { dialog.close(); });
  // Esc closes a modal dialog by itself and fires 'close' too
  dialog.addEventListener('close', function () {
    pending = false;
    try { localStorage.setItem(KEY, 'off'); } catch (e) { /* storage blocked */ }
    document.dispatchEvent(new CustomEvent('gw:demo-closed'));
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-demo-open]');
    if (!btn) return;
    e.preventDefault();
    open();
  });

  // Other boxes (js/notice.js) wait while this one is open or about to open
  GW.demo = { busy: function () { return pending || dialog.open; } };

  if (pending) {
    // After the page change has settled, so it never interrupts the transition
    var shown = false;
    var first = function () {
      if (shown) return;
      shown = true;
      open();
    };
    Promise.resolve(window.gwRevealed).then(first, first);
    setTimeout(first, 1500);
  }
})(window.GW = window.GW || {});
