/* GunWaree: the note about missing readings, shown in the middle of the screen whenever
   Dam levels or Water levels opens.

   Some stations and dams do not always report, and the pages show a gap ("Awaiting report",
   "No recent report") rather than a guess. The note explains that, with an apology, every time the
   page opens, until the visitor ticks "Do not show this again". That choice is remembered on this
   device only. It appears after the page transition has finished and closes with its button or Esc. */

(function (GW) {
  'use strict';

  // v2: choices saved by earlier versions of this note (which worked differently) no longer hide it
  var KEY = 'gw_data_notice_v2';
  var lang = GW.lang;
  var h = GW.fmt.h;

  try { if (localStorage.getItem(KEY) === 'off') return; } catch (e) { /* storage blocked: show it */ }

  var dialog = h('dialog', 'notice');
  if (typeof dialog.showModal !== 'function') return;
  dialog.setAttribute('aria-labelledby', 'notice-title');
  dialog.setAttribute('aria-describedby', 'notice-body');

  var panel = h('div', 'notice__panel');
  // A drop with a small gap in it: data that has not arrived yet. The gap closes once as it opens.
  panel.insertAdjacentHTML('beforeend',
    '<span class="notice__icon" aria-hidden="true"><svg viewBox="0 0 40 40">' +
    '<path d="M20 4c-5 7-11 13.3-11 19.6a11 11 0 0 0 22 0C31 17.3 25 11 20 4Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path class="notice__line" d="M13.5 25h4M22.5 25h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    '</svg></span>');
  var title = h('h2', 'notice__title');
  title.id = 'notice-title';
  var body = h('div', 'notice__body');
  body.id = 'notice-body';
  var p1 = h('p');
  var p2 = h('p', 'notice__sorry');
  body.appendChild(p1);
  body.appendChild(p2);

  var foot = h('div', 'notice__foot');
  var label = h('label', 'notice__check');
  var box = h('input');
  box.type = 'checkbox';
  var boxText = h('span');
  label.appendChild(box);
  label.appendChild(boxText);
  var ok = h('button', 'btn notice__ok');
  ok.type = 'button';
  foot.appendChild(label);
  foot.appendChild(ok);

  panel.appendChild(title);
  panel.appendChild(body);
  panel.appendChild(foot);
  dialog.appendChild(panel);
  document.body.appendChild(dialog);

  function fill() {
    title.textContent = lang.t('notice.title');
    p1.textContent = lang.t('notice.body');
    p2.textContent = lang.t('notice.sorry');
    boxText.textContent = lang.t('notice.dont');
    ok.textContent = lang.t('notice.ok');
  }
  fill();
  document.addEventListener('gw:lang', fill);

  ok.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('close', function () {
    if (box.checked) {
      try { localStorage.setItem(KEY, 'off'); } catch (e) { /* storage blocked */ }
    }
    dialog.remove();
  });

  // After the page change has settled, so it never interrupts the transition.
  // If the browser never reports that, show it anyway after a moment.
  var shown = false;
  function show() {
    if (shown || !dialog.isConnected) return;
    shown = true;
    try { dialog.showModal(); } catch (e) { dialog.setAttribute('open', ''); }
    ok.focus();
  }
  Promise.resolve(window.gwRevealed).then(show, show);
  setTimeout(show, 1500);
})(window.GW = window.GW || {});
