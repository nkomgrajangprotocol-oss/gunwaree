/* Admin: Alert queue (admin-alerts.html).

   GET  /admin/alerts             every 20 seconds  all alerts (id, message, severity, status, created_at)
   GET  /alerts                   with it           sent alerts with sent_at (the admin list has no sent_at)
   POST /admin/alerts             New alert         saved as pending: nobody sees it yet
   POST /admin/alerts/{id}/send   Send              it appears in everyone's alert bell and on Home
   GET  /risk                     when writing      the current level, to suggest wording (stores a prediction row)

   The backend has no "hold" state: Hold keeps the alert pending and moves on to the next one.
   Alerts cannot be edited or deleted once saved. */

(function (GW) {
  'use strict';

  var A = GW.admin;
  var L = GW.lang;
  var h = A.h;
  var $ = A.$;

  var RANK = { critical: 0, warning: 1, watch: 2 };
  var MAX = 500;

  // Suggested wording people will read in the bell (messages are written in Thai, like the rest of the alerts)
  var TEMPLATES = {
    watch: 'ระดับน้ำแม่น้ำเจ้าพระยาที่อยุธยาใกล้ตลิ่ง โปรดติดตามข่าวสารอย่างใกล้ชิด',
    warning: 'ระดับน้ำที่อยุธยาใกล้ตลิ่งและกำลังสูงขึ้น เตรียมยกของขึ้นที่สูงและติดตามประกาศของหน่วยงาน',
    critical: 'ระดับน้ำที่อยุธยาถึงตลิ่งแล้ว ปฏิบัติตามคำแนะนำการอพยพของหน่วยงานท้องถิ่น หากต้องการความช่วยเหลือโทร 1669'
  };

  var ICONS = {
    critical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 8c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 12.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 17c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5h16"/><path d="M5 15.5 9.5 11l3 2.5L19 7"/><path d="M15 7h4v4"/></svg>',
    watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  var state = {
    list: undefined, error: null, sentAt: {}, tab: 'pending', selected: null, composing: false,
    draft: { severity: 'watch', message: '' }, risk: undefined, riskAt: 0, busy: false
  };

  function code(id) { return 'AL-' + String(id).padStart(4, '0'); }
  function rank(sev) { return Object.prototype.hasOwnProperty.call(RANK, sev) ? RANK[sev] : 9; }
  function tone(sev) { return A.TONE[sev] || 'grey'; }

  function sorted(list) {
    return list.slice().sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return (rank(a.severity) - rank(b.severity)) || (b.id - a.id);
    });
  }

  function visible() {
    var list = state.list || [];
    if (state.tab !== 'all') list = list.filter(function (a) { return a.status === state.tab; });
    return sorted(list);
  }

  function find(id) {
    var list = state.list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- Headline and tabs ---------- */

  function renderTop() {
    var list = state.list || [];
    var pending = list.filter(function (a) { return a.status === 'pending'; });
    var sent = list.length - pending.length;
    var critical = pending.filter(function (a) { return a.severity === 'critical'; }).length;

    var banner = $('[data-al-banner]');
    var head = $('[data-al-headline]');
    if (state.list === undefined) head.textContent = L.t('ad.loading');
    else if (!state.list) head.textContent = L.t('ad.al.error');
    else if (critical) head.textContent = L.t(critical === 1 ? 'ad.al.critical1' : 'ad.al.criticalN', { n: critical });
    else if (pending.length) head.textContent = L.t(pending.length === 1 ? 'ad.al.pending1' : 'ad.al.pendingN', { n: pending.length });
    else head.textContent = L.t('ad.al.clear');
    banner.setAttribute('data-tone', critical ? 'red' : pending.length ? 'orange' : 'green');

    var counts = $('[data-al-counts]');
    counts.textContent = '';
    counts.appendChild(A.tag(L.t('ad.al.countPending', { n: pending.length }), 'grey'));
    counts.appendChild(A.tag(L.t('ad.al.countSent', { n: sent }), 'green'));

    A.$$('[data-al-tabs] [data-tab]').forEach(function (b) {
      var k = b.getAttribute('data-tab');
      var n = k === 'pending' ? pending.length : k === 'sent' ? sent : list.length;
      b.textContent = '';
      b.appendChild(h('span', null, L.t('ad.al.tab.' + k)));
      b.appendChild(h('span', 'tabs__n', String(n)));
      b.setAttribute('aria-selected', String(k === state.tab));
      b.tabIndex = k === state.tab ? 0 : -1;
    });
  }

  /* ---------- The list ---------- */

  function renderList() {
    var ol = $('[data-al-items]');
    ol.textContent = '';
    if (state.list === undefined) {
      for (var s = 0; s < 3; s++) ol.appendChild(h('li', 'al-item al-item--sk', '')).appendChild(h('span', 'sk sk--wide'));
      return;
    }
    if (!state.list) { ol.appendChild(h('li', 'box__error', L.t('ad.al.error'))); return; }
    var list = visible();
    if (!list.length) {
      ol.appendChild(h('li', 'al-empty', L.t(state.tab === 'pending' ? 'ad.al.emptyPending' : 'ad.al.empty')));
      return;
    }
    list.forEach(function (al, i) {
      var li = h('li');
      li.style.setProperty('--i', i);
      var btn = h('button', 'al-item al-item--' + tone(al.severity) + (al.id === state.selected && !state.composing ? ' is-selected' : ''));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(al.id === state.selected && !state.composing));
      var icon = h('span', 'al-item__icon');
      icon.innerHTML = ICONS[al.severity] || ICONS.watch;
      btn.appendChild(icon);
      var main = h('span', 'al-item__main');
      var meta = h('span', 'al-item__meta');
      meta.appendChild(h('span', 'al-item__id', code(al.id)));
      meta.appendChild(A.tag(A.levelLabel(al.severity), tone(al.severity)));
      main.appendChild(meta);
      main.appendChild(A.text('span', 'al-item__msg', al.message));
      var when = L.t('ad.al.created', { time: A.time(al.created_at) });
      if (al.status === 'sent' && state.sentAt[al.id]) when += ' · ' + L.t('ad.al.sentAt', { time: A.time(state.sentAt[al.id]) });
      main.appendChild(h('span', 'al-item__when', when));
      btn.appendChild(main);
      var side = h('span', 'al-item__side');
      side.appendChild(h('span', 'al-item__status al-item__status--' + al.status, L.t('ad.al.status.' + al.status)));
      side.appendChild(h('span', 'al-item__cta', al.id === state.selected && !state.composing ? L.t('ad.al.selected') : L.t('ad.al.review')));
      btn.appendChild(side);
      btn.addEventListener('click', function () {
        state.selected = al.id;
        state.composing = false;
        renderList();
        renderReview(true);
      });
      li.appendChild(btn);
      ol.appendChild(li);
    });
  }

  /* ---------- Review panel ---------- */

  // How the alert looks in the bell for everyone
  function preview(al) {
    var box = h('div', 'bell-preview bell-preview--' + tone(al.severity));
    box.appendChild(h('p', 'bell-preview__title', L.t('ad.al.previewTitle')));
    box.appendChild(A.text('p', 'bell-preview__msg', al.message));
    box.appendChild(h('p', 'bell-preview__meta', A.levelLabel(al.severity) + (al.when ? ', ' + al.when : '')));
    return box;
  }

  function renderReview(focus) {
    var panel = $('[data-al-review]');
    panel.textContent = '';
    panel.classList.remove('is-swapping');
    void panel.offsetWidth;
    if (!A.reduceMotion()) panel.classList.add('is-swapping');

    if (state.composing) { renderCompose(panel, focus); return; }

    var al = find(state.selected);
    if (!al) {
      var empty = h('div', 'al-review__empty');
      empty.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 20a10 10 0 0 1 20 0c0 8 3.5 11 3.5 11h-27S14 28 14 20Z"/><path d="M20.5 36a3.7 3.7 0 0 0 7 0"/></svg>';
      empty.appendChild(h('p', 'al-review__emptyTitle', L.t('ad.al.pickTitle')));
      empty.appendChild(h('p', null, L.t('ad.al.pickText')));
      var nb = h('button', 'btn-a btn-a--primary', L.t('ad.al.new'));
      nb.type = 'button';
      nb.addEventListener('click', startCompose);
      empty.appendChild(nb);
      panel.appendChild(empty);
      return;
    }

    var head = h('div', 'box__head');
    var titles = h('div');
    var t = h('h2', 'box__title', L.t('ad.al.reviewTitle', { code: code(al.id) }));
    t.tabIndex = -1;
    titles.appendChild(t);
    titles.appendChild(h('p', 'box__sub', L.t('ad.al.created', { time: A.time(al.created_at) })));
    head.appendChild(titles);
    head.appendChild(A.tag(A.levelLabel(al.severity), tone(al.severity)));
    panel.appendChild(head);

    var fig = h('div', 'al-photo');
    var img = h('img');
    img.src = 'assets/img/bangkok-chao-phraya.jpg';
    img.alt = '';
    img.loading = 'lazy';
    fig.appendChild(img);
    fig.appendChild(h('span', 'al-photo__cap', L.t('ad.al.photo')));
    panel.appendChild(fig);

    var sentAt = state.sentAt[al.id];
    panel.appendChild(h('p', 'al-review__label', L.t('ad.al.preview')));
    panel.appendChild(preview({ severity: al.severity, message: al.message, when: al.status === 'sent' && sentAt ? A.time(sentAt) : L.t('ad.al.whenSent') }));

    var facts = h('ul', 'al-facts');
    facts.setAttribute('role', 'list');
    [['users', L.t('ad.al.audience')],
     ['check', al.status === 'sent' ? (sentAt ? L.t('ad.al.wasSent', { time: A.time(sentAt) }) : L.t('ad.al.status.sent')) : L.t('ad.al.notYet')]
    ].forEach(function (f) {
      var li = h('li', 'al-facts__item');
      li.insertAdjacentHTML('afterbegin', f[0] === 'users'
        ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16c.5-2.8 2.5-4.4 5-4.4s4.5 1.6 5 4.4M13 4.6a2.6 2.6 0 0 1 0 5M15 11.9c1.4.6 2.3 2 2.5 4.1"/></svg>'
        : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="m6.5 10.2 2.3 2.3 4.7-4.8"/></svg>');
      li.appendChild(h('span', null, f[1]));
      facts.appendChild(li);
    });
    panel.appendChild(facts);

    if (al.status === 'pending') {
      var actions = h('div', 'al-actions');
      var hold = h('button', 'btn-a btn-a--ghost', L.t('ad.al.hold'));
      hold.type = 'button';
      hold.addEventListener('click', function () { holdAlert(al); });
      var send = h('button', 'btn-a btn-a--primary');
      send.type = 'button';
      send.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9.5 14-6-6 14-2-6Z"/><path d="m9 11.5 3.5-3.5"/></svg>');
      send.appendChild(h('span', null, L.t('ad.al.send')));
      send.disabled = state.busy;
      send.addEventListener('click', function () { sendAlert(al, send); });
      actions.appendChild(hold);
      actions.appendChild(send);
      panel.appendChild(actions);
      panel.appendChild(h('p', 'box__fine', L.t('ad.al.sendNote')));
    }
    if (focus) t.focus({ preventScroll: true });
  }

  function holdAlert(al) {
    var next = sorted((state.list || []).filter(function (a) { return a.status === 'pending' && a.id !== al.id; }))[0];
    A.toast(L.t('ad.al.held', { code: code(al.id) }));
    state.selected = next ? next.id : null;
    renderList();
    renderReview(true);
  }

  function sendAlert(al, btn) {
    A.confirm({
      title: L.t('ad.al.confirmTitle', { code: code(al.id) }),
      text: L.t('ad.al.confirmText'),
      ok: L.t('ad.al.send'),
      preview: preview({ severity: al.severity, message: al.message, when: L.t('ad.al.whenSent') })
    }).then(function (yes) {
      if (!yes) return;
      state.busy = true;
      btn.disabled = true;
      return A.api('/admin/alerts/' + al.id + '/send', { method: 'POST' }).then(function (res) {
        al.status = 'sent';
        if (res && res.sent_at) state.sentAt[al.id] = res.sent_at;
        A.toast(L.t('ad.al.sentToast', { code: code(al.id) }));
        var next = sorted((state.list || []).filter(function (a) { return a.status === 'pending'; }))[0];
        state.selected = next ? next.id : al.id;
        A.setPending((state.list || []).filter(function (a) { return a.status === 'pending'; }));
      }, function (err) {
        A.toast(A.messageFor(err, { 404: L.t('ad.al.gone') }), 'error');
      }).then(function () {
        state.busy = false;
        render();
        task.now();
      });
    });
  }

  /* ---------- Writing a new alert ---------- */

  function startCompose() {
    state.composing = true;
    renderList();
    renderReview(true);
    // The current level, to suggest wording (at most once every 5 minutes: each call stores a prediction)
    if (Date.now() - state.riskAt > 5 * 60 * 1000) {
      state.riskAt = Date.now();
      A.api('/risk').then(function (r) { state.risk = r; }, function (err) {
        state.risk = err.status === 503 ? null : undefined;
      }).then(function () { if (state.composing) renderSuggest(); });
    }
  }

  function renderSuggest() {
    var box = $('[data-al-suggest]');
    if (!box) return;
    box.textContent = '';
    var r = state.risk;
    var level = r && A.TONE[r.level] ? r.level : null;
    var line = h('p', 'al-suggest__now');
    line.appendChild(document.createTextNode(L.t('ad.al.riskNow') + ' '));
    line.appendChild(level ? A.tag(A.levelLabel(level), A.TONE[level]) : h('span', null, r === null ? L.t('risk.nodata') : '…'));
    box.appendChild(line);
    var chips = h('div', 'al-suggest__chips');
    ['watch', 'warning', 'critical'].forEach(function (sev) {
      var b = h('button', 'chip-a chip-a--' + A.TONE[sev] + (level === sev ? ' is-suggested' : ''), L.t('ad.al.use', { level: A.levelLabel(sev) }));
      b.type = 'button';
      b.addEventListener('click', function () {
        state.draft.severity = sev;
        state.draft.message = TEMPLATES[sev];
        var form = $('[data-al-form]');
        form.elements.severity.value = sev;
        form.elements.message.value = TEMPLATES[sev];
        form.elements.message.dispatchEvent(new Event('input'));
        form.elements.message.focus();
      });
      chips.appendChild(b);
    });
    box.appendChild(chips);
  }

  function renderCompose(panel, focus) {
    var form = h('form', 'al-form');
    form.setAttribute('data-al-form', '');
    form.noValidate = true;
    var t = h('h2', 'box__title', L.t('ad.al.newTitle'));
    t.tabIndex = -1;
    form.appendChild(t);

    var fs = h('fieldset', 'sev');
    fs.appendChild(h('legend', 'field__label', L.t('ad.al.severity')));
    ['watch', 'warning', 'critical'].forEach(function (sev) {
      var lab = h('label', 'sev__opt sev__opt--' + A.TONE[sev]);
      var input = h('input');
      input.type = 'radio';
      input.name = 'severity';
      input.value = sev;
      input.checked = state.draft.severity === sev;
      input.addEventListener('change', function () { state.draft.severity = sev; });
      lab.appendChild(input);
      var txt = h('span', 'sev__text');
      txt.appendChild(h('span', 'sev__name', A.levelLabel(sev)));
      txt.appendChild(h('span', 'sev__hint', L.t('ad.al.sevHint.' + sev)));
      lab.appendChild(txt);
      fs.appendChild(lab);
    });
    form.appendChild(fs);

    var field = h('div', 'field');
    var lab = h('label', 'field__label', L.t('ad.al.message'));
    lab.htmlFor = 'al-message';
    field.appendChild(lab);
    var ta = h('textarea', 'field__input');
    ta.id = 'al-message';
    ta.name = 'message';
    ta.rows = 4;
    ta.maxLength = MAX;
    ta.value = state.draft.message;
    ta.setAttribute('aria-describedby', 'al-count al-err');
    field.appendChild(ta);
    var under = h('div', 'field__under');
    var err = h('p', 'field__error');
    err.id = 'al-err';
    var count = h('p', 'field__count');
    count.id = 'al-count';
    under.appendChild(err);
    under.appendChild(count);
    field.appendChild(under);
    form.appendChild(field);
    function syncCount() {
      state.draft.message = ta.value;
      count.textContent = L.t('ad.al.count', { n: ta.value.trim().length, max: MAX });
      if (ta.value.trim()) { err.textContent = ''; ta.removeAttribute('aria-invalid'); }
    }
    ta.addEventListener('input', syncCount);
    syncCount();

    var suggest = h('div', 'al-suggest');
    suggest.setAttribute('data-al-suggest', '');
    form.appendChild(suggest);

    form.appendChild(h('p', 'box__fine', L.t('ad.al.newNote')));
    var actions = h('div', 'al-actions');
    var cancel = h('button', 'btn-a btn-a--ghost', L.t('ad.cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', function () {
      state.composing = false;
      renderList();
      renderReview(true);
    });
    var save = h('button', 'btn-a btn-a--primary', L.t('ad.al.save'));
    save.type = 'submit';
    actions.appendChild(cancel);
    actions.appendChild(save);
    form.appendChild(actions);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = ta.value.trim();
      if (!msg) {
        err.textContent = L.t('ad.al.needMessage');
        ta.setAttribute('aria-invalid', 'true');
        ta.focus();
        return;
      }
      save.disabled = true;
      save.textContent = L.pick(GW.t.states.saving);
      A.api('/admin/alerts', { method: 'POST', body: { message: msg, severity: state.draft.severity } }).then(function (res) {
        A.toast(L.t('ad.al.savedToast', { code: code(res.id) }));
        state.draft = { severity: 'watch', message: '' };
        state.composing = false;
        state.selected = res.id;
        state.tab = 'pending';
        (state.list = state.list || []).push(res);
        A.setPending(state.list.filter(function (a) { return a.status === 'pending'; }));
        render();
        task.now();
      }, function (er) {
        save.disabled = false;
        save.textContent = L.t('ad.al.save');
        A.toast(A.messageFor(er), 'error');
      });
    });

    panel.appendChild(form);
    renderSuggest();
    if (focus) t.focus({ preventScroll: true });
  }

  /* ---------- Tabs and loading ---------- */

  var tabs = A.$$('[data-al-tabs] [data-tab]');
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () {
      state.tab = b.getAttribute('data-tab');
      renderTop();
      renderList();
    });
    // Arrow keys move between tabs
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
  });
  $('[data-al-new]').addEventListener('click', startCompose);

  function render() {
    renderTop();
    renderList();
    if (!state.composing) renderReview(false);
  }

  function load() {
    return Promise.all([
      A.api('/admin/alerts'),
      GW.request('/alerts', { auth: false }).catch(function () { return null; })
    ]).then(function (res) {
      state.list = res[0] || [];
      state.error = null;
      (res[1] || []).forEach(function (a) { if (a.sent_at) state.sentAt[a.id] = a.sent_at; });
      A.setPending(state.list.filter(function (a) { return a.status === 'pending'; }));
      // Open on the most urgent pending alert
      if (!state.selected || !find(state.selected)) {
        var first = sorted(state.list.filter(function (a) { return a.status === 'pending'; }))[0];
        state.selected = first ? first.id : null;
      }
    }, function (err) {
      state.error = err;
      if (state.list === undefined) state.list = null;
    }).then(function () {
      // Never redraw under someone who is typing a new alert
      renderTop();
      renderList();
      if (!state.composing) renderReview(false);
    });
  }

  var task = A.every(20 * 1000, load, 'alerts');

  A.view('alerts', {
    enter: function () {
      render();
      task.now();
    },
    render: function () {
      renderTop();
      renderList();
      renderReview(false);
    }
  });
})(window.GW = window.GW || {});
