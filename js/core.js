/*
 * Exam Clock – shared logic used by both the library/editor and the display.
 * Plain ES2015-ish JavaScript (no optional chaining etc.) so it runs on the
 * older Chromium browsers built into many smartboards.
 */
(function (global) {
  'use strict';

  var EC = {};
  var MIN = 60000;
  EC.MIN = MIN;

  /* ---------- small helpers ---------- */

  EC.uid = function () {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  };

  EC.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  EC.pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function str(v, max) {
    v = v == null ? '' : String(v);
    return v.slice(0, max || 500);
  }
  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /* ---------- time formatting (always 24-hour) ---------- */

  EC.fmtHM = function (ms) {
    var d = new Date(ms);
    return EC.pad(d.getHours()) + ':' + EC.pad(d.getMinutes());
  };

  EC.fmtHMS = function (ms) {
    var d = new Date(ms);
    return EC.pad(d.getHours()) + ':' + EC.pad(d.getMinutes()) + ':' + EC.pad(d.getSeconds());
  };

  // Start times are shown rounded down, finish times rounded UP to the minute,
  // so the screen never shows a candidate less time than they are entitled to.
  EC.fmtStart = function (ms) { return EC.fmtHM(Math.floor(ms / MIN) * MIN); };
  EC.fmtFinish = function (ms) { return EC.fmtHM(Math.ceil(ms / MIN) * MIN); };

  // 90 -> "1h 30m", 45 -> "45m", 120 -> "2h"
  EC.fmtDur = function (mins) {
    mins = Math.round(mins || 0);
    var h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return m + 'm';
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  };

  // elapsed milliseconds -> "4:05" or "1:04:05"
  EC.fmtElapsed = function (ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + EC.pad(m) : m) + ':' + EC.pad(sec);
  };

  EC.fmtPct = function (p) {
    return String(Math.round(p * 100) / 100);
  };

  EC.dateKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + EC.pad(d.getMonth() + 1) + '-' + EC.pad(d.getDate());
  };

  EC.parseDateKey = function (key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };

  EC.fmtDateLong = function (key) {
    var d = EC.parseDateKey(key);
    if (!d) return '';
    try {
      return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return key; }
  };

  EC.fmtDateShort = function (key) {
    var d = EC.parseDateKey(key);
    if (!d) return 'No date';
    try {
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return key; }
  };

  EC.parseHM = function (s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return { h: h, m: mi };
  };

  EC.normHM = function (s) {
    var t = EC.parseHM(s);
    return t ? EC.pad(t.h) + ':' + EC.pad(t.m) : null;
  };

  // "09:00" on the same calendar day as refMs, as epoch ms
  EC.todayAt = function (hm, refMs) {
    var t = EC.parseHM(hm) || { h: 9, m: 0 };
    var d = new Date(refMs);
    d.setHours(t.h, t.m, 0, 0);
    return d.getTime();
  };

  /* ---------- exam timing ---------- */

  // Minutes allowed for a duration plus a percentage of extra time,
  // rounded up to a whole minute (e.g. 90m +25% = 112.5 -> 113m).
  EC.allowedMinutes = function (dur, pct) {
    return Math.ceil((dur * (100 + (pct || 0))) / 100 - 1e-9);
  };

  /*
   * Work out when a finish row actually finishes.
   *   startMs    – when the exam started (or will start)
   *   allowedMin – working time in minutes
   *   pauses     – [{s, e}] where e is null while the pause is still running.
   *                Emergency pauses and this row's rest breaks are passed together;
   *                overlapping ones are merged so time is never double-counted.
   * Only pauses that begin after the start and before the (moving) finish count.
   */
  EC.computeFinish = function (startMs, allowedMin, pauses, now) {
    var iv = [], i;
    for (i = 0; i < pauses.length; i++) {
      var p = pauses[i];
      var open = p.e == null;
      var s = Math.max(p.s, startMs);
      var e = open ? Math.max(now, s) : p.e;
      if (open ? e >= s : e > s) iv.push([s, e, open]);
    }
    iv.sort(function (a, b) { return a[0] - b[0]; });

    var merged = [];
    for (i = 0; i < iv.length; i++) {
      var last = merged[merged.length - 1];
      if (last && iv[i][0] <= last[1]) {
        if (iv[i][1] > last[1]) last[1] = iv[i][1];
        last[2] = last[2] || iv[i][2];
      } else {
        merged.push(iv[i].slice());
      }
    }

    var finish = startMs + allowedMin * MIN;
    var paused = 0, pausedNow = false;
    for (i = 0; i < merged.length; i++) {
      if (merged[i][0] < finish) {
        finish += merged[i][1] - merged[i][0];
        paused += merged[i][1] - merged[i][0];
        if (merged[i][2]) pausedNow = true;
      }
    }

    return {
      finish: finish,
      paused: paused,
      pausedNow: pausedNow,
      started: now >= startMs,
      finished: !pausedNow && now >= finish
    };
  };

  // Default label for a finish row: "Finish", "Extra time (+25%)", "Rest breaks"...
  // The percentage is only shown when the exam uses more than one extra-time percentage.
  EC.rowLabel = function (r, ex) {
    var pcts = [];
    ((ex && ex.rows) || [r]).forEach(function (x) {
      if (x.pct > 0 && pcts.indexOf(x.pct) < 0) pcts.push(x.pct);
    });
    if (r.pct > 0) {
      var s = 'Extra time' + (pcts.length > 1 ? ' (+' + EC.fmtPct(r.pct) + '%)' : '');
      return r.rest ? s + ' + rest breaks' : s;
    }
    return r.rest ? 'Rest breaks' : 'Finish';
  };

  /* ---------- data model ---------- */

  EC.newRow = function (pct, rest) {
    return { id: EC.uid(), label: '', pct: pct || 0, rest: !!rest };
  };

  EC.newExam = function (start) {
    return {
      id: EC.uid(), subject: '', board: '', code: '', dur: 90, start: start || '09:00',
      rows: [EC.newRow(0), EC.newRow(25)]
    };
  };

  EC.newDisplay = function () {
    return {
      v: 1, id: EC.uid(), name: 'New display', date: EC.dateKey(new Date()),
      centre: '', centreNo: '', room: '', notes: '', theme: 'dark',
      exams: [EC.newExam()]
    };
  };

  // Clean up anything loaded from storage, a file or a link.
  EC.normalise = function (d) {
    d = d || {};
    var out = {
      v: 1,
      id: str(d.id, 40) || EC.uid(),
      name: str(d.name, 120),
      date: EC.parseDateKey(d.date) ? d.date : '',
      centre: str(d.centre, 120),
      centreNo: str(d.centreNo, 20),
      room: str(d.room, 80),
      notes: str(d.notes, 600),
      theme: d.theme === 'light' ? 'light' : 'dark',
      exams: []
    };
    if (d.updated) out.updated = +d.updated || 0;
    var exams = Array.isArray(d.exams) ? d.exams.slice(0, 30) : [];
    exams.forEach(function (e) {
      e = e || {};
      var ex = {
        id: str(e.id, 40) || EC.uid(),
        subject: str(e.subject, 120),
        board: str(e.board, 60),
        code: str(e.code, 60),
        dur: Math.min(24 * 60, Math.max(0, Math.round(num(e.dur)))),
        start: EC.normHM(e.start) || '09:00',
        rows: []
      };
      var rows = Array.isArray(e.rows) ? e.rows.slice(0, 12) : [];
      rows.forEach(function (r) {
        r = r || {};
        ex.rows.push({
          id: str(r.id, 40) || EC.uid(),
          label: str(r.label, 80),
          pct: Math.min(400, Math.max(0, num(r.pct))),
          rest: !!r.rest
        });
      });
      out.exams.push(ex);
    });
    return out;
  };

  // What goes into a display link (everything except library bookkeeping).
  EC.payload = function (d) {
    var p = JSON.parse(JSON.stringify(d));
    delete p.updated;
    return p;
  };

  /* ---------- link encoding (URL-safe base64 of UTF-8 JSON) ---------- */

  EC.encode = function (obj) {
    var json = JSON.stringify(obj);
    var b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  EC.decode = function (s) {
    var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  };

  EC.parseHash = function (hash) {
    var out = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(function (part) {
      if (!part) return;
      var i = part.indexOf('=');
      if (i < 0) out[part] = '1';
      else out[part.slice(0, i)] = part.slice(i + 1);
    });
    return out;
  };

  EC.displayUrl = function (d, extra) {
    var base = location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, '');
    return base + 'display.html#d=' + EC.encode(EC.payload(d)) + (extra || '');
  };

  EC.registerServiceWorker = function () {
    // Only on real (https) hosting – keeps local testing free of stale caches.
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  };

  global.EC = EC;
})(window);
