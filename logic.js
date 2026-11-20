/* Verificator UR20: logică pură (fără DOM).
 * Expune window.UR20 = { evaluate, validate, routeLocation, isRelevantRequest, CONFIG, ... }
 * ca să poată fi apelată și din app/test.html.
 */
(function (root) {
  'use strict';

  var CONFIG = {
    // Sarcina utilă UR20 = 20 kg. Verificat pe fișa tehnică Universal Robots
    // (25 kg doar „cu condiții limită conform manualului”; folosim 20 kg).
    capacitateKg: 20,
    capacitateSursa: 'fișa Universal Robots',

    // IPOTEZĂ, nu fapt: greutatea gripperului. Editabilă de utilizator.
    gripperKgImplicit: 4,

    // FAPTE PURATOS (test FAT, 2 celule UR20 Tech-Con).
    referinta: {
      debit5kg: 8.6,      // găleți/min la 5 kg
      debit13kg: 7.4,     // găleți/min la 13 kg
      tinta: 6,           // găleți/min, ținta PURATOS
      greutateMin: 5,     // interval testat, kg
      greutateMax: 13,
      palet5kg: 100,      // găleți de 5 kg pe palet
      palet13kg: 44       // găleți de 13 kg pe palet
    },

    // Industrii: cheie -> { eticheta, alimentara }
    industrii: [
      { key: 'creme', label: 'Creme și umpluturi', alimentara: true },
      { key: 'gemuri', label: 'Gemuri și glazuri', alimentara: true },
      { key: 'sosuri', label: 'Sosuri', alimentara: true },
      { key: 'lactate', label: 'Lactate HoReCa', alimentara: true },
      { key: 'panificatie', label: 'Ingrediente pentru panificație', alimentara: true },
      { key: 'alt_aliment', label: 'Alt aliment', alimentara: true },
      { key: 'alta_industrie', label: 'Altă industrie (ex. vopsele)', alimentara: false }
    ],

    roluri: ['Director producție', 'Director fabrică', 'Responsabil investiții', 'Responsabil SSM', 'Altul'],

    judete: ['Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov',
      'Brăila', 'București', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța', 'Covasna',
      'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași',
      'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare',
      'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui', 'Vrancea'],

    // Alocare Tech-Con după județ (ușor de ajustat).
    rutare: {
      moldova: { loc: 'Iași', judete: ['Bacău', 'Botoșani', 'Galați', 'Iași', 'Neamț', 'Suceava', 'Vaslui', 'Vrancea'] },
      vest: { loc: 'Timișoara', judete: ['Timiș', 'Arad', 'Caraș-Severin', 'Hunedoara', 'Bihor'] },
      implicit: { loc: 'Dragomirești-Deal' }
    },

    text: {
      garantie: 'Rezultat de test PURATOS, nu garanție pentru linia ta.',
      manual: 'Rămâne manual: schimbarea paleților și amplasarea separatoarelor.',
      neacoperit: 'Celula nu acoperă: transportul paleților, înfolierea, expedierea.'
    },

    verdicte: {
      afara: 'În afara aplicației de referință',
      validare: 'Necesită validare suplimentară',
      potrivit: 'Potrivit pentru evaluare tehnică'
    },

    // Câmpuri tehnice (ordinea din formular).
    campuriTehnice: [
      { key: 'industrie', label: 'tip produs / industrie', tip: 'alegere' },
      { key: 'greutate', label: 'greutate găleată', tip: 'numar' },
      { key: 'galetiPalet', label: 'găleți pe palet', tip: 'numar' },
      { key: 'debit', label: 'debit linie', tip: 'numar' },
      { key: 'schimburi', label: 'schimburi pe zi', tip: 'numar' },
      { key: 'ore', label: 'ore pe schimb', tip: 'numar' },
      { key: 'operatori', label: 'operatori la paletizare', tip: 'numar' },
      { key: 'maner', label: 'mâner', tip: 'alegere' },
      { key: 'separator', label: 'separator între straturi', tip: 'alegere' },
      { key: 'spatiu', label: 'spațiu la capătul liniei', tip: 'alegere' }
    ]
  };

  /* ---------- utilitare ---------- */

  // Acceptă numere sau text cu virgulă („7,4”). Întoarce NaN dacă nu e număr.
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return NaN;
    var s = String(v).trim().replace(/\s+/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s) && !/^-?\.\d+$/.test(s)) return NaN;
    return parseFloat(s);
  }

  function isEmpty(v) {
    return v === null || v === undefined || String(v).trim() === '';
  }

  // Format românesc: 37.440 / 8,18. maxDec = zecimale maxime, zerourile de la final se taie.
  function fmt(n, maxDec) {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    var d = maxDec === undefined ? 2 : maxDec;
    var f = Math.pow(10, d);
    var r = Math.round(n * f) / f;
    var neg = r < 0;
    var parts = Math.abs(r).toFixed(d).split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var dec = parts[1] ? parts[1].replace(/0+$/, '') : '';
    return (neg ? '-' : '') + intPart + (dec ? ',' + dec : '');
  }

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function industrie(key) {
    for (var i = 0; i < CONFIG.industrii.length; i++) {
      if (CONFIG.industrii[i].key === key) return CONFIG.industrii[i];
    }
    return null;
  }

  function isAlimentara(key) {
    var ind = industrie(key);
    return !!(ind && ind.alimentara);
  }

  /* ---------- validare (de extins la pasul B4) ---------- */

  // Întoarce { ok, errors: { camp: mesaj } }.
  function validate(input) {
    input = input || {};
    var errors = {};
    CONFIG.campuriTehnice.forEach(function (c) {
      var v = input[c.key];
      if (isEmpty(v)) {
        errors[c.key] = c.tip === 'alegere' ? 'Alege o variantă.' : 'Completează câmpul.';
      } else if (c.tip === 'numar' && isNaN(parseNum(v))) {
        errors[c.key] = 'Scrie un număr (ex. 7,4).';
      }
    });
    if (!isEmpty(input.gripper) && isNaN(parseNum(input.gripper))) {
      errors.gripper = 'Scrie un număr (ex. 4).';
    }
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /* ---------- evaluare ---------- */

  function debitReferinta(g) {
    var ref = CONFIG.referinta;
    if (g === ref.greutateMin) return ref.debit5kg;
    if (g < ref.greutateMin) return ref.debit5kg;
    return ref.debit13kg;
  }

  function evaluate(input) {
    input = input || {};
    var ref = CONFIG.referinta;
    var g = parseNum(input.greutate);
    var palet = parseNum(input.galetiPalet);
    var debit = parseNum(input.debit);
    var schimburi = parseNum(input.schimburi);
    var ore = parseNum(input.ore);
    var operatori = parseNum(input.operatori);
    var gripperIn = isEmpty(input.gripper) ? NaN : parseNum(input.gripper);
    var gripper = isNaN(gripperIn) ? CONFIG.gripperKgImplicit : gripperIn;
    var alimentara = isAlimentara(input.industrie);

    var notes = [];
    var conditii = [];

    /* debit de referință */
    var dRef = debitReferinta(g);
    if (g < ref.greutateMin) {
      notes.push('Sub 5 kg folosim valoarea testată la 5 kg (8,6 găleți/min), dar formatul tău este în afara intervalului testat 5–13 kg.');
    } else if (g > ref.greutateMin && g < ref.greutateMax) {
      notes.push('Între 5 și 13 kg folosim valoarea testată la 13 kg (7,4); de validat pentru formatul tău.');
    } else if (g > ref.greutateMax) {
      notes.push('Peste 13 kg folosim valoarea testată la 13 kg (7,4), dar formatul tău este în afara intervalului testat 5–13 kg.');
    }
    notes.push(CONFIG.text.garantie);

    /* sarcina totală */
    var sarcina = g + gripper;
    var depasit = sarcina > CONFIG.capacitateKg;

    /* condiții pentru validare suplimentară */
    if (g < ref.greutateMin) {
      conditii.push('Găleata de ' + fmt(g, 2) + ' kg este sub intervalul testat la PURATOS (5–13 kg).');
    } else if (g > ref.greutateMax) {
      conditii.push('Găleata de ' + fmt(g, 2) + ' kg este peste intervalul testat la PURATOS (5–13 kg).');
    }
    if (debit > dRef) {
      conditii.push('Debitul liniei (' + fmt(debit, 2) + ' găleți/min) depășește valoarea testată pentru acest format (' + fmt(dRef, 1) + ' găleți/min).');
    }
    if (input.maner === 'nu') {
      conditii.push('Găleată fără mâner: modul de prindere trebuie validat separat.');
    }
    if (!alimentara) {
      conditii.push('Industrie din afara segmentului alimentar: cerințele tehnice se validează separat.');
    }
    if (input.spatiu === 'nu') {
      conditii.push('Nu există spațiu la capătul liniei pentru celulă: amplasarea trebuie studiată.');
    } else if (input.spatiu === 'nu_stiu') {
      conditii.push('Spațiul la capătul liniei nu este cunoscut: se măsoară la evaluare.');
    }

    var verdict, reasons;
    if (depasit) {
      verdict = 'afara';
      reasons = ['Găleata (' + fmt(g, 2) + ' kg) + gripper (' + fmt(gripper, 2) + ' kg, ipoteză) = ' +
        fmt(sarcina, 2) + ' kg, peste capacitatea UR20 de ' + CONFIG.capacitateKg + ' kg.'].concat(conditii);
    } else if (conditii.length) {
      verdict = 'validare';
      reasons = conditii;
    } else {
      verdict = 'potrivit';
      reasons = [
        'Greutatea (' + fmt(g, 2) + ' kg) este în intervalul testat la PURATOS (5–13 kg).',
        'Sarcina totală (' + fmt(sarcina, 2) + ' kg, cu gripper) nu depășește capacitatea UR20 de ' + CONFIG.capacitateKg + ' kg.',
        'Debitul liniei (' + fmt(debit, 2) + ' găleți/min) nu depășește valoarea testată (' + fmt(dRef, 1) + ' găleți/min).',
        'Industrie alimentară, găleată cu mâner, spațiu disponibil la capătul liniei.'
      ];
    }

    if (input.separator === 'da') {
      notes.push('Ai separator între straturi: amplasarea lui rămâne o operație manuală.');
    }

    /* calcule */
    var galetiPeSchimb = debit * 60 * ore;
    var kgSchimb = galetiPeSchimb * g;
    var calc = {
      debitReferinta: dRef,
      galetiPeSchimb: galetiPeSchimb,
      kgPeSchimb: kgSchimb,
      tonePeSchimb: kgSchimb / 1000,
      kgPeZi: kgSchimb * schimburi,
      kgPeOperator: operatori > 0 ? kgSchimb / operatori : null,
      paletiPeOra: palet > 0 ? debit * 60 / palet : null,
      minuteIntrePaleti: debit > 0 ? palet / debit : null,
      sarcinaTotala: sarcina,
      gripperKg: gripper,
      gripperIpoteza: true,
      capacitateKg: CONFIG.capacitateKg,
      blocaj: null
    };

    if (debit < dRef) {
      calc.blocaj = 'Linia ta e mai lentă decât robotul în test: limita este în amonte, robotul nu crește debitul fabricii.';
    } else if (debit > dRef) {
      calc.blocaj = 'Debitul liniei depășește valoarea testată: robotul poate deveni blocajul; de validat.';
    } else {
      calc.blocaj = 'Debitul liniei este egal cu valoarea testată: fără rezervă de debit; ritmul se confirmă la evaluare.';
    }

    return {
      verdict: verdict,
      verdictLabel: CONFIG.verdicte[verdict],
      reasons: reasons,
      calc: calc,
      notes: notes,
      fixed: [CONFIG.text.manual, CONFIG.text.neacoperit]
    };
  }

  /* ---------- rutare și cerere ---------- */

  function routeLocation(judet) {
    var j = norm(judet);
    var r = CONFIG.rutare;
    if (r.moldova.judete.some(function (x) { return norm(x) === j; })) return r.moldova.loc;
    if (r.vest.judete.some(function (x) { return norm(x) === j; })) return r.vest.loc;
    return r.implicit.loc;
  }

  // { relevant, label, missing: [...] }
  function isRelevantRequest(input, result, contact) {
    input = input || {};
    contact = contact || {};
    var missing = [];
    if (!isEmpty(input.industrie) && !isAlimentara(input.industrie)) {
      missing.push('industrie din afara segmentului alimentar');
    }
    if (result && result.verdict === 'afara') {
      missing.push('în afara aplicației de referință');
    }
    CONFIG.campuriTehnice.forEach(function (c) {
      var v = input[c.key];
      if (isEmpty(v) || (c.tip === 'numar' && isNaN(parseNum(v)))) missing.push('lipsește: ' + c.label);
    });
    if (isEmpty(contact.firma)) missing.push('lipsește: firmă');
    if (isEmpty(contact.rol)) missing.push('lipsește: rol');
    if (isEmpty(contact.judet)) missing.push('lipsește: județ');
    var relevant = missing.length === 0;
    return { relevant: relevant, label: relevant ? 'cerere relevantă' : 'cerere incompletă', missing: missing };
  }

  root.UR20 = {
    evaluate: evaluate,
    validate: validate,
    routeLocation: routeLocation,
    isRelevantRequest: isRelevantRequest,
    CONFIG: CONFIG,
    parseNum: parseNum,
    fmt: fmt,
    industrie: industrie,
    isAlimentara: isAlimentara
  };
})(typeof window !== 'undefined' ? window : this);
