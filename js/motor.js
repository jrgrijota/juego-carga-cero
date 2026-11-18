// Motor del juego: baraja, reglas del reactor, combos, retos y jugador automático.
// No toca la página: avisa a la interfaz con onStateChange(estado) y onEvent(evento).
window.CC = window.CC || {};

(function () {
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  function t(s, v) { return window.i18n ? window.i18n.t(s, v) : s; }

  var HAND_SIZE = 5;
  var STAGNATION_LIMIT = 3;

  function GameEngine(config, onStateChange, onEvent) {
    this.config = {
      level: config.level || 'BASIC',
      blindMode: !!config.blindMode,
      mode: config.mode || 'BOT',
      botLevel: config.botLevel || 'CHEMIST'
    };
    this.onStateChange = onStateChange;
    this.onEvent = onEvent;
    this.state = null;
    this.destroyed = false;
    this.quizSeq = 0;
  }

  GameEngine.prototype.destroy = function () { this.destroyed = true; };

  GameEngine.prototype.initGame = function (playerNames) {
    var deck = this.buildDeck();
    var hands = [[], []];
    for (var i = 0; i < HAND_SIZE; i++) { hands[0].push(deck.pop()); hands[1].push(deck.pop()); }
    this.state = {
      status: 'PLAYING',
      turn: 0,
      players: [
        { name: playerNames[0], score: 0, hand: hands[0] },
        { name: playerNames[1], score: 0, hand: hands[1] }
      ],
      deck: deck,
      discard: [],
      reactor: this.createEmptyReactor(),
      quiz: null,
      synthesizedHistory: [],
      lastAction: t('Empieza {n}. El reactor está vacío.', { n: playerNames[0] })
    };
    this.emitState();
  };

  GameEngine.prototype.createEmptyReactor = function () {
    return { status: 'EMPTY', cation: null, anion: null, pendingH: null,
             cardsInPile: [], atomHistory: [], netCharge: 0, stagnationCounter: 0 };
  };

  GameEngine.prototype.buildDeck = function () {
    var deck = [], uid = 1, self = this;
    Object.keys(CC.ELEMENTS).forEach(function (key) {
      var el = CC.ELEMENTS[key];
      var cards = [];
      for (var i = 0; i < el.count; i++) {
        var numbers;
        if (el.category === 'HYDROGEN') numbers = [1, -1];
        else if (self.config.level === 'BASIC') numbers = [el.numbersBasic.length === el.count ? el.numbersBasic[i] : el.numbersBasic[0]];
        else numbers = el.numbersAdvanced.slice();
        cards.push({ id: 'c_' + (uid++), type: 'ELEMENT', symbol: el.symbol, name: el.name,
                     category: el.category, valences: numbers, blindModeType: null });
      }
      if (self.config.blindMode && cards.length >= 2) {
        var idx = CC.shuffle(cards.map(function (_, k) { return k; }));
        cards[idx[0]].blindModeType = 'NO_SYMBOL';
        cards[idx[1]].blindModeType = 'NO_NAME';
      }
      deck.push.apply(deck, cards);
    });
    CC.SPECIAL_CARDS.forEach(function (sp) {
      for (var i = 0; i < sp.count; i++) {
        deck.push({ id: 'c_' + (uid++), type: 'SPECIAL', specialType: sp.specialType, symbol: sp.symbol,
                    name: sp.name, desc: sp.desc, category: 'SPECIAL', valences: [], blindModeType: null });
      }
    });
    return CC.shuffle(deck);
  };

  // Número de oxidación que toma el hidrógeno según lo que ya hay en el reactor.
  GameEngine.prototype.resolveHydrogen = function (r) {
    if (r.cation && r.cation.symbol === 'H') return r.cation.charge;
    if (r.anion && r.anion.symbol === 'H') return r.anion.charge;
    var existing = r.cation || r.anion;
    return existing.charge > 0 ? -1 : 1;
  };

  GameEngine.prototype.canPlayCard = function (card, forcedCharge) {
    var r = this.state.reactor;
    if (forcedCharge === undefined) forcedCharge = null;

    if (card.type === 'SPECIAL') {
      if (r.status === 'EMPTY') return { valid: false, reason: t('El reactor está vacío.') };
      if (card.specialType === 'ELECTROLYSIS') {
        return r.atomHistory.length > 0 ? { valid: true } : { valid: false, reason: t('No hay átomos que quitar.') };
      }
      if (card.specialType === 'CATALYST') {
        var last = r.atomHistory[r.atomHistory.length - 1];
        if (!last) return { valid: false, reason: t('No hay ningún átomo que repetir.') };
        var dummy = { type: 'ELEMENT', symbol: last.symbol,
                      category: last.isHydrogen ? 'HYDROGEN' : (last.charge > 0 ? 'METAL' : 'NON_METAL'),
                      valences: [last.charge] };
        return this.canPlayElement(dummy, last.charge);
      }
      if (card.specialType === 'ISOTOPE') {
        var opts = this.getIsotopeOptions();
        return opts.length > 0 ? { valid: true, isotopeOptions: opts }
                               : { valid: false, reason: t('Ningún elemento del reactor admite más átomos.') };
      }
    }

    var candidates = forcedCharge !== null ? [forcedCharge] : card.valences;
    for (var i = 0; i < candidates.length; i++) {
      var check = this.canPlayElement(card, candidates[i]);
      if (check.valid) return check;
    }
    return this.canPlayElement(card, candidates[0]);
  };

  GameEngine.prototype.canPlayElement = function (card, selectedCharge) {
    var r = this.state.reactor;
    if (r.status === 'EMPTY') return { valid: true };

    if (r.pendingH) {
      if (card.category === 'HYDROGEN') {
        return r.pendingH.count >= 2 ? { valid: false, reason: t('Pon antes un metal o un no metal.') } : { valid: true };
      }
      // Con un metal de número +n hacen falta n hidrógenos; con un no metal de −n, también n.
      var maxH = Math.abs(selectedCharge);
      return r.pendingH.count > maxH ? { valid: false, reason: t('Hay demasiados hidrógenos para este número de oxidación.') } : { valid: true };
    }

    var eff = card.category === 'HYDROGEN' ? this.resolveHydrogen(r) : selectedCharge;
    var isCation = eff > 0;
    var target = isCation ? r.cation : r.anion;
    var opposite = isCation ? r.anion : r.cation;

    if (target && target.symbol !== card.symbol) return { valid: false, reason: t('Solo compuestos binarios: dos elementos.') };
    if (target && target.charge !== eff) return { valid: false, reason: t('Ese elemento ya está con otro número de oxidación.') };

    if (opposite) {
      var absCat = isCation ? eff : opposite.charge;
      var absAni = Math.abs(isCation ? opposite.charge : eff);
      var div = gcd(absCat, absAni);
      var needed = isCation ? absAni / div : absCat / div;
      if ((target ? target.count : 0) + 1 > needed) return { valid: false, reason: t('Sobra: la fórmula ya no se puede simplificar así.') };
    } else if (target && target.count >= 2) {
      return { valid: false, reason: t('Pon antes un elemento de signo contrario.') };
    }
    return { valid: true };
  };

  GameEngine.prototype.getIsotopeOptions = function () {
    var r = this.state.reactor, opts = [];
    if (r.pendingH && r.pendingH.count < 2) opts.push({ symbol: 'H', name: 'Hidrógeno', charge: 0, role: 'pending' });
    if (r.cation) {
      var dc = { type: 'ELEMENT', symbol: r.cation.symbol, category: r.cation.symbol === 'H' ? 'HYDROGEN' : 'METAL', valences: [r.cation.charge] };
      if (this.canPlayElement(dc, r.cation.charge).valid) opts.push(Object.assign({}, r.cation, { role: 'cation' }));
    }
    if (r.anion) {
      var da = { type: 'ELEMENT', symbol: r.anion.symbol, category: r.anion.symbol === 'H' ? 'HYDROGEN' : 'NON_METAL', valences: [r.anion.charge] };
      if (this.canPlayElement(da, r.anion.charge).valid) opts.push(Object.assign({}, r.anion, { role: 'anion' }));
    }
    return opts;
  };

  GameEngine.prototype.playCard = function (playerIdx, cardId, chosenCharge, isotopeSymbol) {
    if (!this.state || this.state.status !== 'PLAYING' || this.state.turn !== playerIdx) return false;
    var player = this.state.players[playerIdx];
    var cardIndex = player.hand.findIndex(function (c) { return c.id === cardId; });
    if (cardIndex === -1) return false;
    var card = player.hand[cardIndex];
    if (chosenCharge === undefined) chosenCharge = null;

    // Si no se indica número de oxidación, se usa el primero válido (no siempre el primero de la carta).
    if (card.type === 'ELEMENT' && chosenCharge === null && card.category !== 'HYDROGEN') {
      var self = this;
      chosenCharge = card.valences.find(function (v) { return self.canPlayElement(card, v).valid; });
      if (chosenCharge === undefined) return false;
    }
    if (!this.canPlayCard(card, chosenCharge).valid) return false;

    player.hand.splice(cardIndex, 1);
    card.blindModeType = null;
    var r = this.state.reactor;

    if (card.type === 'SPECIAL') {
      if (card.specialType === 'ELECTROLYSIS') {
        var removed = r.atomHistory[r.atomHistory.length - 1];
        this.applyElectrolysis(card);
        this.state.lastAction = t('{p} usó Electrólisis y quitó {s}.', { p: player.name, s: removed ? removed.symbol : t('un átomo') });
        if (this.onEvent) this.onEvent({ type: 'ELECTROLYSIS_USED', playerName: player.name });
        this.refillHand(playerIdx);
        // Quitar un átomo no hace avanzar el compuesto: cuenta para la inestabilidad.
        this.registerNoProgress();
        this.advanceTurn();
        return true;
      }
      if (card.specialType === 'CATALYST') {
        var last = r.atomHistory[r.atomHistory.length - 1];
        this.addAtomToReactor(last.symbol, last.name, last.charge, card, last.isHydrogen);
        this.state.lastAction = t('{p} usó Catalizador y repitió {s}.', { p: player.name, s: last.symbol });
      }
      if (card.specialType === 'ISOTOPE') {
        var opts = this.getIsotopeOptions();
        var chosen = opts.find(function (o) { return o.symbol === isotopeSymbol; }) || opts[0];
        this.addAtomToReactor(chosen.symbol, chosen.name, chosen.charge, card, chosen.symbol === 'H');
        this.state.lastAction = t('{p} usó Isótopo comodín como {n} ({s}).', { p: player.name, n: chosen.name, s: chosen.symbol });
      }
    } else {
      this.addAtomToReactor(card.symbol, card.name, chosenCharge !== null ? chosenCharge : card.valences[0], card, card.category === 'HYDROGEN');
      var added = r.atomHistory[r.atomHistory.length - 1];
      var sign = added.charge > 0 ? '+' + added.charge : (added.charge < 0 ? '−' + Math.abs(added.charge) : '±1');
      this.state.lastAction = t('{p} jugó {n} ({s}, {c}).', { p: player.name, n: card.name, s: card.symbol, c: sign });
    }

    r.stagnationCounter = 0;
    this.refillHand(playerIdx);
    if (r.cation && r.anion && r.netCharge === 0) this.handleSynthesis(playerIdx, false);
    else this.advanceTurn();
    return true;
  };

  GameEngine.prototype.addAtomToReactor = function (symbol, name, rawCharge, physicalCard, isHydrogen) {
    var r = this.state.reactor;
    r.status = 'ACTIVE';
    r.cardsInPile.push(physicalCard);

    // Hidrógeno con el reactor vacío: aún no se sabe si será +1 o −1.
    if (isHydrogen && !r.cation && !r.anion) {
      if (!r.pendingH) r.pendingH = { symbol: 'H', name: 'Hidrógeno', count: 1 };
      else r.pendingH.count += 1;
      r.atomHistory.push({ role: 'pending', symbol: 'H', name: 'Hidrógeno', charge: 0, isHydrogen: true });
      r.netCharge = 0;
      return;
    }

    if (r.pendingH) {
      var hCharge = rawCharge > 0 ? -1 : 1;
      var hSlot = { symbol: 'H', name: 'Hidrógeno', charge: hCharge, count: r.pendingH.count };
      if (hCharge > 0) r.cation = hSlot; else r.anion = hSlot;
      r.atomHistory.forEach(function (item) {
        if (item.role === 'pending') { item.role = hCharge > 0 ? 'cation' : 'anion'; item.charge = hCharge; }
      });
      r.pendingH = null;
    }

    var eff = isHydrogen ? this.resolveHydrogen(r) : rawCharge;
    if (eff > 0) {
      if (!r.cation) r.cation = { symbol: symbol, name: name, charge: eff, count: 1 }; else r.cation.count += 1;
      r.atomHistory.push({ role: 'cation', symbol: symbol, name: name, charge: eff, isHydrogen: isHydrogen });
    } else {
      if (!r.anion) r.anion = { symbol: symbol, name: name, charge: eff, count: 1 }; else r.anion.count += 1;
      r.atomHistory.push({ role: 'anion', symbol: symbol, name: name, charge: eff, isHydrogen: isHydrogen });
    }
    this.recalculateNetCharge();
  };

  GameEngine.prototype.applyElectrolysis = function (card) {
    var r = this.state.reactor;
    this.state.discard.push(card);
    var lastAtom = r.atomHistory.pop();
    var removedCard = r.cardsInPile.pop();
    if (removedCard) this.state.discard.push(removedCard);
    if (lastAtom) {
      if (lastAtom.role === 'pending' && r.pendingH) {
        r.pendingH.count -= 1;
        if (r.pendingH.count <= 0) r.pendingH = null;
      } else if (lastAtom.role === 'cation' && r.cation) {
        r.cation.count -= 1;
        if (r.cation.count <= 0) r.cation = null;
      } else if (lastAtom.role === 'anion' && r.anion) {
        r.anion.count -= 1;
        if (r.anion.count <= 0) r.anion = null;
      }
    }
    // Si solo queda hidrógeno, vuelve a estar «sin decidir» (+1 o −1).
    var onlyH = (r.cation && r.cation.symbol === 'H' && !r.anion) || (r.anion && r.anion.symbol === 'H' && !r.cation);
    if (onlyH) {
      var h = r.cation || r.anion;
      r.pendingH = { symbol: 'H', name: 'Hidrógeno', count: h.count };
      r.cation = null; r.anion = null;
      r.atomHistory.forEach(function (item) { item.role = 'pending'; item.charge = 0; });
    }
    if (!r.cation && !r.anion && !r.pendingH) {
      var counter = r.stagnationCounter;
      this.state.reactor = this.createEmptyReactor();
      this.state.reactor.stagnationCounter = 0;
      return counter;
    }
    this.recalculateNetCharge();
  };

  GameEngine.prototype.recalculateNetCharge = function () {
    var r = this.state.reactor;
    r.netCharge = (r.cation ? r.cation.charge * r.cation.count : 0) + (r.anion ? r.anion.charge * r.anion.count : 0);
  };

  // Un turno que no añade átomos: a los 3 seguidos, el compuesto a medias se descompone.
  GameEngine.prototype.registerNoProgress = function () {
    var r = this.state.reactor;
    if (r.status !== 'ACTIVE') return;
    r.stagnationCounter += 1;
    if (r.stagnationCounter >= STAGNATION_LIMIT) {
      this.state.discard.push.apply(this.state.discard, r.cardsInPile);
      this.state.reactor = this.createEmptyReactor();
      this.state.lastAction = t('El compuesto a medias se descompuso tras 3 turnos sin avanzar.');
      if (this.onEvent) this.onEvent({ type: 'DECOMPOSED' });
    }
  };

  GameEngine.prototype.canPlayCombo = function (playerIdx, cardIds) {
    if (this.state.reactor.status !== 'EMPTY') return { valid: false };
    if (cardIds.length < 2 || cardIds.length > 5) return { valid: false };
    var hand = this.state.players[playerIdx].hand;
    var cards = cardIds.map(function (id) { return hand.find(function (c) { return c.id === id; }); }).filter(Boolean);
    if (cards.length !== cardIds.length || cards.some(function (c) { return c.type !== 'ELEMENT'; })) return { valid: false };
    var symbols = {};
    cards.forEach(function (c) { symbols[c.symbol] = true; });
    if (Object.keys(symbols).length !== 2) return { valid: false };

    var combos = this.cartesianProduct(cards.map(function (c) { return c.valences; }));
    for (var k = 0; k < combos.length; k++) {
      var combo = combos[k];
      if (combo.reduce(function (a, v) { return a + v; }, 0) !== 0) continue;
      var posIdx = combo.findIndex(function (v) { return v > 0; });
      var negIdx = combo.findIndex(function (v) { return v < 0; });
      if (posIdx === -1 || negIdx === -1) continue;
      var catSym = cards[posIdx].symbol, aniSym = cards[negIdx].symbol;
      if (catSym === aniSym) continue;
      var catCharge = combo[posIdx], aniCharge = combo[negIdx];
      var ok = true, catCount = 0, aniCount = 0;
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].symbol === catSym) { if (combo[i] !== catCharge) ok = false; catCount++; }
        else { if (combo[i] !== aniCharge) ok = false; aniCount++; }
      }
      var div = gcd(catCharge, Math.abs(aniCharge));
      if (ok && catCount === Math.abs(aniCharge) / div && aniCount === catCharge / div) return { valid: true, comboCharges: combo };
    }
    return { valid: false };
  };

  GameEngine.prototype.playCombo = function (playerIdx, cardIds) {
    if (!this.state || this.state.status !== 'PLAYING' || this.state.turn !== playerIdx) return false;
    var check = this.canPlayCombo(playerIdx, cardIds);
    if (!check.valid) return false;
    var player = this.state.players[playerIdx], self = this;
    cardIds.forEach(function (id, idx) {
      var cIdx = player.hand.findIndex(function (c) { return c.id === id; });
      var card = player.hand.splice(cIdx, 1)[0];
      card.blindModeType = null;
      self.addAtomToReactor(card.symbol, card.name, check.comboCharges[idx], card, card.category === 'HYDROGEN');
    });
    this.state.lastAction = t('¡Combo directo de {n} cartas de {p}!', { n: cardIds.length, p: player.name });
    this.refillHand(playerIdx);
    this.handleSynthesis(playerIdx, true);
    return true;
  };

  GameEngine.prototype.recycleCards = function (playerIdx, cardIds) {
    if (!this.state || this.state.status !== 'PLAYING' || this.state.turn !== playerIdx) return false;
    if (cardIds.length < 1 || cardIds.length > 3) return false;
    var player = this.state.players[playerIdx], self = this;
    cardIds.forEach(function (id) {
      var idx = player.hand.findIndex(function (c) { return c.id === id; });
      if (idx !== -1) self.state.discard.push(player.hand.splice(idx, 1)[0]);
    });
    this.refillHand(playerIdx);
    this.state.lastAction = cardIds.length > 1
      ? t('{p} cambió {n} cartas.', { p: player.name, n: cardIds.length })
      : t('{p} cambió 1 carta.', { p: player.name });
    this.registerNoProgress();
    this.advanceTurn();
    return true;
  };

  GameEngine.prototype.handleSynthesis = function (playerIdx, isCombo) {
    var r = this.state.reactor;
    var points = r.cardsInPile.length;
    var player = this.state.players[playerIdx];
    player.score += points;
    var totalAtoms = r.cation.count + r.anion.count;
    var info = CC.buildCompoundInfo(r.cation, r.anion);

    this.state.lastAction = t('{p} formó {f} ({n}) y gana {k} puntos.', { p: player.name, f: info.key, n: info.systematic, k: points });
    this.state.discard.push.apply(this.state.discard, r.cardsInPile);
    this.state.synthesizedHistory.push({ key: info.key, formulaHTML: info.formulaHTML, name: info.systematic,
                                         playerIdx: playerIdx, playerName: player.name, points: points });
    if (this.onEvent) this.onEvent({ type: 'COMPOUND_SYNTHESIZED', key: info.key, formulaHTML: info.formulaHTML,
                                     name: info.systematic, points: points, playerIdx: playerIdx });

    if (totalAtoms >= 3 || isCombo) {
      var question = CC.generateFlashQuestion(r.cation, r.anion, this.config.level);
      this.state.status = 'QUIZ';
      this.state.quiz = { id: ++this.quizSeq, question: question, ownerIdx: playerIdx, answeringIdx: playerIdx, phase: 'FLASH' };
      this.state.reactor = this.createEmptyReactor();
      this.emitState();
      this.maybeBotAnswer();
    } else {
      this.state.reactor = this.createEmptyReactor();
      if (this.onEvent) this.onEvent({ type: 'SIMPLE_BANNER', formulaHTML: info.formulaHTML, name: info.systematic, points: points });
      this.advanceTurn();
    }
  };

  // El ordenador contesta los retos que le tocan: acierta más cuanto más nivel tiene.
  GameEngine.prototype.maybeBotAnswer = function () {
    var q = this.state.quiz;
    if (this.config.mode !== 'BOT' || !q || q.answeringIdx !== 1) return;
    var self = this, id = q.id, phase = q.phase;
    var hitRate = { APPRENTICE: 0.45, CHEMIST: 0.65, NOBEL: 0.85 }[this.config.botLevel] || 0.65;
    setTimeout(function () {
      if (self.destroyed || !self.state.quiz || self.state.quiz.id !== id || self.state.quiz.phase !== phase) return;
      var opts = self.state.quiz.question.options;
      var correct = opts.findIndex(function (o) { return o.correct; });
      self.resolveQuizAnswer(Math.random() < hitRate ? correct : (correct + 1) % opts.length);
    }, 1600);
  };

  GameEngine.prototype.resolveQuizAnswer = function (optionIndex) {
    if (!this.state || this.state.status !== 'QUIZ' || !this.state.quiz) return;
    var q = this.state.quiz;
    var chosen = optionIndex !== null && optionIndex !== undefined ? q.question.options[optionIndex] : null;

    if (chosen && chosen.correct) {
      var winner = this.state.players[q.answeringIdx];
      winner.score += 3;
      this.state.lastAction = t('{p} acertó el reto y gana 3 puntos.', { p: winner.name });
      if (this.onEvent) this.onEvent({ type: 'QUIZ_SUCCESS', winnerName: winner.name, isRebound: q.phase === 'REBOUND' });
      this.state.quiz = null;
      this.state.status = 'PLAYING';
      this.advanceTurn();
      return;
    }

    if (q.phase === 'FLASH') {
      q.phase = 'REBOUND';
      q.answeringIdx = 1 - q.ownerIdx;
      this.emitState();
      this.maybeBotAnswer();
    } else {
      this.state.lastAction = t('Respuesta correcta: {r}.', { r: q.question.correctText.replace(/<\/?sub>/g, '') });
      if (this.onEvent) this.onEvent({ type: 'QUIZ_FAILED', correctName: q.question.correctText });
      this.state.quiz = null;
      this.state.status = 'PLAYING';
      this.advanceTurn();
    }
  };

  GameEngine.prototype.refillHand = function (playerIdx) {
    var p = this.state.players[playerIdx];
    while (p.hand.length < HAND_SIZE && this.state.deck.length > 0) p.hand.push(this.state.deck.pop());
  };

  GameEngine.prototype.advanceTurn = function () {
    if (this.state.deck.length === 0 && this.state.players.some(function (p) { return p.hand.length === 0; })) {
      this.state.status = 'GAMEOVER';
      this.emitState();
      return;
    }
    this.state.turn = 1 - this.state.turn;
    this.emitState();
    if (this.config.mode === 'BOT' && this.state.turn === 1 && this.state.status === 'PLAYING') {
      var self = this;
      setTimeout(function () { if (!self.destroyed) self.executeBotTurn(); }, 1100);
    }
  };

  // ¿Cerraría el compuesto esta jugada? Se prueba sobre una copia del reactor.
  GameEngine.prototype.wouldClose = function (card, charge) {
    var saved = this.state.reactor;
    this.state.reactor = JSON.parse(JSON.stringify(saved));
    var r = this.state.reactor, closes = false;
    if (card.type === 'ELEMENT') {
      this.addAtomToReactor(card.symbol, card.name, charge, card, card.category === 'HYDROGEN');
      closes = !!(r.cation && r.anion && r.netCharge === 0);
    } else if (card.specialType === 'CATALYST') {
      var last = r.atomHistory[r.atomHistory.length - 1];
      this.addAtomToReactor(last.symbol, last.name, last.charge, card, last.isHydrogen);
      closes = !!(r.cation && r.anion && r.netCharge === 0);
    } else if (card.specialType === 'ISOTOPE') {
      var opt = this.getIsotopeOptions()[0];
      if (opt) {
        this.addAtomToReactor(opt.symbol, opt.name, opt.charge, card, opt.symbol === 'H');
        closes = !!(r.cation && r.anion && r.netCharge === 0);
      }
    }
    this.state.reactor = saved;
    return closes;
  };

  GameEngine.prototype.executeBotTurn = function () {
    if (this.state.status !== 'PLAYING' || this.state.turn !== 1) return;
    var hand = this.state.players[1].hand;
    var r = this.state.reactor, self = this;

    // El Premio Nobel busca un combo directo (de 2 a 5 cartas) si el reactor está vacío.
    if (this.config.botLevel === 'NOBEL' && r.status === 'EMPTY' && hand.length >= 2) {
      var best = null;
      for (var mask = 1; mask < (1 << hand.length); mask++) {
        var ids = [];
        for (var b = 0; b < hand.length; b++) if (mask & (1 << b)) ids.push(hand[b].id);
        if (ids.length < 2) continue;
        if ((!best || ids.length > best.length) && this.canPlayCombo(1, ids).valid) best = ids;
      }
      if (best) { this.playCombo(1, best); return; }
    }

    var moves = [];
    hand.forEach(function (card) {
      if (card.type === 'ELEMENT') {
        card.valences.forEach(function (ch) {
          if (self.canPlayElement(card, ch).valid) moves.push({ card: card, charge: ch });
        });
      } else {
        var check = self.canPlayCard(card);
        if (check.valid) moves.push({ card: card, charge: null, iso: check.isotopeOptions && check.isotopeOptions[0] && check.isotopeOptions[0].symbol });
      }
    });

    if (moves.length === 0) {
      this.recycleCards(1, hand.slice(0, Math.min(3, hand.length)).map(function (c) { return c.id; }));
      return;
    }

    CC.shuffle(moves);
    var selected = moves[0];
    if (this.config.botLevel !== 'APPRENTICE' && r.status === 'ACTIVE') {
      var closing = moves.find(function (m) { return m.card.specialType !== 'ELECTROLYSIS' && self.wouldClose(m.card, m.charge); });
      if (closing) selected = closing;
      else if (this.config.botLevel === 'NOBEL' && r.cardsInPile.length >= 3) {
        var electro = moves.find(function (m) { return m.card.specialType === 'ELECTROLYSIS'; });
        if (electro) selected = electro;
      }
    } else if (this.config.botLevel !== 'APPRENTICE') {
      // Con el reactor vacío no empieza con cartas especiales si puede evitarlo.
      var element = moves.find(function (m) { return m.card.type === 'ELEMENT'; });
      if (element) selected = element;
    }
    this.playCard(1, selected.card.id, selected.charge, selected.iso);
  };

  GameEngine.prototype.cartesianProduct = function (arrays) {
    return arrays.reduce(function (acc, curr) {
      var res = [];
      acc.forEach(function (a) { curr.forEach(function (b) { res.push(a.concat([b])); }); });
      return res;
    }, [[]]);
  };

  GameEngine.prototype.emitState = function () {
    if (this.onStateChange && !this.destroyed) this.onStateChange(this.state);
  };

  CC.GameEngine = GameEngine;
})();
