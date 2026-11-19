/*
 * Exam Clock – create displays from a CSV file (one row per exam).
 * Rows with the same Display name and date share a screen; with no Display
 * name, exams are grouped by date, room and morning/afternoon.
 */
(function (EC) {
  'use strict';

  var CSV = {};

  // Accepted column headings (compared lower-case, letters and digits only).
  var FIELDS = {
    display: ['display', 'displayname', 'screen', 'screenname', 'session'],
    date: ['date', 'examdate'],
    room: ['room', 'venue', 'location'],
    subject: ['subject', 'exam', 'examtitle', 'title', 'paper', 'subjectpaper', 'papertitle'],
    board: ['board', 'examboard', 'awardingbody'],
    code: ['papercode', 'code', 'componentcode', 'unitcode', 'component'],
    start: ['start', 'starttime', 'plannedstart', 'time'],
    dur: ['duration', 'durationmins', 'durationminutes', 'length', 'minutes', 'mins'],
    extra: ['extratime', 'extra', 'extratimepercent', 'extratimepc', 'extratimes'],
    rest: ['restbreaks', 'restbreak', 'rest', 'restbreakspercent'],
    notes: ['notes', 'note', 'message'],
    centre: ['centre', 'centrename', 'center', 'centername', 'school'],
    centreNo: ['centrenumber', 'centreno', 'centernumber', 'centerno']
  };

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function norm(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* ---------- reading the file ---------- */

  CSV.parse = function (text) {
    text = String(text || '').replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var delim = ',', best = -1;
    [',', ';', '\t'].forEach(function (d) {
      var n = first.split(d).length;
      if (n > best) { best = n; delim = d; }
    });

    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (q) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"') {
        q = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (x) { return String(x).trim() !== ''; });
    });
  };

  /* ---------- understanding values ---------- */

  function validDate(y, m, d) {
    if (y < 100) y += 2000;
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return EC.dateKey(dt);
  }

  // 18/05/2027, 18-5-27, 2027-05-18, 18 May 2027, Mon 18th May 2027
  CSV.parseDate = function (s) {
    s = String(s || '').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
    if (m) return validDate(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
    if (m) return validDate(+m[3], +m[2], +m[1]);
    m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([a-z]{3,})\.?[\s\-,]+(\d{2}|\d{4})$/i.exec(s);
    if (m) {
      var mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
      if (mo >= 0) return validDate(+m[3], mo + 1, +m[1]);
    }
    return null;
  };

  // 09:00, 9:00, 9.00, 09:00:00, 0900, 9am, 1:30pm  ->  {h, m}
  CSV.parseTime = function (s) {
    s = String(s || '').trim().toLowerCase().replace(/\s+/g, '');
    var h, mi, ap;
    var m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?(am|pm)?$/.exec(s);
    if (m) {
      if (m[2] == null && !m[3]) return null; // "9" on its own is ambiguous
      h = +m[1]; mi = +(m[2] || 0); ap = m[3];
    } else {
      m = /^(\d{2})(\d{2})$/.exec(s);
      if (!m) return null;
      h = +m[1]; mi = +m[2];
    }
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    }
    if (h > 23 || mi > 59) return null;
    return { h: h, m: mi };
  };

  // 90, 1:30, 1h 30m, 1h30, 2 hours, 45 mins  ->  minutes
  CSV.parseDuration = function (s) {
    s = String(s || '').trim().toLowerCase();
    var m, v = null;
    if (/^\d+$/.test(s)) v = +s;
    else if ((m = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(s))) v = +m[1] * 60 + +m[2];
    else if ((m = /^(\d+)\s*h[a-z]*\s*(\d+)\s*[a-z]*$/.exec(s))) v = +m[1] * 60 + +m[2];
    else if ((m = /^(\d+(?:\.\d+)?)\s*h[a-z]*$/.exec(s))) v = Math.round(parseFloat(m[1]) * 60);
    else if ((m = /^(\d+)\s*m[a-z]*$/.exec(s))) v = +m[1];
    return v && v > 0 && v <= 24 * 60 ? v : null;
  };

  // "25", "25;50", "25% / 50%", "yes", "none"  ->  [25, 50]  (null if not understood)
  CSV.parseList = function (s, yesValue) {
    s = String(s || '').trim().toLowerCase();
    if (!s || /^(n|no|none|false|-)$/.test(s)) return [];
    if (/^(y|yes|true|x|✓)$/.test(s)) return [yesValue];
    var out = [];
    var parts = s.split(/[;\/,|+&\s]+|and/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/%/g, '').trim();
      if (!p) continue;
      var n = parseFloat(p);
      if (!isFinite(n) || n < 0 || n > 400 || !/^\d+(\.\d+)?$/.test(p)) return null;
      if (out.indexOf(n) < 0) out.push(n);
    }
    return out.sort(function (a, b) { return a - b; });
  };

  /* ---------- rows -> displays ---------- */

  function autoName(date, room, am) {
    return (date ? EC.fmtDateShort(date) : 'No date') + ' ' + (am ? 'AM' : 'PM') + (room ? ' – ' + room : '');
  }

  CSV.convert = function (rows, defaults) {
    defaults = defaults || {};
    if (!rows || rows.length < 2) {
      return { error: 'The file needs a row of column headings and at least one exam.' };
    }
    var header = rows[0].map(norm), idx = {};
    Object.keys(FIELDS).forEach(function (f) {
      for (var i = 0; i < FIELDS[f].length; i++) {
        var at = header.indexOf(FIELDS[f][i]);
        if (at >= 0) { idx[f] = at; break; }
      }
    });
    if (idx.start == null || idx.dur == null) {
      return { error: 'The first row must be column headings, including Start and Duration. Download the template to see the layout.' };
    }

    var groups = {}, order = [], errors = [], examCount = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r], line = r + 1;
      var get = function (f) { return idx[f] == null ? '' : String(row[idx[f]] == null ? '' : row[idx[f]]).trim(); };
      var label = get('subject') ? ' (' + get('subject') + ')' : '';

      var start = CSV.parseTime(get('start'));
      if (!start) { errors.push('Row ' + line + label + ': start time “' + get('start') + '” not recognised – use 24-hour time, e.g. 09:00.'); continue; }
      var dur = CSV.parseDuration(get('dur'));
      if (!dur) { errors.push('Row ' + line + label + ': duration “' + get('dur') + '” not recognised – use minutes (90) or hours:minutes (1:30).'); continue; }
      var date = '';
      if (get('date')) {
        date = CSV.parseDate(get('date'));
        if (!date) { errors.push('Row ' + line + label + ': date “' + get('date') + '” not recognised – use e.g. 18/05/2027.'); continue; }
      }
      var extra = idx.extra == null ? [25] : CSV.parseList(get('extra'), 25);
      if (!extra) { errors.push('Row ' + line + label + ': extra time “' + get('extra') + '” not recognised – use percentages, e.g. 25 or 25;50.'); continue; }
      var rest = idx.rest == null ? [] : CSV.parseList(get('rest'), 0);
      if (!rest) { errors.push('Row ' + line + label + ': rest breaks “' + get('rest') + '” not recognised – use percentages, e.g. 0 or 25.'); continue; }

      var name = get('display'), room = get('room');
      var am = start.h < 12;
      var key = name ? 'n|' + name.toLowerCase() + '|' + date : 'a|' + date + '|' + room.toLowerCase() + '|' + (am ? 'AM' : 'PM');
      var g = groups[key];
      if (!g) {
        g = groups[key] = {
          name: name || autoName(date, room, am),
          date: date,
          room: room,
          centre: get('centre') || defaults.centre || '',
          centreNo: get('centreNo') || defaults.centreNo || '',
          notes: get('notes'),
          exams: []
        };
        order.push(key);
      }
      if (!g.notes && get('notes')) g.notes = get('notes');
      if (!g.room && room) g.room = room;

      var finishRows = [EC.newRow(0)];
      extra.forEach(function (p) { if (p > 0) finishRows.push(EC.newRow(p)); });
      rest.forEach(function (p) { finishRows.push(EC.newRow(p, true)); });

      g.exams.push({
        id: EC.uid(),
        subject: get('subject'),
        board: get('board'),
        code: get('code'),
        dur: dur,
        start: EC.pad(start.h) + ':' + EC.pad(start.m),
        rows: finishRows
      });
      examCount++;
    }

    var displays = order.map(function (k) {
      var g = groups[k];
      g.exams.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
      var d = EC.newDisplay();
      d.name = g.name;
      d.date = g.date;
      d.room = g.room;
      d.centre = g.centre;
      d.centreNo = g.centreNo;
      d.notes = g.notes;
      d.exams = g.exams;
      return EC.normalise(d);
    });

    return { displays: displays, errors: errors, examCount: examCount };
  };

  /* ---------- template ---------- */

  CSV.template = function () {
    var lines = [
      ['Display', 'Date', 'Room', 'Subject', 'Board', 'Paper code', 'Start', 'Duration', 'Extra time', 'Rest breaks', 'Notes', 'Centre', 'Centre number'],
      ['Tue 18 May AM - Sports Hall', '18/05/2027', 'Sports Hall', 'Mathematics Paper 1 (Higher)', 'AQA', '8300/1H', '09:00', '90', '25', '', 'Mobile phones and smart watches must be handed in.', '', ''],
      ['Tue 18 May AM - Sports Hall', '18/05/2027', 'Sports Hall', 'Mathematics Paper 1 (Foundation)', 'AQA', '8300/1F', '09:00', '1:30', '25;50', '25', '', '', ''],
      ['Tue 18 May PM - Sports Hall', '18/05/2027', 'Sports Hall', 'Biology Paper 1 (Higher)', 'AQA', '8461/1H', '13:30', '1:45', '25', '', '', '', ''],
      ['', '19/05/2027', 'Drama Studio', 'History Paper 1', 'Edexcel', '1HI0/10', '09:00', '75', '25', '0', '', '', '']
    ];
    return CSV.stringify(lines);
  };

  // Rows of values -> CSV text that Excel opens with the right characters.
  CSV.stringify = function (lines) {
    return '﻿' + lines.map(function (l) {
      return l.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n') + '\r\n';
  };

  EC.csv = CSV;
})(window.EC);
