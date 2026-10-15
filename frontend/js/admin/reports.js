/* Admin: Rescue reports (admin-reports.html).

   GET   /admin/incidents        every 30 seconds  every report, newest first, with the reporter's username
   PATCH /admin/incidents/{id}   Manage            status new (Received) / in_progress (In progress) / resolved (Completed)

   Report numbers show as GW-0001, the same as the member sees. Reports have no district field, so the
   filters are status, a search over number, text, place, name and phone, and the day the report came in.
   While a Manage menu is open or a row is expanded, the refresh waits so nothing moves under the pointer. */

(function (GW) {
  'use strict';

  var A = GW.admin;
  var L = GW.lang;
  var h = A.h;
  var $ = A.$;

  var STATUSES = ['new', 'in_progress', 'resolved'];
  var TONE = { new: 'orange', in_progress: 'blue', resolved: 'green' };
  var PER_PAGE = 10;

  var state = { list: undefined, next: null, tab: 'all', q: '', date: '', page: 0, open: {}, menu: null, saving: {} };

  function code(id) { return 'GW-' + String(id).padStart(4, '0'); }
  function statusLabel(s) { return GW.t.incidentStatus[s] ? L.pick(GW.t.incidentStatus[s]) : s; }
  function hasPin(r) { return r.lat !== null && r.lat !== undefined && r.lon !== null && r.lon !== undefined; }
  function mapUrl(r) { return 'https://www.openstreetmap.org/?mlat=' + r.lat + '&mlon=' + r.lon + '#map=17/' + r.lat + '/' + r.lon; }

  function filtered(ignoreTab) {
    var q = state.q.trim().toLowerCase();
    return (state.list || []).filter(function (r) {
      if (!ignoreTab && state.tab !== 'all' && r.status !== state.tab) return false;
      if (state.date && String(r.created_at || '').slice(0, 10) !== state.date) return false;
      if (!q) return true;
      return [code(r.id), String(r.id), r.description, r.address, r.username, r.phone]
        .some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    });
  }

  /* ---------- Tabs ---------- */

  function renderTabs() {
    var base = filtered(true);
    A.$$('[data-rp-tabs] [data-tab]').forEach(function (b) {
      var k = b.getAttribute('data-tab');
      var n = k === 'all' ? base.length : base.filter(function (r) { return r.status === k; }).length;
      b.textContent = '';
      b.appendChild(h('span', null, k === 'all' ? L.t('ad.rp.all') : statusLabel(k)));
      b.appendChild(h('span', 'tabs__n', String(n)));
      b.setAttribute('aria-selected', String(k === state.tab));
      b.tabIndex = k === state.tab ? 0 : -1;
    });
    $('[data-rp-clear]').hidden = !(state.q || state.date);
  }

  /* ---------- Table ---------- */

  function cell(label, cls) {
    var td = h('td', cls);
    td.setAttribute('data-label', label);
    return td;
  }

  function statusPill(r) {
    var wrap = h('span', 'rp-status');
    wrap.appendChild(A.tag(statusLabel(r.status), TONE[r.status] || 'grey'));
    if (state.saving[r.id]) wrap.appendChild(h('span', 'rp-status__saving', L.pick(GW.t.states.saving)));
    return wrap;
  }

  function row(r, i) {
    var tr = h('tr', 'rp-row rp-row--' + r.status + (state.open[r.id] ? ' is-open' : ''));
    tr.style.setProperty('--i', i);
    tr.setAttribute('data-id', r.id);

    var tdId = cell(L.t('ad.rp.colId'), 'rp-id');
    var toggle = h('button', 'rp-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(!!state.open[r.id]));
    toggle.setAttribute('aria-controls', 'rp-more-' + r.id);
    toggle.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>');
    toggle.appendChild(h('span', null, code(r.id)));
    toggle.addEventListener('click', function () {
      state.open[r.id] = !state.open[r.id];
      renderTable();
    });
    tdId.appendChild(toggle);
    tr.appendChild(tdId);

    var tdInc = cell(L.t('ad.rp.colIncident'), 'rp-inc');
    tdInc.appendChild(A.text('p', 'rp-inc__text', r.description));
    var who = [r.username ? L.t('ad.rp.by', { name: r.username }) : '', r.phone || ''].filter(Boolean).join(' · ');
    if (who) tdInc.appendChild(A.text('p', 'rp-sub', who));
    tr.appendChild(tdInc);

    var tdPlace = cell(L.t('ad.rp.colPlace'), 'rp-place');
    tdPlace.appendChild(r.address ? A.text('p', 'rp-place__addr', r.address) : h('p', 'rp-sub', L.t('ad.rp.pinOnly')));
    if (hasPin(r)) {
      var a = h('a', 'rp-link', L.t('ad.rp.map'));
      a.href = mapUrl(r);
      a.target = '_blank';
      a.rel = 'noopener';
      tdPlace.appendChild(a);
    }
    tr.appendChild(tdPlace);

    var tdTime = cell(L.t('ad.rp.colTime'), 'rp-time');
    tdTime.appendChild(h('p', 'rp-time__clock', A.clock(r.created_at)));
    tdTime.appendChild(h('p', 'rp-sub', A.date(r.created_at)));
    tr.appendChild(tdTime);

    var tdStatus = cell(L.t('ad.rp.colStatus'), 'rp-st');
    tdStatus.appendChild(statusPill(r));
    tr.appendChild(tdStatus);

    var tdAct = cell(L.t('ad.rp.colAction'), 'rp-act');
    tdAct.appendChild(manage(r));
    tr.appendChild(tdAct);
    return tr;
  }

  function details(r) {
    var tr = h('tr', 'rp-more');
    tr.id = 'rp-more-' + r.id;
    var td = h('td');
    td.colSpan = 6;
    var grid = h('dl', 'rp-more__grid');
    function item(label, value, node) {
      var d = h('div');
      d.appendChild(h('dt', null, label));
      var dd = h('dd');
      if (node) dd.appendChild(node); else dd.appendChild(A.text('span', null, value || '–'));
      d.appendChild(dd);
      grid.appendChild(d);
    }
    item(L.t('ad.rp.full'), null, A.text('p', 'rp-more__desc', r.description));
    item(L.t('ad.rp.address'), r.address);
    item(L.t('ad.rp.pin'), hasPin(r) ? A.num(r.lat, 5) + ', ' + A.num(r.lon, 5) : L.t('ad.rp.noPin'));
    var phone = null;
    if (r.phone) {
      phone = h('a', 'rp-link', r.phone);
      phone.href = 'tel:' + String(r.phone).replace(/[^\d+]/g, '');
    }
    item(L.t('ad.rp.phone'), L.t('ad.rp.noPhone'), phone);
    item(L.t('ad.rp.reporter'), r.username || L.t('ad.rp.unknown'));
    item(L.t('ad.rp.updated'), A.time(r.updated_at));
    td.appendChild(grid);
    tr.appendChild(td);
    return tr;
  }

  /* ---------- Manage menu ---------- */

  function manage(r) {
    var wrap = h('div', 'menu-a');
    var btn = h('button', 'btn-a btn-a--ghost btn-a--sm menu-a__btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', String(state.menu === r.id));
    btn.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>');
    btn.appendChild(h('span', null, L.t('ad.rp.manage')));
    btn.setAttribute('aria-label', L.t('ad.rp.manageFor', { code: code(r.id) }));
    btn.disabled = !!state.saving[r.id];
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      state.menu = state.menu === r.id ? null : r.id;
      state.menuAt = Date.now();
      if (state.menu === null) applyNext();
      renderTable();
      if (state.menu === r.id) {
        var first = $('.menu-a__list [aria-checked="false"]', $('tr[data-id="' + r.id + '"]'));
        if (first) first.focus({ preventScroll: true });
      }
    });
    wrap.appendChild(btn);
    if (state.menu !== r.id) return wrap;

    var list = h('div', 'menu-a__list');
    list.setAttribute('role', 'menu');
    list.appendChild(h('p', 'menu-a__title', L.t('ad.rp.setStatus')));
    STATUSES.forEach(function (s) {
      var it = h('button', 'menu-a__item');
      it.type = 'button';
      it.setAttribute('role', 'menuitemradio');
      it.setAttribute('aria-checked', String(r.status === s));
      it.appendChild(h('span', 'menu-a__dot menu-a__dot--' + TONE[s]));
      it.appendChild(h('span', null, statusLabel(s)));
      it.addEventListener('click', function () { setStatus(r, s); });
      list.appendChild(it);
    });
    if (r.phone || hasPin(r)) list.appendChild(h('hr', 'menu-a__sep'));
    if (r.phone) {
      var call = h('a', 'menu-a__item', L.t('ad.rp.call', { phone: r.phone }));
      call.setAttribute('role', 'menuitem');
      call.href = 'tel:' + String(r.phone).replace(/[^\d+]/g, '');
      list.appendChild(call);
    }
    if (hasPin(r)) {
      var mp = h('a', 'menu-a__item', L.t('ad.rp.map'));
      mp.setAttribute('role', 'menuitem');
      mp.href = mapUrl(r);
      mp.target = '_blank';
      mp.rel = 'noopener';
      list.appendChild(mp);
    }
    // Up and down move through the menu, Escape closes it
    list.addEventListener('keydown', function (e) {
      var items = A.$$('.menu-a__item', list);
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === 'Escape') {
        state.menu = null;
        applyNext();
        renderAll();
        var b = $('tr[data-id="' + r.id + '"] .menu-a__btn');
        if (b) b.focus();
      }
    });
    wrap.appendChild(list);
    return wrap;
  }

  function setStatus(r, s) {
    state.menu = null;
    if (r.status === s) { renderTable(); return; }
    var before = r.status;
    r.status = s;
    state.saving[r.id] = true;
    renderAll();
    A.api('/admin/incidents/' + r.id, { method: 'PATCH', body: { status: s } }).then(function (res) {
      r.updated_at = res.updated_at || r.updated_at;
      A.toast(L.t('ad.rp.changed', { code: code(r.id), status: statusLabel(s) }));
    }, function (err) {
      r.status = before;
      A.toast(A.messageFor(err, { 404: L.t('ad.rp.gone') }), 'error');
    }).then(function () {
      delete state.saving[r.id];
      A.setIncidents(state.list);
      renderAll();
      // A refresh that arrived meanwhile may predate the change: fetch again instead of using it
      state.next = null;
      task.now();
    });
  }

  // The table scrolls sideways on narrow screens, which would cut the menu off: it is placed against the window
  // instead, below its button (or above it when there is no room), and closes when the page scrolls
  function placeMenu() {
    var list = $('.menu-a__list');
    if (!list) return;
    var btn = list.parentNode.querySelector('.menu-a__btn');
    var r = btn.getBoundingClientRect();
    list.style.position = 'fixed';
    list.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    var below = r.bottom + 6;
    var hgt = list.offsetHeight;
    list.style.top = (below + hgt > window.innerHeight - 8 && r.top - hgt - 6 > 8 ? r.top - hgt - 6 : below) + 'px';
  }
  function closeMenu() {
    // A scroll that was already under way when the menu opened does not count
    if (state.menu === null || Date.now() - (state.menuAt || 0) < 400) return;
    state.menu = null;
    applyNext();
    renderAll();
  }
  window.addEventListener('scroll', closeMenu, { passive: true });
  window.addEventListener('resize', closeMenu);
  $('.rp-table').addEventListener('scroll', closeMenu, { passive: true });

  document.addEventListener('click', function (e) {
    if (state.menu !== null && !e.target.closest('.menu-a')) {
      state.menu = null;
      applyNext();
      renderAll();
    }
  });

  /* ---------- Drawing ---------- */

  function renderTable() {
    var tbody = $('[data-rp-body]');
    var empty = $('[data-rp-empty]');
    tbody.textContent = '';
    if (state.list === undefined) {
      for (var s = 0; s < 4; s++) {
        var sk = h('tr', 'rp-row rp-row--sk');
        var td = h('td');
        td.colSpan = 6;
        td.appendChild(h('span', 'sk sk--wide'));
        sk.appendChild(td);
        tbody.appendChild(sk);
      }
      empty.hidden = true;
      return;
    }
    var list = filtered(false);
    var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    state.page = Math.min(state.page, pages - 1);
    var from = state.page * PER_PAGE;
    var shown = list.slice(from, from + PER_PAGE);
    shown.forEach(function (r, i) {
      tbody.appendChild(row(r, i));
      if (state.open[r.id]) tbody.appendChild(details(r));
    });
    placeMenu();

    empty.hidden = !!shown.length;
    empty.textContent = !state.list ? L.t('ad.rp.error') : (state.list.length ? L.t('ad.rp.noMatch') : L.t('ad.rp.none'));

    $('[data-rp-showing]').textContent = list.length
      ? L.t('ad.rp.showing', { from: from + 1, to: from + shown.length, n: list.length })
      : '';
    $('[data-rp-page]').textContent = L.t('ad.rp.page', { p: state.page + 1, n: pages });
    $('[data-rp-prev]').disabled = state.page === 0;
    $('[data-rp-next]').disabled = state.page >= pages - 1;
    $('[data-rp-pager]').hidden = list.length <= PER_PAGE && !list.length;
  }

  function renderAll() {
    renderTabs();
    renderTable();
  }

  /* ---------- Filters ---------- */

  var tabs = A.$$('[data-rp-tabs] [data-tab]');
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () {
      state.tab = b.getAttribute('data-tab');
      state.page = 0;
      renderAll();
    });
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
  });
  var search = $('[data-rp-search]');
  var dateIn = $('[data-rp-date]');
  search.addEventListener('input', function () { state.q = search.value; state.page = 0; renderAll(); });
  dateIn.addEventListener('change', function () { state.date = dateIn.value; state.page = 0; renderAll(); });
  $('[data-rp-clear]').addEventListener('click', function () {
    state.q = search.value = '';
    state.date = dateIn.value = '';
    state.page = 0;
    renderAll();
    search.focus();
  });
  $('[data-rp-prev]').addEventListener('click', function () { state.page = Math.max(0, state.page - 1); renderTable(); });
  $('[data-rp-next]').addEventListener('click', function () { state.page += 1; renderTable(); });

  /* ---------- Loading ---------- */

  function busy() { return state.menu !== null || Object.keys(state.saving).length > 0; }

  // A refresh that came in while a menu was open or a change was saving waits here until it is safe to show
  function applyNext() {
    if (!state.next || busy()) return;
    state.list = state.next;
    state.next = null;
    A.setIncidents(state.list);
  }

  function load() {
    return A.api('/admin/incidents').then(function (list) {
      if (busy()) { state.next = list || []; return; }
      state.list = list || [];
      A.setIncidents(state.list);
      renderAll();
    }, function () {
      if (state.list === undefined) { state.list = null; renderAll(); }
    });
  }

  var task = A.every(30 * 1000, load, 'reports');

  A.view('reports', {
    enter: function () {
      // Reuse what the shell already fetched for the badge, then refresh
      if (state.list === undefined && A.counts.incidents) state.list = A.counts.incidents.slice();
      renderAll();
      task.now();
    },
    leave: function () { state.menu = null; },
    render: renderAll
  });
})(window.GW = window.GW || {});
