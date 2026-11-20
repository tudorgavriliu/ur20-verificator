/* Verificator UR20: interfață (DOM). Logica de calcul este în logic.js (window.UR20). */
(function () {
  'use strict';
  var U = window.UR20;
  var C = U.CONFIG;
  var fmt = U.fmt;
  var STORE_KEY = 'ur20_cereri';
  var COUNTER_KEY = 'ur20_contor';

  var state = { input: null, result: null, memCounter: 0, memRequests: [] };

  var LINE_FIELDS = ['industrie', 'greutate', 'galetiPalet', 'debit', 'schimburi', 'ore', 'operatori', 'maner', 'separator', 'spatiu', 'gripper'];
  var CONTACT_FIELDS = ['firma', 'rol', 'judet'];
  var SECTIONS = ['s-form', 's-result', 's-request', 's-confirm'];

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- navigare ---------- */

  function show(id) {
    SECTIONS.forEach(function (s) { $(s).hidden = s !== id; });
    var el = $(id);
    window.scrollTo(0, 0);
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  /* ---------- citire formular ---------- */

  function readForm(form, fields) {
    var data = {};
    fields.forEach(function (name) {
      var els = form.elements[name];
      if (!els) return;
      if (els.length !== undefined && els.tagName !== 'SELECT' && els[0] && els[0].type === 'radio') {
        var checked = form.querySelector('input[name="' + name + '"]:checked');
        data[name] = checked ? checked.value : '';
      } else {
        data[name] = els.value.trim();
      }
    });
    return data;
  }

  // Erori = blochează verificarea (mesaj roșu, aria-invalid).
  function setFieldError(form, name, err) {
    var box = form.querySelector('[data-field="' + name + '"]');
    var msg = $('e-' + name);
    if (msg) msg.textContent = err || '';
    if (box) box.classList.toggle('has-error', !!err);
    form.querySelectorAll('[name="' + name + '"]').forEach(function (inp) {
      if (err) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
    });
  }

  function renderErrors(form, fields, errors) {
    var first = null;
    fields.forEach(function (name) {
      var err = errors[name] || '';
      setFieldError(form, name, err);
      if (err && !first) first = form.querySelector('[name="' + name + '"]');
    });
    return first;
  }

  // Avertismente = NU blochează verificarea (mesaj galben lângă câmp).
  function renderWarnings(form, warnings) {
    LINE_FIELDS.forEach(function (name) {
      var el = $('w-' + name);
      if (!el) return;
      var w = (warnings && warnings[name]) || '';
      el.textContent = w;
      var box = form.querySelector('[data-field="' + name + '"]');
      if (box) box.classList.toggle('has-warning', !!w);
    });
  }

  function updateSummary(form) {
    var n = form.querySelectorAll('.has-error').length;
    $('form-summary').textContent = n === 0 ? '' :
      n === 1 ? 'Un câmp are nevoie de atenție.' : n + ' câmpuri au nevoie de atenție.';
    return n;
  }

  function goToField(el, withFocus) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
    if (withFocus) {
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    }
  }

  /* ---------- rezultat ---------- */

  function industrieLabel(key) {
    var ind = U.industrie(key);
    return ind ? ind.label : '–';
  }

  function choiceLabel(v) {
    return v === 'da' ? 'Da' : v === 'nu' ? 'Nu' : v === 'nu_stiu' ? 'Nu știu' : '–';
  }

  function calcRows(input, r) {
    var c = r.calc;
    return [
      ['Kg ridicate manual pe schimb', fmt(c.kgPeSchimb, 0) + ' kg (' + fmt(c.tonePeSchimb, 1) + ' t)',
        fmt(U.parseNum(input.debit), 2) + ' găleți/min × 60 × ' + fmt(U.parseNum(input.ore), 1) + ' h × ' + fmt(U.parseNum(input.greutate), 2) + ' kg'],
      ['Kg pe operator, pe schimb', c.kgPeOperator === null ? '–' : fmt(c.kgPeOperator, 0) + ' kg',
        'kg pe schimb / ' + fmt(U.parseNum(input.operatori), 0) + ' operatori'],
      ['Kg pe zi', fmt(c.kgPeZi, 0) + ' kg', fmt(U.parseNum(input.schimburi), 0) + ' schimburi'],
      ['Paleți pe oră', c.paletiPeOra === null ? '–' : '≈ ' + fmt(c.paletiPeOra, 2),
        'debit × 60 / ' + fmt(U.parseNum(input.galetiPalet), 0) + ' găleți pe palet'],
      ['Minute între două schimbări de palet', c.minuteIntrePaleti === null ? '–' : '≈ ' + fmt(c.minuteIntrePaleti, 1) + ' min',
        'găleți pe palet / debit'],
      ['Debit de referință folosit', fmt(c.debitReferinta, 1) + ' găleți/min', 'test PURATOS'],
      ['Sarcina totală pe robot', fmt(c.sarcinaTotala, 2) + ' kg din ' + c.capacitateKg + ' kg',
        'găleată + gripper ' + fmt(c.gripperKg, 2) + ' kg (ipoteză)']
    ];
  }

  function listHtml(items, cls) {
    return '<ul class="' + (cls || 'plain') + '">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  }

  function calcTable(rows) {
    return '<dl class="calc">' + rows.map(function (row) {
      return '<div class="calc-row"><dt>' + esc(row[0]) + '<span class="how">' + esc(row[2]) + '</span></dt><dd>' + esc(row[1]) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function renderResult(input, r) {
    var ref = C.referinta;
    var html = '';
    html += '<div class="verdict verdict-' + r.verdict + '" role="status">' +
      '<span class="verdict-kicker">Verdict</span>' +
      '<strong class="verdict-label">' + esc(r.verdictLabel) + '</strong></div>';

    html += '<h3>' + (r.verdict === 'potrivit' ? 'De ce' : 'Ce trebuie verificat') + '</h3>';
    html += listHtml(r.reasons, 'reasons');

    html += '<h3>Calcule pentru linia ta</h3>';
    html += calcTable(calcRows(input, r));
    html += '<p class="hint">Exemple de calcul din datele introduse, nu valori măsurate.</p>';

    html += '<div class="callout"><strong>Blocaj</strong><p>' + esc(r.calc.blocaj) + '</p></div>';

    html += '<h3>Bine de știut</h3>';
    html += listHtml(r.notes.concat(r.fixed), 'notes');

    html += '<details class="sources"><summary>Fapte și ipoteze folosite</summary>' +
      '<p class="src-title">Fapte (test FAT PURATOS)</p>' +
      listHtml([
        fmt(ref.debit5kg, 1) + ' găleți/min la 5 kg; ' + fmt(ref.debit13kg, 1) + ' găleți/min la 13 kg; țintă ' + ref.tinta + ' găleți/min.',
        'Interval testat: ' + ref.greutateMin + '–' + ref.greutateMax + ' kg.',
        'Palet: ' + ref.palet5kg + ' găleți de 5 kg sau ' + ref.palet13kg + ' de 13 kg.',
        'Capacitate UR20: ' + C.capacitateKg + ' kg (' + C.capacitateSursa + ').'
      ]) +
      '<p class="src-title">Ipoteze</p>' +
      listHtml(['Greutate gripper: ' + fmt(r.calc.gripperKg, 2) + ' kg (ipoteză, modificabilă în formular).']) +
      '</details>';

    $('result-body').innerHTML = html;
  }

  /* ---------- cerere ---------- */

  function nextId() {
    var n;
    try {
      n = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) + 1;
      localStorage.setItem(COUNTER_KEY, String(n));
    } catch (e) {
      n = ++state.memCounter;
    }
    return 'PE-' + String(n).padStart(4, '0');
  }

  function saveRequest(rec) {
    try {
      var list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(list)) list = [];
      list.push(rec);
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      state.memRequests.push(rec);
      return false;
    }
  }

  function timestamp(d) {
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderConfirm(rec) {
    var input = rec.input, r = rec.result, rel = rec.relevance;
    var html = '';
    html += '<div class="status-chip ' + (rel.relevant ? 'ok' : 'warn') + '">' + esc(rel.label) + '</div>';
    if (!rel.relevant) {
      html += '<p class="hint">Motive:</p>' + listHtml(rel.missing, 'reasons');
    }
    html += '<p class="route">Propunere de alocare: <strong>Tech-Con ' + esc(rec.location) + '</strong></p>';
    if (!rec.saved) html += '<p class="hint">Browserul nu permite salvarea locală; cererea există doar în această pagină.</p>';

    html += '<article class="sheet" aria-labelledby="t-sheet">' +
      '<header class="sheet-head"><h3 id="t-sheet">Fișa de pre-evaluare</h3>' +
      '<p><span class="mono">' + esc(rec.id) + '</span> · ' + esc(rec.time) + '</p></header>';

    html += '<h4>Solicitant</h4>' + kv([
      ['Firmă', rec.contact.firma], ['Rol', rec.contact.rol], ['Județ', rec.contact.judet],
      ['Alocare propusă', 'Tech-Con ' + rec.location]
    ]);

    html += '<h4>Linia</h4>' + kv([
      ['Tip produs / industrie', industrieLabel(input.industrie)],
      ['Greutate găleată', fmt(U.parseNum(input.greutate), 2) + ' kg'],
      ['Găleți pe palet', fmt(U.parseNum(input.galetiPalet), 0)],
      ['Debit linie', fmt(U.parseNum(input.debit), 2) + ' găleți/min'],
      ['Program', fmt(U.parseNum(input.schimburi), 0) + ' schimburi × ' + fmt(U.parseNum(input.ore), 1) + ' h'],
      ['Operatori la paletizare / schimb', fmt(U.parseNum(input.operatori), 0)],
      ['Mâner', choiceLabel(input.maner)],
      ['Separator între straturi', choiceLabel(input.separator)],
      ['Spațiu la capătul liniei', choiceLabel(input.spatiu)],
      ['Greutate gripper', fmt(r.calc.gripperKg, 2) + ' kg (ipoteză)']
    ]);

    html += '<h4>Verdict</h4><p class="sheet-verdict verdict-text-' + r.verdict + '">' + esc(r.verdictLabel) + '</p>' + listHtml(r.reasons, 'reasons');
    html += '<h4>Calcule</h4>' + calcTable(calcRows(input, r));
    html += '<p class="hint">' + esc(r.calc.blocaj) + '</p>';
    html += listHtml(r.notes.concat(r.fixed), 'notes');
    html += '</article>';

    $('confirm-body').innerHTML = html;
  }

  function kv(rows) {
    return '<dl class="kv">' + rows.map(function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1] || '–') + '</dd></div>';
    }).join('') + '</dl>';
  }

  /* ---------- evenimente ---------- */

  function fillSelect(sel, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }

  function restart() {
    $('f-line').reset();
    $('f-request').reset();
    renderErrors($('f-line'), LINE_FIELDS, {});
    renderWarnings($('f-line'), {});
    renderErrors($('f-request'), CONTACT_FIELDS, {});
    $('form-summary').textContent = '';
    state.input = null; state.result = null;
    show('s-form');
  }

  function init() {
    fillSelect($('rol'), C.roluri);
    fillSelect($('judet'), C.judete);

    var fLine = $('f-line');

    // Verifică formularul. Erorile opresc; avertismentele se afișează, dar evaluarea continuă.
    function checkLine(withFocus) {
      var input = readForm(fLine, LINE_FIELDS);
      var v = U.validate(input);
      var first = renderErrors(fLine, LINE_FIELDS, v.errors);
      renderWarnings(fLine, v.warnings);
      if (!v.ok) {
        updateSummary(fLine);
        if (v.errors.gripper) fLine.querySelector('details.assumptions').open = true;
        goToField(first, withFocus);
        return false;
      }
      $('form-summary').textContent = '';
      state.input = input;
      state.result = U.evaluate(input);
      renderResult(input, state.result);
      show('s-result');
      return true;
    }

    fLine.addEventListener('submit', function (ev) {
      ev.preventDefault();
      checkLine(true);
    });

    // La tastare: eroarea dispare când valoarea devine corectă. La ieșirea din câmp: se arată eroarea curentă.
    function liveCheck(ev, onBlur) {
      var t = ev.target;
      if (!t || !t.name || LINE_FIELDS.indexOf(t.name) < 0) return;
      var name = t.name;
      var input = readForm(fLine, LINE_FIELDS);
      var v = U.validate(input);
      var err = v.errors[name] || '';
      var box = fLine.querySelector('[data-field="' + name + '"]');
      var hadErr = !!(box && box.classList.contains('has-error'));
      if (hadErr && !err) setFieldError(fLine, name, '');
      else if (onBlur && err && (hadErr || input[name] !== '')) setFieldError(fLine, name, err);
      renderWarnings(fLine, v.warnings);
      if ($('form-summary').textContent) updateSummary(fLine);
    }
    fLine.addEventListener('input', function (ev) { liveCheck(ev, false); });
    fLine.addEventListener('change', function (ev) { liveCheck(ev, false); });
    fLine.addEventListener('focusout', function (ev) { liveCheck(ev, true); });

    /* exemple pentru juriu */
    var EX_OK = { industrie: 'creme', greutate: '13', galetiPalet: '44', debit: '6', schimburi: '3', ore: '8', operatori: '2', maner: 'da', separator: 'da', spatiu: 'da', gripper: '4' };
    var EX_BAD = { industrie: 'creme', greutate: 'abc', galetiPalet: '-44', debit: '0', schimburi: '5', ore: '8', operatori: '', maner: 'da', separator: 'da', spatiu: '', gripper: '4' };

    function fillLine(data) {
      fLine.reset();
      renderErrors(fLine, LINE_FIELDS, {});
      renderWarnings(fLine, {});
      $('form-summary').textContent = '';
      LINE_FIELDS.forEach(function (name) {
        var val = data[name] === undefined ? '' : data[name];
        var radios = fLine.querySelectorAll('input[type="radio"][name="' + name + '"]');
        if (radios.length) {
          radios.forEach(function (r) { r.checked = r.value === val; });
        } else if (fLine.elements[name]) {
          fLine.elements[name].value = val;
        }
      });
    }

    $('b-ex-ok').addEventListener('click', function () { fillLine(EX_OK); checkLine(false); });
    // fără focus pe câmp: pe telefon tastatura ar acoperi mesajele
    $('b-ex-bad').addEventListener('click', function () { fillLine(EX_BAD); checkLine(false); });

    $('f-request').addEventListener('input', clearFieldError);
    $('f-request').addEventListener('change', clearFieldError);

    $('b-edit').addEventListener('click', function () { show('s-form'); });
    $('b-request').addEventListener('click', function () { show('s-request'); });
    $('b-back').addEventListener('click', function () { show('s-result'); });
    $('b-print').addEventListener('click', function () { window.print(); });
    document.querySelectorAll('[data-action="restart"]').forEach(function (b) {
      b.addEventListener('click', restart);
    });

    var fReq = $('f-request');
    fReq.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!state.result) { show('s-form'); return; }
      var contact = readForm(fReq, CONTACT_FIELDS);
      var errors = {};
      if (!contact.firma) errors.firma = 'Scrie numele firmei (fictiv).';
      if (!contact.rol) errors.rol = 'Alege rolul.';
      if (!contact.judet) errors.judet = 'Alege județul.';
      var first = renderErrors(fReq, CONTACT_FIELDS, errors);
      if (first) { first.focus(); return; }

      var rec = {
        id: nextId(),
        time: timestamp(new Date()),
        createdAt: new Date().toISOString(),
        input: state.input,
        result: state.result,
        contact: contact,
        location: U.routeLocation(contact.judet),
        relevance: U.isRelevantRequest(state.input, state.result, contact)
      };
      rec.saved = saveRequest(rec);
      renderConfirm(rec);
      show('s-confirm');
    });
  }

  function clearFieldError(ev) {
    var t = ev.target;
    if (!t || !t.name) return;
    var box = t.closest('[data-field]');
    if (box && box.classList.contains('has-error')) {
      box.classList.remove('has-error');
      var msg = $('e-' + t.name);
      if (msg) msg.textContent = '';
      t.form.querySelectorAll('[name="' + t.name + '"]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
