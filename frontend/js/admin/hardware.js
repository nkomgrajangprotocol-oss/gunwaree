/* Admin: Hardware control (admin-hardware.html; the team's ESP32 test rig, region bangkok_test).

   GET  /admin/pump-status?region=bangkok_test        every 2 seconds   what the backend will tell the board:
        pump on/off, seconds_left, cooldown_left_s, can_send_on, acknowledged, last_command, board_last_seen
   GET  /stations/latest?kind=canal&scope=bangkok_test every 5 seconds   the sensor's water level (m) and its status
   POST /admin/pump-commands {region, command}         Start / Stop      409 while the last start is under 70 s old

   The board asks for a command about every 5 seconds and reports its level every 3 to 10 seconds, so it is
   "online" when it reported in the last 60 seconds. "pump" is what the backend answers the board, not a reading
   from the pump itself. The server keeps only the latest command; the list also shows the commands sent from
   this browser during this session (sessionStorage). */

(function (GW) {
  'use strict';

  var A = GW.admin;
  var L = GW.lang;
  var h = A.h;
  var $ = A.$;

  var REGION = 'bangkok_test';
  var ONLINE_S = 60;
  var RUN_S = 60;        // PUMP_MAX_RUN_S in backend/main.py
  var COOLDOWN_S = 70;   // PUMP_COOLDOWN_S
  var LOG_KEY = 'gw_adm_pump_log';
  var BOARD_TONE = { green: 'green', yellow: 'yellow', red: 'red' };
  var BOARD_LEVEL = { green: 'none', yellow: 'watch', red: 'critical' };

  var state = { status: undefined, sensors: undefined, busy: false, log: readLog() };

  function readLog() {
    try { return JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeLog() {
    try { sessionStorage.setItem(LOG_KEY, JSON.stringify(state.log.slice(0, 12))); } catch (e) { /* storage blocked */ }
  }
  function thaiNow() { return new Date(A.nowThai()).toISOString().slice(0, 19).replace('T', ' '); }

  function online() {
    var st = state.status;
    return !!(st && st.board_last_seen && A.ageSeconds(st.board_last_seen) <= ONLINE_S);
  }

  /* ---------- Stat cards ---------- */

  function stat(key, value, unit, note, tone) {
    var card = $('[data-hw="' + key + '"]');
    card.setAttribute('data-tone', tone || '');
    var v = $('[data-value]', card);
    v.textContent = '';
    if (value === null) v.appendChild(h('span', 'stat__wait', L.t('status.awaiting')));
    else {
      v.appendChild(h('span', 'stat__num', value));
      if (unit) v.appendChild(h('span', 'stat__unit', unit));
    }
    $('[data-note]', card).textContent = note || '';
  }

  function sensor() { return (state.sensors || [])[0] || null; }

  function renderStats() {
    var st = state.status;
    var s = sensor();

    if (state.sensors === undefined) { /* still loading */ }
    else if (!s || s.water_level === null) stat('level', null, '', L.t('ad.hw.noSensor'));
    else stat('level', A.num(s.water_level * 100, 1), L.get() === 'th' ? 'ซม.' : 'cm',
      (s.status ? L.t('ad.hw.boardSays', { level: A.levelLabel(BOARD_LEVEL[s.status] || 'nodata') }) + ' · ' : '') + A.ago(s.measured_at),
      BOARD_TONE[s.status]);

    if (st === undefined) return;
    if (!st) {
      ['pump', 'board', 'cmd'].forEach(function (k) { stat(k, null, '', L.t('error.card')); });
      return;
    }
    var on = st.pump === 'on';
    stat('pump', on ? L.t('ad.hw.running') : L.t('ad.hw.off'), '',
      on ? L.t('ad.hw.left', { n: st.seconds_left }) : st.cooldown_left_s > 0 ? L.t('ad.hw.cooldown', { n: st.cooldown_left_s }) : L.t('ad.hw.ready'),
      on ? 'teal' : null);

    var seen = st.board_last_seen;
    stat('board', !seen ? L.t('ad.hw.never') : online() ? L.t('ad.hw.online') : L.t('ad.hw.offline'), '',
      seen ? L.t('ad.hw.lastReport', { ago: A.ago(seen) }) : L.t('ad.hw.neverNote'),
      !seen ? 'grey' : online() ? 'green' : 'red');

    var lc = st.last_command;
    if (!lc) stat('cmd', L.t('ad.hw.none'), '', L.t('ad.hw.noneNote'));
    else stat('cmd', lc.command === 'on' ? L.t('ad.hw.cmdOn') : L.t('ad.hw.cmdOff'), '',
      A.clockSec(lc.created_at) + ' · ' + (lc.executed_at ? L.t('ad.hw.acked', { time: A.clockSec(lc.executed_at) }) :
        lc.command === 'on' ? L.t('ad.hw.waiting') : L.t('ad.hw.offNote')),
      lc.executed_at ? 'green' : lc.command === 'on' ? 'yellow' : null);
  }

  /* ---------- Devices and sensor health ---------- */

  function device(icon, name, sub, label, tone) {
    var li = h('li', 'device');
    var ic = h('span', 'device__icon');
    ic.innerHTML = icon;
    li.appendChild(ic);
    var t = h('div', 'device__text');
    t.appendChild(h('p', 'device__name', name));
    t.appendChild(h('p', 'device__sub', sub));
    li.appendChild(t);
    li.appendChild(A.tag(label, tone));
    return li;
  }

  var ICON_PUMP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C12 6 14 4 16.5 4.5 18 5 17.5 8 14 10M14.2 12c3.8 0 5.8 2 5.3 4.5-.5 1.5-3.5 1-5.5-2.5M12 14.2c0 3.8-2 5.8-4.5 5.3-1.5-.5-1-3.5 2.5-5.5M9.8 12C6 12 4 10 4.5 7.5 5 6 8 6.5 10 10"/></svg>';
  var ICON_SENSOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="13" rx="2"/><path d="M12 16v5M4 21h16M10.5 7h3M10.5 10h3"/></svg>';

  function renderDevices() {
    var ul = $('[data-hw-devices]');
    ul.textContent = '';
    var st = state.status;
    (state.sensors || []).forEach(function (s) {
      var fresh = s.measured_at && A.ageSeconds(s.measured_at) <= ONLINE_S;
      ul.appendChild(device(ICON_SENSOR, L.t('ad.hw.sensorName', { code: s.code }),
        (s.water_level !== null ? A.num(s.water_level * 100, 1) + ' ' + (L.get() === 'th' ? 'ซม.' : 'cm') + ' · ' : '') + (s.measured_at ? A.ago(s.measured_at) : L.t('ad.hw.never')),
        fresh ? L.t('ad.hw.reporting') : L.t('ad.hw.noSignal'), fresh ? 'green' : 'red'));
    });
    if (state.sensors && !state.sensors.length) {
      ul.appendChild(device(ICON_SENSOR, L.t('ad.hw.sensorName', { code: 'esp32' }), L.t('ad.hw.neverNote'), L.t('ad.hw.never'), 'grey'));
    }
    if (st) {
      var on = st.pump === 'on';
      ul.appendChild(device(ICON_PUMP, L.t('ad.hw.pumpName'),
        on ? L.t('ad.hw.left', { n: st.seconds_left }) : L.t('ad.hw.pumpSub'),
        on ? L.t('ad.hw.running') : L.t('ad.hw.standby'), on ? 'teal' : 'grey'));
      if (on) ul.lastChild.classList.add('is-running');
    }
  }

  function renderHealth() {
    var ul = $('[data-hw-health]');
    var tagEl = $('[data-hw-health-tag]');
    ul.textContent = '';
    var list = state.sensors || [];
    var ok = list.filter(function (s) { return s.measured_at && A.ageSeconds(s.measured_at) <= ONLINE_S; }).length;
    tagEl.className = 'tag tag--' + (list.length && ok === list.length ? 'green' : list.length ? 'red' : 'grey');
    tagEl.textContent = L.t('ad.hw.healthy', { ok: ok, n: list.length });
    if (!list.length) {
      ul.appendChild(h('li', 'health__empty', state.sensors === undefined ? L.t('ad.loading') : L.t('ad.hw.noSensor')));
      return;
    }
    list.forEach(function (s) {
      var fresh = s.measured_at && A.ageSeconds(s.measured_at) <= ONLINE_S;
      var li = h('li', 'health__row' + (fresh ? '' : ' is-bad'));
      li.insertAdjacentHTML('afterbegin', fresh
        ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="m6.8 10.2 2.2 2.2 4.3-4.6"/></svg>'
        : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v5M10 13.8v.2"/></svg>');
      li.appendChild(h('span', 'health__code', String(s.code).toUpperCase()));
      li.appendChild(h('span', 'health__what', L.t('ad.hw.water')));
      li.appendChild(h('span', 'health__val', s.water_level === null ? '–' : A.num(s.water_level * 100, 1) + ' ' + (L.get() === 'th' ? 'ซม.' : 'cm')));
      li.appendChild(h('span', 'health__ago', s.measured_at ? A.ago(s.measured_at) : L.t('ad.hw.never')));
      ul.appendChild(li);
    });
  }

  /* ---------- Control ---------- */

  var RING = 2 * Math.PI * 52;

  function renderRun() {
    var box = $('[data-hw-run]');
    var st = state.status;
    var on = st && st.pump === 'on';
    var cool = st && !on && st.cooldown_left_s > 0;
    var frac = !st ? 0 : on ? st.seconds_left / RUN_S : cool ? st.cooldown_left_s / COOLDOWN_S : 0;
    var label = !st ? '…' : on ? String(st.seconds_left) : cool ? String(st.cooldown_left_s) : '';
    var mode = on ? 'run' : cool ? 'cool' : 'idle';

    if (!box.firstChild) {
      box.innerHTML = '<div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring__track" cx="60" cy="60" r="52"/>' +
        '<circle class="ring__bar" cx="60" cy="60" r="52" stroke-dasharray="' + RING.toFixed(1) + '" stroke-dashoffset="' + RING.toFixed(1) + '"/></svg>' +
        '<div class="ring__in"><span class="ring__num"></span><span class="ring__unit"></span></div></div><div class="hw-run__text"><p class="hw-run__title"></p><p class="hw-run__sub"></p></div>';
    }
    box.setAttribute('data-mode', mode);
    $('.ring__bar', box).setAttribute('stroke-dashoffset', (RING * (1 - frac)).toFixed(1));
    $('.ring__num', box).textContent = label;
    $('.ring__unit', box).textContent = label && /\d/.test(label) ? L.t('ad.hw.sec') : '';
    if (mode === 'idle' && st) {
      var ri = $('.ring__in', box);
      $('.ring__num', box).innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 5 6.5v5c0 4.3 3 7.8 7 9 4-1.2 7-4.7 7-9v-5Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/></svg>';
      ri.setAttribute('aria-hidden', 'true');
    }
    $('.hw-run__title', box).textContent = !st ? L.t('ad.loading') : on ? L.t('ad.hw.runTitle') : cool ? L.t('ad.hw.coolTitle') : L.t('ad.hw.readyTitle');
    $('.hw-run__sub', box).textContent = !st ? '' : on ? L.t('ad.hw.runSub', { n: st.seconds_left }) :
      cool ? L.t('ad.hw.coolSub', { n: st.cooldown_left_s }) : online() ? L.t('ad.hw.readySub') : L.t('ad.hw.readyOffline');

    var checks = $('[data-hw-checks]');
    checks.textContent = '';
    if (st) {
      var lc = st.last_command;
      [[online(), L.t('ad.hw.chkBoard'), online() ? A.ago(st.board_last_seen) : st.board_last_seen ? L.t('ad.hw.lastReport', { ago: A.ago(st.board_last_seen) }) : L.t('ad.hw.never')],
       [st.can_send_on, L.t('ad.hw.chkCool'), st.can_send_on ? L.t('ad.hw.chkCoolOk') : L.t('ad.hw.cooldown', { n: st.cooldown_left_s })],
       [!lc || !!lc.executed_at || lc.command === 'off', L.t('ad.hw.chkAck'), !lc ? L.t('ad.hw.none') : lc.executed_at ? L.t('ad.hw.acked', { time: A.clockSec(lc.executed_at) }) : lc.command === 'off' ? L.t('ad.hw.offNote') : L.t('ad.hw.waiting')]
      ].forEach(function (c) {
        var li = h('li', 'check ' + (c[0] ? 'is-ok' : 'is-no'));
        li.insertAdjacentHTML('afterbegin', c[0]
          ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5.5 10.3 3 3 6-6.3"/></svg>'
          : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 5.5v5.5M10 14.3v.2"/></svg>');
        li.appendChild(h('span', 'check__name', c[1]));
        li.appendChild(h('span', 'check__val', c[2]));
        checks.appendChild(li);
      });
    }

    var start = $('[data-pump="on"]');
    var stop = $('[data-pump="off"]');
    start.disabled = state.busy || !st || !st.can_send_on;
    stop.disabled = state.busy || !st;
  }

  function renderLog() {
    var ol = $('[data-hw-log]');
    ol.textContent = '';
    var st = state.status;
    var rows = state.log.slice();
    var lc = st && st.last_command;
    // The server's latest command first, unless this browser already lists it
    if (lc && !rows.some(function (r) { return r.id === lc.id; })) rows.unshift({ id: lc.id, command: lc.command, at: lc.created_at, server: true });
    if (!rows.length) { ol.appendChild(h('li', 'hw-log__empty', L.t('ad.hw.logEmpty'))); return; }
    rows.slice(0, 8).forEach(function (r) {
      var li = h('li', 'hw-log__row' + (r.error ? ' is-error' : ''));
      li.appendChild(h('span', 'hw-log__time', A.clockSec(r.at)));
      li.appendChild(h('span', 'hw-log__dev', L.t('ad.hw.pumpShort')));
      li.appendChild(h('span', 'hw-log__what', r.error ? L.t('ad.hw.logFailed', { cmd: r.command === 'on' ? L.t('ad.hw.cmdOn') : L.t('ad.hw.cmdOff') }) :
        r.command === 'on' ? L.t('ad.hw.logOn') : L.t('ad.hw.logOff')));
      var isLatest = lc && r.id === lc.id;
      li.appendChild(h('span', 'hw-log__who', r.server && !r.by ? L.t('ad.hw.fromServer') :
        (r.by || '') + (isLatest && lc.executed_at ? ' · ' + L.t('ad.hw.ackShort') : '')));
      ol.appendChild(li);
    });
  }

  function render() {
    renderStats();
    renderDevices();
    renderRun();
    renderLog();
    renderHealth();
  }

  function send(command) {
    var st = state.status;
    var go = command === 'off' ? Promise.resolve(true) : A.confirm({
      title: L.t('ad.hw.confirmTitle'),
      text: L.t('ad.hw.confirmText') + (online() ? '' : ' ' + L.t('ad.hw.confirmOffline')),
      ok: L.t('ad.hw.start')
    });
    go.then(function (yes) {
      if (!yes) return;
      state.busy = true;
      renderRun();
      var me = (GW.session.get() || {}).username || '';
      A.api('/admin/pump-commands', { method: 'POST', body: { region: REGION, command: command } }).then(function (res) {
        state.log.unshift({ id: res.id, command: command, at: res.created_at, by: me });
        A.toast(command === 'on' ? L.t('ad.hw.sentOn') : L.t('ad.hw.sentOff'));
      }, function (err) {
        state.log.unshift({ command: command, at: thaiNow(), by: me, error: true });
        A.toast(err.status === 409 ? L.t('ad.hw.busy', { n: st ? st.cooldown_left_s : COOLDOWN_S }) : A.messageFor(err, { 422: L.t('ad.hw.bad') }), 'error');
      }).then(function () {
        writeLog();
        state.busy = false;
        statusTask.now();
      });
    });
  }
  A.$$('[data-pump]').forEach(function (b) {
    b.addEventListener('click', function () { send(b.getAttribute('data-pump')); });
  });

  /* ---------- Loading ---------- */

  var statusTask = A.every(2000, function () {
    return A.api('/admin/pump-status?region=' + REGION).then(function (st) {
      state.status = st;
      A.setPump(st);
    }, function () {
      if (state.status === undefined) state.status = null;
    }).then(function () { renderStats(); renderDevices(); renderRun(); renderLog(); });
  }, 'hardware');

  var sensorTask = A.every(5000, function () {
    return A.api('/stations/latest?kind=canal&scope=' + REGION).then(function (list) {
      state.sensors = list || [];
    }, function () {
      if (state.sensors === undefined) state.sensors = [];
    }).then(function () { renderStats(); renderDevices(); renderHealth(); });
  }, 'hardware');

  /* ---------- The "shown as infographics" warning ----------
     Opens the 1st time an admin opens this page on this device, then on the 3rd, 6th, 9th visit and so on
     (every third). Visits are counted in localStorage gw_hw_visits. Closes with its button or Esc. */

  var VISITS_KEY = 'gw_hw_visits';
  var counted = false;   // one visit per page load, however often the view is entered

  function hwWarning() {
    if (counted) return;
    counted = true;
    var n = 0;
    try { n = (parseInt(localStorage.getItem(VISITS_KEY), 10) || 0) + 1; localStorage.setItem(VISITS_KEY, String(n)); } catch (e) { n = 1; }
    if (!(n === 1 || n % 3 === 0)) return;
    var d = h('dialog', 'notice notice--hw');
    if (typeof d.showModal !== 'function') return;
    d.setAttribute('aria-labelledby', 'hw-warn-title');
    d.setAttribute('aria-describedby', 'hw-warn-body');
    var panel = h('div', 'notice__panel');
    panel.insertAdjacentHTML('beforeend', '<span class="notice__icon notice__icon--warn" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5M12 17.2v.3" stroke-linecap="round"/></svg></span>');
    var title = h('h2', 'notice__title');
    title.id = 'hw-warn-title';
    var body = h('p', 'hw-warn__body');
    body.id = 'hw-warn-body';
    var foot = h('div', 'notice__foot hw-warn__foot');
    var ok = h('button', 'btn notice__ok');
    ok.type = 'button';
    foot.appendChild(ok);
    panel.appendChild(title);
    panel.appendChild(body);
    panel.appendChild(foot);
    d.appendChild(panel);
    document.body.appendChild(d);
    function fill() {
      title.textContent = L.t('ad.hw.warnTitle');
      body.textContent = L.t('ad.hw.warnBody');
      ok.textContent = L.t('ad.hw.warnOk');
    }
    fill();
    document.addEventListener('gw:lang', fill);
    ok.addEventListener('click', function () { d.close(); });
    d.addEventListener('close', function () {
      document.removeEventListener('gw:lang', fill);
      d.remove();
    });
    d.showModal();
    ok.focus();
  }

  A.view('hardware', {
    enter: function () {
      hwWarning();
      if (state.status === undefined && A.counts.pump) state.status = A.counts.pump;
      render();
      statusTask.now();
      sensorTask.now();
    },
    render: render
  });
})(window.GW = window.GW || {});
