/* Exam Clock – display library and editor */
(function () {
  'use strict';

  var LIB_KEY = 'examclock-library-v1';
  var SEL_KEY = 'examclock-selected';
  var $ = function (id) { return document.getElementById(id); };
  var esc = EC.esc;

  var lib = loadLib();
  var currentId = null;
  try { currentId = localStorage.getItem(SEL_KEY); } catch (e) {}
  if (!find(currentId)) currentId = lib.displays.length ? sorted()[0].id : null;

  /* ---------- storage ---------- */

  function loadLib() {
    try {
      var raw = localStorage.getItem(LIB_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && Array.isArray(o.displays)) return { displays: o.displays.map(EC.normalise) };
      }
    } catch (e) {}
    return { displays: [] };
  }

  var saveTimer = null;
  function saveSoon() {
    $('saved').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(lib));
      $('saved').textContent = 'All changes saved';
    } catch (e) {
      $('saved').textContent = 'Not saved!';
      alert('Your changes could not be saved in this browser (storage may be full or blocked). Use Export library to keep a copy.');
    }
  }
  window.addEventListener('beforeunload', function () { if (saveTimer) saveNow(); });

  function find(id) {
    for (var i = 0; i < lib.displays.length; i++) if (lib.displays[i].id === id) return lib.displays[i];
    return null;
  }
  function current() { return find(currentId); }

  function select(id) {
    currentId = id;
    try { localStorage.setItem(SEL_KEY, id || ''); } catch (e) {}
    renderList();
    renderMain();
  }

  function sorted() {
    return lib.displays.slice().sort(function (a, b) {
      var ad = a.date || '9999', bd = b.date || '9999';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  /* ---------- sidebar list ---------- */

  function renderList() {
    var today = EC.dateKey(new Date());
    var upcoming = [], past = [];
    sorted().forEach(function (d) { (d.date && d.date < today ? past : upcoming).push(d); });
    past.reverse();

    function item(d) {
      var n = d.exams.length;
      return '<button type="button" role="listitem" class="list-item' + (d.id === currentId ? ' active' : '') + '" data-select="' + esc(d.id) + '">' +
        '<b>' + esc(d.name || 'Untitled display') + '</b>' +
        '<small>' + esc(EC.fmtDateShort(d.date)) + ' · ' + n + ' exam' + (n === 1 ? '' : 's') + '</small></button>';
    }

    var h = '';
    if (!lib.displays.length) h = '<p class="hint">No displays yet.</p>';
    if (upcoming.length) h += '<div class="list-group">Upcoming</div>' + upcoming.map(item).join('');
    if (past.length) h += '<div class="list-group">Past</div>' + past.map(item).join('');
    $('list').innerHTML = h;
  }

  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-select]');
    if (b) select(b.getAttribute('data-select'));
  });

  /* ---------- main editor ---------- */

  function field(label, attrs, cls) {
    return '<label class="field ' + (cls || '') + '"><span>' + label + '</span><input ' + attrs + '></label>';
  }

  function renderMain() {
    var d = current();
    var main = $('main');
    if (!d) {
      main.innerHTML =
        '<div class="welcome"><h1>Exam Clock</h1>' +
        '<p>Create a display for each exam session: the exams, their start times and the finish times for normal and extra time. ' +
        'Then open it on the exam hall screen.</p>' +
        '<button class="btn primary" type="button" data-act="new-display">+ Create your first display</button></div>';
      return;
    }

    var h = '<div class="editor"><div class="ed-form">';

    h += '<section class="panel"><div class="panel-head"><h2>Display details</h2></div><div class="grid">' +
      field('Display name (only shown in this library)', 'type="text" data-k="name" value="' + esc(d.name) + '" placeholder="e.g. Mon 18 May AM – Sports Hall"', 'span-4') +
      field('Date', 'type="date" data-k="date" value="' + esc(d.date) + '"', 'span-2') +
      field('Centre name', 'type="text" data-k="centre" value="' + esc(d.centre) + '" placeholder="e.g. Anytown High School"', 'span-3') +
      field('Centre number', 'type="text" data-k="centreNo" value="' + esc(d.centreNo) + '" placeholder="e.g. 12345"', 'span-1') +
      field('Room', 'type="text" data-k="room" value="' + esc(d.room) + '" placeholder="e.g. Sports Hall"', 'span-2') +
      '<label class="field span-4"><span>Notes shown at the bottom of the screen</span>' +
      '<textarea data-k="notes" rows="2" placeholder="e.g. Mobile phones and smart watches must be handed in.">' + esc(d.notes) + '</textarea></label>' +
      '<label class="field span-2"><span>Screen colours</span><select data-k="theme">' +
      '<option value="dark"' + (d.theme !== 'light' ? ' selected' : '') + '>Light text on black</option>' +
      '<option value="light"' + (d.theme === 'light' ? ' selected' : '') + '>Black text on white</option>' +
      '</select></label>' +
      '</div></section>';

    h += '<section class="panel"><div class="panel-head"><h2>Exams</h2>' +
      '<button class="btn primary small" type="button" data-act="add-exam">+ Add exam</button></div>';
    if (!d.exams.length) h += '<p class="hint">No exams yet. Add one to get started.</p>';
    d.exams.forEach(function (ex, ei) { h += examCard(ex, ei, d.exams.length); });
    h += '</section>';

    h += '</div><div class="ed-side"><div class="panel sticky">' +
      '<div class="panel-head"><h2>Preview</h2></div>' +
      '<div class="preview-box" id="previewBox"><iframe id="preview" title="Preview of the exam screen" tabindex="-1"></iframe></div>' +
      '<div class="btns col">' +
      '<button class="btn primary" type="button" data-act="share">Link &amp; QR code for the exam screen</button>' +
      '<button class="btn" type="button" data-act="open">Open the display here</button>' +
      '<button class="btn" type="button" data-act="dup-display">Duplicate this display</button>' +
      '<button class="btn danger-text" type="button" data-act="del-display">Delete this display</button>' +
      '</div>' +
      '<p class="hint">Changes save automatically. Finish times in extra time are rounded up to the next whole minute.</p>' +
      '</div></div></div>';

    main.innerHTML = h;
    updateComputed();
    updatePreview(true);
    scalePreview();
  }

  function examCard(ex, ei, count) {
    var h = '<div class="exam-card" data-ex="' + ei + '">' +
      '<div class="exam-card-head"><h3 data-title>' + esc(titleFor(ex, ei)) + '</h3><div class="btns">' +
      '<button class="btn small icon" type="button" data-act="up-exam" title="Move up" aria-label="Move up"' + (ei === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="btn small icon" type="button" data-act="down-exam" title="Move down" aria-label="Move down"' + (ei === count - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button class="btn small" type="button" data-act="dup-exam">Duplicate</button>' +
      '<button class="btn small danger-text" type="button" data-act="del-exam">Remove</button>' +
      '</div></div>' +
      '<div class="grid">' +
      field('Subject / paper', 'type="text" data-f="subject" value="' + esc(ex.subject) + '" placeholder="e.g. Mathematics Paper 1 (Higher)"', 'span-6') +
      field('Exam board', 'type="text" data-f="board" value="' + esc(ex.board) + '" placeholder="e.g. AQA"', 'span-2') +
      field('Paper code', 'type="text" data-f="code" value="' + esc(ex.code) + '" placeholder="e.g. 8300/1H"', 'span-2') +
      field('Planned start', 'type="time" data-f="start" value="' + esc(ex.start) + '" required', 'span-2') +
      '<div class="field span-6"><span>Duration</span><div class="dur">' +
      '<input type="number" min="0" max="12" step="1" data-f="durH" value="' + Math.floor(ex.dur / 60) + '" aria-label="Hours"><span>hours</span>' +
      '<input type="number" min="0" max="59" step="1" data-f="durM" value="' + (ex.dur % 60) + '" aria-label="Minutes"><span>minutes</span>' +
      '</div></div>' +
      '</div>' +
      '<table class="rows"><thead><tr><th>Label on screen</th><th>Extra time %</th><th class="center">Rest breaks</th><th>Planned finish</th><th></th></tr></thead><tbody>';
    ex.rows.forEach(function (r, ri) {
      h += '<tr data-row="' + ri + '">' +
        '<td><input type="text" data-rf="label" value="' + esc(r.label) + '" placeholder="' + esc(EC.rowLabel(r)) + '" aria-label="Label on screen"></td>' +
        '<td><input class="pct" type="number" min="0" max="400" step="any" data-rf="pct" value="' + EC.fmtPct(r.pct) + '" aria-label="Extra time percent"></td>' +
        '<td class="center"><input type="checkbox" data-rf="rest"' + (r.rest ? ' checked' : '') + ' aria-label="Has rest breaks" title="Adds Start/End rest break buttons on the screen for this finish time"></td>' +
        '<td class="fin" data-fin></td>' +
        '<td><button class="btn small icon danger-text" type="button" data-act="del-row" title="Remove this finish time" aria-label="Remove this finish time">✕</button></td>' +
        '</tr>';
    });
    if (!ex.rows.length) h += '<tr><td colspan="5" class="hint">Add at least one finish time.</td></tr>';
    h += '</tbody></table>' +
      '<div class="btns add-rows">' +
      '<button class="btn small" type="button" data-act="add-row" data-pct="0">+ Normal finish</button>' +
      '<button class="btn small" type="button" data-act="add-row" data-pct="25">+ 25%</button>' +
      '<button class="btn small" type="button" data-act="add-row" data-pct="50">+ 50%</button>' +
      '<button class="btn small" type="button" data-act="add-row" data-pct="100">+ 100%</button>' +
      '<button class="btn small" type="button" data-act="add-row" data-pct="0" data-rest="1">+ Rest breaks</button>' +
      '</div></div>';
    return h;
  }

  function titleFor(ex, ei) {
    return 'Exam ' + (ei + 1) + (ex.subject ? ' – ' + ex.subject : '');
  }

  // Refresh the bits that depend on the data without re-rendering inputs.
  function updateComputed() {
    var d = current();
    if (!d) return;
    var cards = $('main').querySelectorAll('.exam-card');
    [].forEach.call(cards, function (card) {
      var ei = +card.getAttribute('data-ex');
      var ex = d.exams[ei];
      card.querySelector('[data-title]').textContent = titleFor(ex, ei);
      var start = EC.todayAt(ex.start, Date.now());
      [].forEach.call(card.querySelectorAll('tr[data-row]'), function (tr) {
        var r = ex.rows[+tr.getAttribute('data-row')];
        var mins = EC.allowedMinutes(ex.dur, r.pct);
        var fin = tr.querySelector('[data-fin]');
        fin.className = 'fin' + (r.rest ? ' rest' : r.pct > 0 ? ' extra' : '');
        fin.innerHTML = esc(EC.fmtFinish(start + mins * EC.MIN)) + ' <small>(' + esc(EC.fmtDur(mins)) +
          (r.rest ? ' + breaks' : '') + ')</small>';
        tr.querySelector('[data-rf="label"]').placeholder = EC.rowLabel(r);
      });
    });
  }

  /* ---------- preview ---------- */

  var previewTimer = null;
  function updatePreview(now) {
    clearTimeout(previewTimer);
    var go = function () {
      var f = $('preview'), d = current();
      if (!f || !d) return;
      var url = 'display.html#d=' + EC.encode(EC.payload(d)) + '&preview=1';
      if (f.getAttribute('src') !== url) f.setAttribute('src', url);
    };
    if (now) go(); else previewTimer = setTimeout(go, 250);
  }

  function scalePreview() {
    var box = $('previewBox'), f = $('preview');
    if (!box || !f) return;
    f.style.transform = 'scale(' + (box.clientWidth / 1920) + ')';
  }
  window.addEventListener('resize', scalePreview);

  /* ---------- editing ---------- */

  function changed(structural) {
    var d = current();
    if (!d) return;
    d.updated = Date.now();
    saveSoon();
    if (structural) renderMain();
    else { updateComputed(); updatePreview(false); }
    renderList();
  }

  function onField(e) {
    var t = e.target, d = current();
    if (!d) return;
    var k = t.getAttribute('data-k'), f = t.getAttribute('data-f'), rf = t.getAttribute('data-rf');
    if (k) {
      d[k] = t.value;
    } else if (f || rf) {
      var card = t.closest('[data-ex]');
      var ex = d.exams[+card.getAttribute('data-ex')];
      if (f === 'durH' || f === 'durM') {
        var hh = parseInt(card.querySelector('[data-f="durH"]').value, 10) || 0;
        var mm = parseInt(card.querySelector('[data-f="durM"]').value, 10) || 0;
        ex.dur = Math.max(0, Math.min(24 * 60, hh * 60 + mm));
      } else if (f === 'start') {
        var hm = EC.normHM(t.value);
        if (!hm) return;
        ex.start = hm;
      } else if (f) {
        ex[f] = t.value;
      } else {
        var r = ex.rows[+t.closest('[data-row]').getAttribute('data-row')];
        if (rf === 'rest') r.rest = t.checked;
        else if (rf === 'pct') r.pct = Math.max(0, Math.min(400, parseFloat(t.value) || 0));
        else r.label = t.value;
      }
    } else {
      return;
    }
    changed(false);
  }
  $('main').addEventListener('input', onField);
  $('main').addEventListener('change', onField);

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    var d = current();
    var card = b.closest('[data-ex]');
    var ei = card ? +card.getAttribute('data-ex') : -1;
    var ex = d && ei >= 0 ? d.exams[ei] : null;

    switch (a) {
      case 'new-display': {
        var nd = EC.newDisplay();
        nd.updated = Date.now();
        lib.displays.push(nd);
        saveSoon();
        select(nd.id);
        var nameInput = $('main').querySelector('[data-k="name"]');
        if (nameInput) { nameInput.focus(); nameInput.select(); }
        return;
      }
      case 'add-exam': {
        var last = d.exams[d.exams.length - 1];
        var ne = EC.newExam(last ? last.start : '09:00');
        d.exams.push(ne);
        changed(true);
        var cards = $('main').querySelectorAll('.exam-card');
        var lastCard = cards[cards.length - 1];
        if (lastCard) {
          lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          lastCard.querySelector('[data-f="subject"]').focus({ preventScroll: true });
        }
        return;
      }
      case 'up-exam':
      case 'down-exam': {
        var to = a === 'up-exam' ? ei - 1 : ei + 1;
        if (to < 0 || to >= d.exams.length) return;
        d.exams.splice(to, 0, d.exams.splice(ei, 1)[0]);
        changed(true);
        return;
      }
      case 'dup-exam': {
        var copy = JSON.parse(JSON.stringify(ex));
        copy.id = EC.uid();
        copy.rows.forEach(function (r) { r.id = EC.uid(); });
        d.exams.splice(ei + 1, 0, copy);
        changed(true);
        return;
      }
      case 'del-exam':
        if (!confirm('Remove "' + (ex.subject || 'Exam ' + (ei + 1)) + '" from this display?')) return;
        d.exams.splice(ei, 1);
        changed(true);
        return;
      case 'add-row':
        ex.rows.push(EC.newRow(+b.getAttribute('data-pct'), b.getAttribute('data-rest') === '1'));
        changed(true);
        return;
      case 'del-row':
        ex.rows.splice(+b.closest('[data-row]').getAttribute('data-row'), 1);
        changed(true);
        return;
      case 'open':
        saveNow();
        window.open(EC.displayUrl(d), '_blank');
        return;
      case 'share':
        saveNow();
        openShare(d);
        return;
      case 'dup-display': {
        var dc = JSON.parse(JSON.stringify(d));
        dc.id = EC.uid();
        dc.name = (d.name || 'Display') + ' (copy)';
        dc.updated = Date.now();
        lib.displays.push(dc);
        saveSoon();
        select(dc.id);
        toast('Display duplicated.');
        return;
      }
      case 'del-display':
        if (!confirm('Delete "' + (d.name || 'this display') + '"? This cannot be undone (unless you have exported the library).')) return;
        lib.displays = lib.displays.filter(function (x) { return x.id !== d.id; });
        saveNow();
        select(lib.displays.length ? sorted()[0].id : null);
        return;
    }
  });

  /* ---------- share dialog ---------- */

  function openShare(d) {
    var url = EC.displayUrl(d);
    $('shareTitle').textContent = 'Show “' + (d.name || 'this display') + '” on the exam screen';
    $('linkInput').value = url;
    $('openLink').href = url;
    $('emailLink').href = 'mailto:?subject=' + encodeURIComponent('Exam Clock: ' + (d.name || 'display')) +
      '&body=' + encodeURIComponent('Open this link on the exam hall screen:\n\n' + url + '\n');
    $('fileWarn').hidden = location.protocol !== 'file:';

    var qr = $('qr');
    if (typeof window.qrcode !== 'function') {
      qr.innerHTML = '<p>The QR code needs an internet connection the first time. You can still copy or email the link.</p>';
    } else {
      try {
        var q = window.qrcode(0, 'L');
        q.addData(url);
        q.make();
        qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      } catch (err) {
        qr.innerHTML = '<p>This display has too much text for a QR code. Copy or email the link instead.</p>';
      }
    }
    $('share').hidden = false;
    $('copyLink').focus();
  }

  $('closeShare').addEventListener('click', function () { $('share').hidden = true; });
  $('share').addEventListener('click', function (e) { if (e.target === $('share')) $('share').hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('share').hidden = true; });
  $('linkInput').addEventListener('focus', function () { this.select(); });
  $('copyLink').addEventListener('click', function () {
    var text = $('linkInput').value;
    function fallback() {
      $('linkInput').select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      toast(ok ? 'Link copied.' : 'Select the link and copy it.');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Link copied.'); }, fallback);
    } else fallback();
  });

  /* ---------- export / import ---------- */

  $('exportBtn').addEventListener('click', function () {
    saveNow();
    var blob = new Blob([JSON.stringify({ app: 'exam-clock', version: 1, exported: new Date().toISOString(), displays: lib.displays }, null, 2)],
      { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'exam-clock-library-' + EC.dateKey(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  $('importFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var input = this;
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var list;
      try {
        var o = JSON.parse(reader.result);
        list = Array.isArray(o.displays) ? o.displays : Array.isArray(o) ? o : (o && o.exams ? [o] : null);
      } catch (e) { list = null; }
      input.value = '';
      if (!list || !list.length) { alert('That file does not contain any Exam Clock displays.'); return; }
      var added = 0, replaced = 0;
      list.forEach(function (raw) {
        var d = EC.normalise(raw);
        var existing = find(d.id);
        if (existing) { lib.displays[lib.displays.indexOf(existing)] = d; replaced++; }
        else { lib.displays.push(d); added++; }
      });
      saveNow();
      if (!find(currentId)) currentId = sorted()[0].id;
      renderList();
      renderMain();
      toast('Imported: ' + added + ' new, ' + replaced + ' updated.');
    };
    reader.readAsText(file);
  });

  /* ---------- misc ---------- */

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // Another tab changed the library: reload it.
  window.addEventListener('storage', function (e) {
    if (e.key !== LIB_KEY) return;
    lib = loadLib();
    if (!find(currentId)) currentId = lib.displays.length ? sorted()[0].id : null;
    renderList();
    renderMain();
  });

  renderList();
  renderMain();
  $('saved').textContent = lib.displays.length ? 'All changes saved' : '';
  EC.registerServiceWorker();
})();
