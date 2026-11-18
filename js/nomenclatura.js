// Nombres de los compuestos binarios (nomenclatura de composición con prefijos y
// nomenclatura con número de oxidación, recomendaciones de la IUPAC de 2005) y retos
// de «Nombra rápido».
window.CC = window.CC || {};

(function () {
  var PREFIXES = { 1: 'mono', 2: 'di', 3: 'tri', 4: 'tetra' };
  var ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
  var VARIABLE = { Fe: true, Cu: true };

  function applyPrefix(prefix, base) {
    if (!prefix) return base;
    if (prefix === 'mono' && base === 'óxido') return 'monóxido';
    if (prefix === 'tetra' && base === 'óxido') return 'tetróxido';
    return prefix + base;
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function formulaHTML(catSym, catCount, aniSym, aniCount) {
    return catSym + (catCount > 1 ? '<sub>' + catCount + '</sub>' : '') +
           aniSym + (aniCount > 1 ? '<sub>' + aniCount + '</sub>' : '');
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  // Los tres compuestos en los que el hidrógeno tiene número de oxidación +1.
  var SPECIAL = {
    H2O: { systematic: 'Agua (oxidano)', stock: 'Óxido de hidrógeno',
           distractors: ['Dióxido de hidrógeno', 'Monóxido de dihidruro'],
           formulaDistractors: ['HO<sub>2</sub>', 'H<sub>2</sub>O<sub>2</sub>'] },
    HCl: { systematic: 'Cloruro de hidrógeno', stock: 'Cloruro de hidrógeno',
           distractors: ['Hidruro de cloro', 'Dicloruro de hidrógeno'],
           formulaDistractors: ['H<sub>2</sub>Cl', 'HCl<sub>2</sub>'] },
    H2S: { systematic: 'Sulfuro de dihidrógeno', stock: 'Sulfuro de hidrógeno',
           distractors: ['Disulfuro de hidrógeno', 'Hidruro de azufre'],
           formulaDistractors: ['HS<sub>2</sub>', 'H<sub>2</sub>S<sub>2</sub>'] }
  };

  function buildCompoundInfo(cation, anion) {
    var catCount = cation.count, aniCount = anion.count;
    var key = cation.symbol + (catCount > 1 ? catCount : '') + anion.symbol + (aniCount > 1 ? aniCount : '');
    var html = formulaHTML(cation.symbol, catCount, anion.symbol, aniCount);

    if (SPECIAL[key]) {
      var s = SPECIAL[key];
      return { key: key, formulaHTML: html, systematic: s.systematic, stock: s.stock, isVariable: false,
               distractors: s.distractors.slice(), formulaDistractors: s.formulaDistractors.slice() };
    }

    var anionEl = CC.ELEMENTS[anion.symbol];
    var cationEl = CC.ELEMENTS[cation.symbol];
    var isVariable = !!VARIABLE[cation.symbol];

    // «Mono» solo cuando hace falta para distinguir: FeO (monóxido de hierro) frente a
    // Fe2O3. En Cu2O o Cu2S el prefijo «di» del metal ya lo distingue (óxido de dicobre).
    var useAnionMono = isVariable && aniCount === 1 && catCount === 1;
    var aniPrefix = aniCount > 1 || useAnionMono ? PREFIXES[aniCount] : '';
    var catPrefix = catCount > 1 ? PREFIXES[catCount] : '';

    var anionPart = applyPrefix(aniPrefix, anionEl.anionRoot);
    var cationPart = applyPrefix(catPrefix, cationEl.cationName);
    var systematic = capitalize(anionPart + ' de ' + cationPart);

    var stock = isVariable
      ? capitalize(anionEl.anionRoot + ' de ' + cationEl.cationName + '(' + ROMAN[cation.charge] + ')')
      : capitalize(anionEl.anionRoot + ' de ' + cationEl.cationName);

    var distractors = [];
    function addD(n) { if (n !== systematic && distractors.indexOf(n) === -1) distractors.push(n); }

    // Error típico: intercambiar los subíndices.
    if (catCount !== aniCount) {
      addD(capitalize(applyPrefix(catCount > 1 ? PREFIXES[catCount] : '', anionEl.anionRoot) + ' de ' +
                      applyPrefix(aniCount > 1 ? PREFIXES[aniCount] : '', cationEl.cationName)));
    }
    // Error típico: mezclar prefijos y número de oxidación.
    if (isVariable) {
      var wrong = cation.symbol === 'Fe' ? (cation.charge === 3 ? 2 : 3) : (cation.charge === 2 ? 1 : 2);
      addD(capitalize(anionEl.anionRoot + ' de ' + cationEl.cationName + '(' + ROMAN[wrong] + ')'));
    } else {
      addD(capitalize(anionEl.anionRoot + ' de ' + cationEl.cationName + '(' + (cation.charge === 1 ? 'II' : 'I') + ')'));
    }
    addD(capitalize(applyPrefix(aniCount === 2 ? 'tri' : 'di', anionEl.anionRoot) + ' de ' + cationPart));

    var formulaDistractors = [];
    function addF(f) { if (f !== html && formulaDistractors.indexOf(f) === -1) formulaDistractors.push(f); }
    if (catCount !== aniCount) addF(formulaHTML(cation.symbol, aniCount, anion.symbol, catCount));
    addF(formulaHTML(cation.symbol, catCount + 1, anion.symbol, aniCount));
    addF(formulaHTML(cation.symbol, catCount, anion.symbol, aniCount + 1));

    return { key: key, formulaHTML: html, systematic: systematic, stock: stock, isVariable: isVariable,
             distractors: distractors.slice(0, 2), formulaDistractors: formulaDistractors.slice(0, 2) };
  }

  // Reto variado: fórmula → nombre con prefijos, nombre → fórmula y, en el nivel
  // avanzado con Fe o Cu, fórmula → nombre con número de oxidación.
  function generateFlashQuestion(cation, anion, level) {
    var info = buildCompoundInfo(cation, anion);
    var modes = ['FORMULA_TO_SYS', 'NAME_TO_FORMULA'];
    if (level === 'ADVANCED' && info.isVariable) modes.push('FORMULA_TO_STOCK');
    var mode = modes[Math.floor(Math.random() * modes.length)];

    var headerHTML = info.formulaHTML;
    var promptText = 'Elige el nombre con prefijos';
    var options;

    if (mode === 'NAME_TO_FORMULA') {
      headerHTML = info.systematic;
      promptText = 'Elige la fórmula';
      options = [
        { text: info.formulaHTML, correct: true },
        { text: info.formulaDistractors[0], correct: false },
        { text: info.formulaDistractors[1], correct: false }
      ];
    } else if (mode === 'FORMULA_TO_STOCK') {
      promptText = 'Elige el nombre con número de oxidación';
      var wrong = cation.symbol === 'Fe' ? (cation.charge === 3 ? 2 : 3) : (cation.charge === 2 ? 1 : 2);
      var root = CC.ELEMENTS[anion.symbol].anionRoot, cat = CC.ELEMENTS[cation.symbol].cationName;
      options = [
        { text: info.stock, correct: true },
        { text: capitalize(root + ' de ' + cat + '(' + ROMAN[wrong] + ')'), correct: false },
        { text: capitalize(root + ' de ' + cat + '(IV)'), correct: false }
      ];
    } else {
      options = [
        { text: info.systematic, correct: true },
        { text: info.distractors[0] || info.stock, correct: false },
        { text: info.distractors[1] || capitalize(applyPrefix('tetra', CC.ELEMENTS[anion.symbol].anionRoot || 'óxido') + ' de ' + CC.ELEMENTS[cation.symbol].cationName), correct: false }
      ];
    }

    shuffle(options);
    var correctText = mode === 'NAME_TO_FORMULA' ? info.formulaHTML + ' (' + info.systematic + ')'
                    : (mode === 'FORMULA_TO_STOCK' ? info.stock : info.systematic);
    return { key: info.key, formulaHTML: info.formulaHTML, systematic: info.systematic, stock: info.stock,
             headerHTML: headerHTML, promptText: promptText, options: options, correctText: correctText };
  }

  CC.buildCompoundInfo = buildCompoundInfo;
  CC.generateFlashQuestion = generateFlashQuestion;
  CC.shuffle = shuffle;
})();
