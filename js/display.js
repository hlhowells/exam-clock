/* Exam Clock – the display screen shown in the exam hall */
(function () {
  'use strict';

  var MIN = EC.MIN;
  var $ = function (id) { return document.getElementById(id); };

  var display = null;     // the exam setup, decoded from the link
  var preview = false;    // true inside the editor's preview frame
  var state = null;       // on-the-day changes (start now, pauses, log)
  var stateKey = null;
  var cards = [];
  var ctlOpen = false, ctlTimer = null, tickTimer = null, wakeLock = null;

  /* ---------- on-the-day state (kept in this browser so a reload is safe) ---------- */

  function blankState() { return { starts: {}, breaks: {}, emergency: [], log: [] }; }

  function loadState() {
    try {
      var raw = localStorage.getItem(stateKey);
      if (raw) {
        var s = JSON.parse(raw), b = blankState();
        b.starts = s.starts || {};
        b.breaks = s.breaks || {};
        b.emergency = Array.isArray(s.emergency) ? s.emergency : [];
        b.log = Array.isArray(s.log) ? s.log : [];
        return b;
      }
    } catch (e) {}
    return blankState();
  }

  function saveState() {
    if (preview) return;
    try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch (e) {}
  }

  function log(msg) { state.log.push({ t: Date.now(), m: msg }); }

  /* ---------- timing ---------- */

  function examName(ex) { return ex.subject || 'Exam'; }
  function rowName(r) { return r.label || EC.rowLabel(r); }

  function examStart(ex, now) {
    var o = state.starts[ex.id];
    return o != null ? o : EC.todayAt(ex.start, now);
  }

  function breaksFor(ex, r, create) {
    var b = state.breaks[ex.id];
    if (!b) { if (!create) return []; b = state.breaks[ex.id] = {}; }
    if (!b[r.id]) { if (!create) return []; b[r.id] = []; }
    return b[r.id];
  }

  function openBreak(ex, r) {
    var arr = breaksFor(ex, r, false);
    return arr.length && arr[arr.length - 1].e == null ? arr[arr.length - 1] : null;
  }

  function breakTotal(ex, r, now) {
    return breaksFor(ex, r, false).reduce(function (sum, p) {
      return sum + ((p.e == null ? now : p.e) - p.s);
    }, 0);
  }

  function rowInfo(ex, r, start, now) {
    var pauses = state.emergency.slice();
    if (r.rest) pauses = pauses.concat(breaksFor(ex, r, false));
    return EC.computeFinish(start, EC.allowedMinutes(ex.dur, r.pct), pauses, now);
  }

  function currentEmergency() {
    var e = state.emergency[state.emergency.length - 1];
    return e && e.e == null ? e : null;
  }

  /* ---------- loading ---------- */

  function load() {
    var params = EC.parseHash(location.hash);
    preview = params.preview === '1';
    display = null;
    if (params.d) {
      try { display = EC.normalise(EC.decode(params.d)); } catch (e) { display = null; }
    }
    document.body.classList.toggle('theme-light', !!(display && display.theme === 'light'));
    document.body.classList.toggle('preview', preview);

    if (!display) {
      $('app').hidden = true;
      $('empty').hidden = false;
      document.title = 'Exam Clock';
      return;
    }
    $('empty').hidden = true;
    $('app').hidden = false;
    document.title = display.name ? display.name + ' – Exam Clock' : 'Exam Clock';

    stateKey = 'examclock-run-' + display.id + '-' + EC.dateKey(new Date());
    state = preview ? blankState() : loadState();
    if (ctlOpen) closeCtl();
    build();
    tick();
  }

  /* ---------- building the screen ---------- */

  function build() {
    var d = display;
    $('centre').textContent = [d.centre, d.centreNo ? 'Centre ' + d.centreNo : ''].filter(Boolean).join('  ·  ');
    $('roomDate').textContent = [d.room, d.date ? EC.fmtDateLong(d.date) : ''].filter(Boolean).join('  ·  ');
    $('notes').textContent = d.notes;
    $('notes').hidden = !d.notes;

    var wrap = $('exams');
    wrap.innerHTML = '';
    cards = [];
    var n = d.exams.length;
    var cols = n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3;
    document.body.classList.toggle('busy', n >= 5);
    wrap.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';

    d.exams.forEach(function (ex) {
      var sec = document.createElement('section');
      sec.className = 'exam';
      var meta = [ex.board, ex.code, EC.fmtDur(ex.dur)].filter(Boolean).join('  ·  ');
      var html =
        '<div class="exam-subject">' + EC.esc(examName(ex)) + '</div>' +
        '<div class="exam-meta">' + EC.esc(meta) + '</div>' +
        '<div class="times">' +
        '<div class="t-row t-start"><span class="t-label">Start</span><span class="t-val"></span></div>';
      ex.rows.forEach(function (r) {
        html += '<div class="t-row' + (r.pct > 0 ? ' t-extra' : '') + (r.rest ? ' t-rest' : '') + '">' +
          '<span class="t-label">' + EC.esc(rowName(r)) + '<span class="t-tag"></span></span>' +
          '<span class="t-val"></span></div>';
      });
      html += '</div>';
      sec.innerHTML = html;
      wrap.appendChild(sec);

      var rowEls = [].slice.call(sec.querySelectorAll('.t-row')).slice(1).map(function (el) {
        return { el: el, val: el.querySelector('.t-val'), tag: el.querySelector('.t-tag'), cls: '' };
      });
      cards.push({ ex: ex, el: sec, start: sec.querySelector('.t-start .t-val'), rows: rowEls });
    });

    update(Date.now());
    fit();
  }

  // Shrink the exam text until everything fits on screen.
  function fit() {
    var wrap = $('exams');
    if (!cards.length) return;
    // Measure with the cards top-aligned: overflow from centred content
    // isn't counted in scrollHeight.
    wrap.style.alignContent = 'start';
    var size = Math.max(window.innerHeight, 300) / 13;
    wrap.style.fontSize = size + 'px';
    var guard = 0;
    while (overflowing(wrap) && size > 8 && guard++ < 80) {
      size *= 0.94;
      wrap.style.fontSize = size + 'px';
    }
    wrap.style.alignContent = '';
  }

  function overflowing(wrap) {
    if (wrap.scrollHeight > wrap.clientHeight + 1) return true;
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i].el;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) return true;
    }
    return false;
  }

  /* ---------- every second ---------- */

  function tick() {
    var now = Date.now();
    $('clockHM').textContent = EC.fmtHM(now);
    $('clockS').textContent = ':' + EC.pad(new Date(now).getSeconds());
    if (display) update(now);
    clearTimeout(tickTimer);
    tickTimer = setTimeout(tick, 1000 - (Date.now() % 1000) + 20);
  }

  function setHidden(el, hidden) {
    if (el.hidden !== hidden) { el.hidden = hidden; return true; }
    return false;
  }

  function update(now) {
    var refit = false;
    var em = currentEmergency();
    refit = setHidden($('banner'), !em) || refit;
    if (em) $('bannerTime').textContent = EC.fmtElapsed(now - em.s);

    var wrongDay = !preview && display.date && display.date !== EC.dateKey(new Date(now));
    refit = setHidden($('dateWarn'), !wrongDay) || refit;
    if (wrongDay) {
      $('dateWarn').textContent = 'Check: this display was set up for ' + EC.fmtDateLong(display.date) +
        ' – times are shown for today.';
    }

    cards.forEach(function (c) {
      var start = examStart(c.ex, now);
      c.start.textContent = EC.fmtStart(start);
      var allDone = c.rows.length > 0;
      c.ex.rows.forEach(function (r, i) {
        var info = rowInfo(c.ex, r, start, now);
        var re = c.rows[i];
        re.val.textContent = EC.fmtFinish(info.finish);
        var tag = '', cls = '';
        if (info.finished) { tag = 'Finished'; cls = 'finished'; }
        else if (info.started && em) { tag = 'Stopped'; cls = 'stopped'; }
        else if (info.pausedNow) { tag = 'On rest break'; cls = 'onbreak'; }
        if (re.cls !== cls) {
          if (re.cls) re.el.classList.remove(re.cls);
          if (cls) re.el.classList.add(cls);
          re.tag.textContent = tag;
          re.cls = cls;
          refit = true;
        }
        if (!info.finished) allDone = false;
      });
      c.el.classList.toggle('all-finished', allDone);
    });

    if (refit) fit();
    if (ctlOpen) updateCtl(now);
  }

  /* ---------- invigilator controls ---------- */

  function openCtl() {
    if (preview || !display) return;
    ctlOpen = true;
    renderCtl();
    $('controls').hidden = false;
    $('controls').scrollTop = 0;
    bumpCtl();
  }

  function closeCtl() {
    ctlOpen = false;
    $('controls').hidden = true;
    $('confirm').hidden = true;
    clearTimeout(ctlTimer);
  }

  function bumpCtl() {
    clearTimeout(ctlTimer);
    ctlTimer = setTimeout(closeCtl, 120000);
  }

  function renderCtl() {
    var h = '';
    display.exams.forEach(function (ex, ei) {
      h += '<div class="ctl-exam"><h3>' + EC.esc(examName(ex)) +
        (ex.code ? ' <small>' + EC.esc(ex.code) + '</small>' : '') + '</h3>' +
        '<div class="ctl-line">Start: <b data-cs="' + ei + '"></b> <span class="muted" data-csn="' + ei + '"></span></div>' +
        '<div class="btns">' +
        '<button class="btn primary" type="button" data-act="startnow" data-ex="' + ei + '">Start now</button>' +
        '<button class="btn" type="button" data-act="adj" data-delta="-1" data-ex="' + ei + '">&minus;1 min</button>' +
        '<button class="btn" type="button" data-act="adj" data-delta="1" data-ex="' + ei + '">+1 min</button>' +
        (state.starts[ex.id] != null
          ? '<button class="btn" type="button" data-act="resetstart" data-ex="' + ei + '">Back to planned ' + ex.start + '</button>'
          : '') +
        '</div>';
      ex.rows.forEach(function (r, ri) {
        if (!r.rest) return;
        var open = openBreak(ex, r);
        h += '<div class="ctl-rest"><div><b>' + EC.esc(rowName(r)) + '</b><br>' +
          '<span class="muted">Rest breaks so far: <span data-cb="' + ei + '-' + ri + '"></span></span></div>' +
          '<button class="btn ' + (open ? 'warn' : '') + '" type="button" data-act="break" data-ex="' + ei + '" data-row="' + ri + '">' +
          (open ? 'End rest break' : 'Start rest break') + '</button></div>';
      });
      h += '</div>';
    });
    $('ctlExams').innerHTML = h;

    var em = currentEmergency();
    $('emBtn').textContent = em ? 'Restart clocks (end emergency pause)' : 'Emergency pause – stop all clocks';
    $('emBtn').className = 'btn big ' + (em ? 'ok' : 'danger');
    renderLog();
    updateCtl(Date.now());
  }

  function setText(sel, text) {
    var el = $('controls').querySelector(sel);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function updateCtl(now) {
    display.exams.forEach(function (ex, ei) {
      setText('[data-cs="' + ei + '"]', EC.fmtStart(examStart(ex, now)));
      setText('[data-csn="' + ei + '"]',
        state.starts[ex.id] != null ? '(changed on the day – planned ' + ex.start + ')' : '(planned)');
      ex.rows.forEach(function (r, ri) {
        if (r.rest) setText('[data-cb="' + ei + '-' + ri + '"]', EC.fmtElapsed(breakTotal(ex, r, now)));
      });
    });
  }

  function logText() {
    if (!state.log.length) return 'Nothing has been changed today.';
    var head = (display.name || 'Exam display') + ' – ' + EC.fmtDateLong(EC.dateKey(new Date(state.log[0].t))) + '\n';
    return head + state.log.map(function (l) { return EC.fmtHMS(l.t) + '  ' + l.m; }).join('\n');
  }

  function renderLog() { $('logText').textContent = logText(); }

  function commit() {
    saveState();
    if (ctlOpen) renderCtl();
    update(Date.now());
  }

  function act(name, b) {
    var now = Date.now();
    var ex = b && b.hasAttribute('data-ex') ? display.exams[+b.getAttribute('data-ex')] : null;

    switch (name) {
      case 'close':
        closeCtl();
        break;

      case 'startnow': {
        var t = Math.ceil(now / MIN) * MIN;
        confirmBox('Start ' + examName(ex) + ' now?',
          'The start time will be set to ' + EC.fmtHM(t) + ' (the next whole minute, so no candidate loses time). ' +
          'All of its finish times will update.',
          'Start now', '',
          function () {
            state.starts[ex.id] = t;
            log(examName(ex) + ': Start now – start time set to ' + EC.fmtHM(t));
            commit();
          });
        break;
      }

      case 'adj': {
        var delta = +b.getAttribute('data-delta');
        var ns = examStart(ex, now) + delta * MIN;
        state.starts[ex.id] = ns;
        log(examName(ex) + ': start time changed to ' + EC.fmtStart(ns));
        commit();
        break;
      }

      case 'resetstart':
        delete state.starts[ex.id];
        log(examName(ex) + ': start time put back to planned ' + ex.start);
        commit();
        break;

      case 'break': {
        var r = ex.rows[+b.getAttribute('data-row')];
        var open = openBreak(ex, r);
        if (open) {
          open.e = now;
          log(examName(ex) + ' – ' + rowName(r) + ': rest break ended after ' + EC.fmtElapsed(now - open.s));
        } else {
          var start = examStart(ex, now);
          var info = rowInfo(ex, r, start, now);
          if (now < start) { toast('This exam has not started yet.'); return; }
          if (info.finished) { toast('This finish time has already passed.'); return; }
          breaksFor(ex, r, true).push({ s: now, e: null });
          log(examName(ex) + ' – ' + rowName(r) + ': rest break started');
        }
        commit();
        break;
      }

      case 'emergency': {
        var em = currentEmergency();
        if (em) {
          confirmBox('Restart the clocks?',
            'The exams were stopped for ' + EC.fmtElapsed(now - em.s) + '. Every finish time has moved later by this amount.',
            'Restart clocks', 'ok',
            function () {
              var end = Date.now();
              em.e = end;
              log('Emergency pause ended – clocks restarted after ' + EC.fmtElapsed(end - em.s));
              commit();
            });
        } else {
          confirmBox('Stop all clocks?',
            'Use this for an evacuation or other emergency. Every exam in progress is paused until you restart the clocks, ' +
            'and all finish times move later by the length of the pause.',
            'Stop all clocks', 'danger',
            function () {
              state.emergency.push({ s: Date.now(), e: null });
              log('EMERGENCY PAUSE – all clocks stopped');
              commit();
            });
        }
        break;
      }

      case 'copylog':
        copyText(logText());
        break;

      case 'fullscreen':
        goFullscreen();
        break;

      case 'resetday':
        confirmBox('Clear today’s changes?',
          'This removes every Start now, start adjustment, rest break, emergency pause and the event log for this display, ' +
          'and goes back to the planned times. Copy the log first if you need it.',
          'Clear changes', 'danger',
          function () {
            state = blankState();
            saveState();
            renderCtl();
            update(Date.now());
            toast('Back to the planned times.');
          });
        break;
    }
  }

  /* ---------- confirm box, toast, clipboard ---------- */

  var cfYesFn = null;
  function confirmBox(title, text, yesLabel, yesClass, fn) {
    $('cfTitle').textContent = title;
    $('cfText').textContent = text;
    $('cfYes').textContent = yesLabel;
    $('cfYes').className = 'btn ' + (yesClass || 'primary');
    cfYesFn = fn;
    $('confirm').hidden = false;
  }
  $('cfNo').addEventListener('click', function () { $('confirm').hidden = true; cfYesFn = null; bumpCtl(); });
  $('cfYes').addEventListener('click', function () {
    $('confirm').hidden = true;
    var fn = cfYesFn; cfYesFn = null;
    bumpCtl();
    if (fn) fn();
  });

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? 'Log copied.' : 'Could not copy – select the log text instead.');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Log copied.'); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- full screen & keeping the screen awake ---------- */

  function goFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) {
      try {
        var p = fn.call(el);
        if (p && p.catch) p.catch(function () { toast('This browser would not go full screen.'); });
      } catch (e) { toast('This browser would not go full screen.'); }
    } else {
      toast('Full screen is not available in this browser.');
    }
  }

  function onFsChange() {
    var fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('is-fullscreen', fs);
    setTimeout(fit, 200);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  function requestWake() {
    if (preview || wakeLock || !('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (l) {
      wakeLock = l;
      l.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { requestWake(); tick(); }
  });

  /* ---------- press-and-hold lock button ---------- */

  var lock = $('lockBtn'), holdTimer = null;
  function holdStart(e) {
    if (e) e.preventDefault();
    requestWake();
    lock.classList.add('holding');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      holdTimer = null;
      lock.classList.remove('holding');
      openCtl();
    }, 1000);
  }
  function holdCancel(showHint) {
    if (!holdTimer) return;
    clearTimeout(holdTimer);
    holdTimer = null;
    lock.classList.remove('holding');
    if (showHint) toast('Press and hold the lock for 1 second to open invigilator controls.');
  }
  if (window.PointerEvent) {
    lock.addEventListener('pointerdown', holdStart);
    lock.addEventListener('pointerup', function () { holdCancel(true); });
    lock.addEventListener('pointercancel', function () { holdCancel(false); });
    lock.addEventListener('pointerleave', function () { holdCancel(false); });
  } else {
    lock.addEventListener('touchstart', holdStart);
    lock.addEventListener('touchend', function () { holdCancel(true); });
    lock.addEventListener('mousedown', holdStart);
    lock.addEventListener('mouseup', function () { holdCancel(true); });
  }
  lock.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  lock.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCtl(); }
  });

  $('fsBtn').addEventListener('click', function () { requestWake(); goFullscreen(); });

  $('controls').addEventListener('click', function (e) {
    bumpCtl();
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (b) act(b.getAttribute('data-act'), b);
  });
  $('controls').addEventListener('scroll', bumpCtl);

  document.addEventListener('pointerdown', requestWake);
  document.addEventListener('contextmenu', function (e) {
    if (!e.target.closest || !e.target.closest('pre')) e.preventDefault();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 150);
  });
  window.addEventListener('hashchange', load);

  // If the screen was left open in another tab, keep in step with it.
  window.addEventListener('storage', function (e) {
    if (!preview && e.key === stateKey) {
      state = loadState();
      if (ctlOpen) renderCtl();
      update(Date.now());
    }
  });

  load();
  requestWake();
  EC.registerServiceWorker();
})();
