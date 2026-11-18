// Motor del juego: baraja, reglas del reactor, combos, retos y jugador automático.
// No toca la página. Cada cosa que pasa se avisa con onEvent({ type, ..., snapshot }),
// donde snapshot es una copia del estado justo después de ese paso: la interfaz los
// anima en orden, uno detrás de otro, y el motor espera a que acabe (waitIdle) antes de
// que juegue el ordenador.
//
// Reactor: lista de átomos. Cada elemento lleva TODOS sus números de oxidación posibles
// (Fe +2/+3, Cu +1/+2, H +1/−1). El compuesto se cierra solo en cuanto alguna
// combinación de números de oxidación da carga neta cero con la fórmula simplificada.
window.CC = window.CC || {};

(function () {
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  function t(s, v) { return window.i18n ? window.i18n.t(s, v) : s; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var HAND_SIZE = 5;
  var STAGNATION_LIMIT = 3;

  // Máximo de átomos de un elemento que puede llegar a tener un compuesto de la baraja
  // (O: 3 en Al2O3; H: 3 en AlH3; Ca: 1…). Sirve para no dejar crecer un reactor imposible.
  var MAX_COUNT = {};
  function maxCount(symbol) {
    if (MAX_COUNT[symbol]) return MAX_COUNT[symbol];
    var mine = CC.ELEMENTS[symbol].numbers, best = 1;
    Object.keys(CC.ELEMENTS).forEach(function (other) {
      if (other === symbol) return;
      CC.ELEMENTS[other].numbers.forEach(function (co) {
        mine.forEach(function (c) {
          if (c * co >= 0) return;
          best = Math.max(best, Math.abs(co) / gcd(Math.abs(c), Math.abs(co)));
        });
      });
    });
    return (MAX_COUNT[symbol] = best);
  }

  // Analiza una lista de átomos [{symbol, numbers}].
  // valid: todavía puede acabar en un compuesto; closed: ya es un compuesto neutro.
  function analyze(atoms) {
    var groups = {}, order = [];
    atoms.forEach(function (a) {
      if (!groups[a.symbol]) { groups[a.symbol] = { symbol: a.symbol, count: 0, numbers: a.numbers.slice() }; order.push(a.symbol); }
      groups[a.symbol].count += 1;
    });
    var res = { valid: true, closed: false, groups: order.map(function (s) { return groups[s]; }), netOptions: [], assignment: null };
    if (order.length === 0) { res.netOptions = [0]; return res; }
    if (order.length > 2) { res.valid = false; res.reason = t('Solo compuestos binarios: dos elementos.'); return res; }
    if (order.length === 1) {
      var g = groups[order[0]];
      if (g.count > maxCount(g.symbol)) { res.valid = false; res.reason = t('Ya hay demasiados átomos de {s}.', { s: g.symbol }); return res; }
      g.numbers.forEach(function (n) { if (res.netOptions.indexOf(n * g.count) === -1) res.netOptions.push(n * g.count); });
      return res;
    }
    var A = groups[order[0]], B = groups[order[1]], feasible = [];
    A.numbers.forEach(function (a) {
      B.numbers.forEach(function (b) {
        if (a * b >= 0) return;
        var d = gcd(Math.abs(a), Math.abs(b));
        var nA = Math.abs(b) / d, nB = Math.abs(a) / d;
        if (A.count <= nA && B.count <= nB) feasible.push({ a: a, b: b, closed: A.count === nA && B.count === nB });
      });
    });
    if (!feasible.length) {
      var sameSign = A.numbers.every(function (a) { return B.numbers.every(function (b) { return a * b > 0; }); });
      res.valid = false;
      res.reason = sameSign ? t('{a} y {b} tienen el mismo signo: no pueden formar un compuesto.', { a: A.symbol, b: B.symbol })
                            : t('Sobra un átomo: la fórmula no se puede simplificar así.');
      return res;
    }
    feasible.forEach(function (f) {
      var net = f.a * A.count + f.b * B.count;
      if (res.netOptions.indexOf(net) === -1) res.netOptions.push(net);
    });
    var close = feasible.find(function (f) { return f.closed; });
    if (close) {
      res.closed = true;
      var cat = close.a > 0 ? { symbol: A.symbol, charge: close.a, count: A.count } : { symbol: B.symbol, charge: close.b, count: B.count };
      var ani = close.a > 0 ? { symbol: B.symbol, charge: close.b, count: B.count } : { symbol: A.symbol, charge: close.a, count: A.count };
      res.assignment = { cation: cat, anion: ani };
      res.netOptions = [0];
    }
    return res;
  }

  function GameEngine(config, onEvent) {
    this.config = {
      level: config.level || 'BASIC',
      blindMode: !!config.blindMode,
      mode: config.mode || 'BOT',
      botLevel: config.botLevel || 'CHEMIST'
    };
    this.onEvent = onEvent;
    // Con semilla (modo en línea) los dos dispositivos reparten exactamente igual.
    if (config.seed) CC.seed(config.seed); else CC.rand = Math.random;
    this.state = null;
    this.destroyed = false;
    this.quizSeq = 0;
    this.waitIdle = function (cb) { cb(); };
  }

  GameEngine.analyze = analyze;
  GameEngine.prototype.destroy = function () { this.destroyed = true; };

  GameEngine.prototype.emit = function (type, data) {
    if (this.destroyed || !this.onEvent) return;
    var ev = data || {};
    ev.type = type;
    ev.snapshot = clone(this.state);
    this.onEvent(ev);
  };

  // Espera a que la interfaz termine de animar y luego otro rato (para el ordenador).
  GameEngine.prototype.later = function (ms, fn) {
    var self = this;
    this.waitIdle(function () { setTimeout(function () { if (!self.destroyed) fn(); }, ms); });
  };

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
      reactor: this.emptyReactor(),
      quiz: null,
      synthesizedHistory: [],
      lastAction: t('Empieza {n}.', { n: playerNames[0] })
    };
    this.emit('START');
  };

  GameEngine.prototype.emptyReactor = function () {
    return { status: 'EMPTY', atoms: [], cards: [], stagnation: 0, view: analyze([]) };
  };

  GameEngine.prototype.buildDeck = function () {
    var deck = [], uid = 1, self = this;
    Object.keys(CC.ELEMENTS).forEach(function (key) {
      var el = CC.ELEMENTS[key], cards = [];
      for (var i = 0; i < el.count; i++) {
        cards.push({ id: 'c' + (uid++), type: 'ELEMENT', symbol: el.symbol, name: el.name,
                     category: el.category, numbers: el.numbers.slice(), blind: null });
      }
      if (self.config.blindMode && cards.length >= 2) {
        var idx = CC.shuffle(cards.map(function (_, k) { return k; }));
        cards[idx[0]].blind = 'SYMBOL';
        cards[idx[1]].blind = 'NAME';
      }
      deck.push.apply(deck, cards);
    });
    CC.SPECIAL_CARDS.forEach(function (sp) {
      for (var i = 0; i < sp.count; i++) {
        deck.push({ id: 'c' + (uid++), type: 'SPECIAL', specialType: sp.specialType, symbol: sp.symbol,
                    name: sp.name, desc: sp.desc, category: 'SPECIAL', numbers: [], blind: null });
      }
    });
    return CC.shuffle(deck);
  };

  // Átomo que añadiría una carta (null si es Electrólisis o no hay nada que copiar).
  GameEngine.prototype.atomFor = function (card, isoSymbol) {
    var r = this.state.reactor;
    if (card.type === 'ELEMENT') return { symbol: card.symbol, numbers: card.numbers.slice(), cardId: card.id };
    if (card.specialType === 'CATALYST') {
      var last = r.atoms[r.atoms.length - 1];
      return last ? { symbol: last.symbol, numbers: last.numbers.slice(), cardId: card.id, copy: true } : null;
    }
    if (card.specialType === 'ISOTOPE') {
      var opts = this.isotopeOptions();
      var sym = opts.indexOf(isoSymbol) !== -1 ? isoSymbol : opts[0];
      if (!sym) return null;
      var src = r.atoms.find(function (a) { return a.symbol === sym; });
      return { symbol: sym, numbers: src.numbers.slice(), cardId: card.id, copy: true };
    }
    return null;
  };

  GameEngine.prototype.isotopeOptions = function () {
    var r = this.state.reactor, seen = [], self = this;
    r.atoms.forEach(function (a) {
      if (seen.indexOf(a.symbol) !== -1) return;
      if (analyze(r.atoms.concat([{ symbol: a.symbol, numbers: a.numbers }])).valid) seen.push(a.symbol);
    });
    return seen;
  };

  GameEngine.prototype.canPlayCard = function (card) {
    var r = this.state.reactor;
    if (card.type === 'SPECIAL') {
      if (r.status === 'EMPTY') return { valid: false, reason: t('El reactor está vacío.') };
      if (card.specialType === 'ELECTROLYSIS') return { valid: true };
      if (card.specialType === 'ISOTOPE') {
        var opts = this.isotopeOptions();
        return opts.length ? { valid: true, isotopeOptions: opts } : { valid: false, reason: t('Ningún elemento del reactor admite más átomos.') };
      }
    }
    var atom = this.atomFor(card);
    if (!atom) return { valid: false, reason: t('No hay ningún átomo que repetir.') };
    var a = analyze(r.atoms.concat([atom]));
    return a.valid ? { valid: true, closes: a.closed } : { valid: false, reason: a.reason };
  };

  GameEngine.prototype.takeCard = function (playerIdx, cardId) {
    var hand = this.state.players[playerIdx].hand;
    var i = hand.findIndex(function (c) { return c.id === cardId; });
    if (i === -1) return null;
    var card = hand.splice(i, 1)[0];
    card.blind = null;
    return card;
  };

  GameEngine.prototype.playCard = function (playerIdx, cardId, isoSymbol) {
    var st = this.state;
    if (!st || st.status !== 'PLAYING' || st.turn !== playerIdx) return false;
    var card = st.players[playerIdx].hand.find(function (c) { return c.id === cardId; });
    if (!card || !this.canPlayCard(card).valid) return false;
    var player = st.players[playerIdx], r = st.reactor;
    this.takeCard(playerIdx, cardId);

    if (card.specialType === 'ELECTROLYSIS') {
      var removedAtom = r.atoms.pop();
      var removedCard = r.cards.pop();
      st.discard.push(card);
      if (removedCard) st.discard.push(removedCard);
      if (!r.atoms.length) st.reactor = this.emptyReactor();
      else r.view = analyze(r.atoms);
      st.lastAction = t('{p} usó Electrólisis y quitó {s}.', { p: player.name, s: removedAtom ? removedAtom.symbol : '' });
      this.refillHand(playerIdx);
      this.emit('ELECTROLYSIS', { playerIdx: playerIdx, card: card, removed: removedCard, removedSymbol: removedAtom && removedAtom.symbol });
      this.registerNoProgress();
      this.advanceTurn();
      return true;
    }

    var atom = this.atomFor(card, isoSymbol);
    r.status = 'ACTIVE';
    r.atoms.push(atom);
    r.cards.push(card);
    r.stagnation = 0;
    r.view = analyze(r.atoms);
    st.lastAction = card.type === 'SPECIAL'
      ? t('{p} usó {c} como {s}.', { p: player.name, c: card.name, s: atom.symbol })
      : t('{p} jugó {n}.', { p: player.name, n: card.name });
    this.emit('PLAY', { playerIdx: playerIdx, card: card, atomSymbol: atom.symbol });
    this.refillHand(playerIdx);

    if (r.view.closed) this.handleSynthesis(playerIdx, false);
    else this.advanceTurn();
    return true;
  };

  GameEngine.prototype.registerNoProgress = function () {
    var r = this.state.reactor;
    if (r.status !== 'ACTIVE') return;
    r.stagnation += 1;
    if (r.stagnation >= STAGNATION_LIMIT) {
      var lost = r.cards.slice();
      this.state.discard.push.apply(this.state.discard, lost);
      this.state.reactor = this.emptyReactor();
      this.state.lastAction = t('El compuesto a medias se descompuso tras 3 turnos sin avanzar.');
      this.emit('DECOMPOSED', { cards: lost });
    }
  };

  GameEngine.prototype.comboCheck = function (playerIdx, cardIds) {
    if (this.state.reactor.status !== 'EMPTY' || cardIds.length < 2 || cardIds.length > 5) return { valid: false };
    var hand = this.state.players[playerIdx].hand;
    var cards = cardIds.map(function (id) { return hand.find(function (c) { return c.id === id; }); });
    if (cards.some(function (c) { return !c || c.type !== 'ELEMENT'; })) return { valid: false };
    var a = analyze(cards.map(function (c) { return { symbol: c.symbol, numbers: c.numbers }; }));
    return { valid: a.closed };
  };

  GameEngine.prototype.playCombo = function (playerIdx, cardIds) {
    var st = this.state;
    if (!st || st.status !== 'PLAYING' || st.turn !== playerIdx || !this.comboCheck(playerIdx, cardIds).valid) return false;
    var self = this, r = st.reactor, played = [];
    cardIds.forEach(function (id) {
      var card = self.takeCard(playerIdx, id);
      played.push(card);
      r.atoms.push({ symbol: card.symbol, numbers: card.numbers.slice(), cardId: card.id });
      r.cards.push(card);
    });
    r.status = 'ACTIVE';
    r.view = analyze(r.atoms);
    st.lastAction = t('¡Combo directo de {p} con {n} cartas!', { p: st.players[playerIdx].name, n: played.length });
    this.emit('COMBO', { playerIdx: playerIdx, cards: played });
    this.refillHand(playerIdx);
    this.handleSynthesis(playerIdx, true);
    return true;
  };

  GameEngine.prototype.recycleCards = function (playerIdx, cardIds) {
    var st = this.state;
    if (!st || st.status !== 'PLAYING' || st.turn !== playerIdx || cardIds.length < 1 || cardIds.length > 3) return false;
    var self = this, gone = [];
    cardIds.forEach(function (id) { var c = self.takeCard(playerIdx, id); if (c) { gone.push(c); st.discard.push(c); } });
    this.refillHand(playerIdx);
    st.lastAction = gone.length > 1 ? t('{p} cambió {n} cartas.', { p: st.players[playerIdx].name, n: gone.length })
                                    : t('{p} cambió 1 carta.', { p: st.players[playerIdx].name });
    this.emit('RECYCLE', { playerIdx: playerIdx, cards: gone });
    this.registerNoProgress();
    this.advanceTurn();
    return true;
  };

  GameEngine.prototype.handleSynthesis = function (playerIdx, isCombo) {
    var st = this.state, r = st.reactor;
    var points = r.cards.length;
    var player = st.players[playerIdx];
    var as = r.view.assignment;
    var info = CC.buildCompoundInfo(as.cation, as.anion);
    var totalAtoms = as.cation.count + as.anion.count;
    var cards = r.cards.slice();

    player.score += points;
    st.discard.push.apply(st.discard, cards);
    st.synthesizedHistory.push({ key: info.key, formulaHTML: info.formulaHTML, name: info.systematic,
                                 playerIdx: playerIdx, playerName: player.name, points: points });
    st.lastAction = t('{p} formó {f} y gana {k} puntos.', { p: player.name, f: info.key, k: points });
    st.reactor = this.emptyReactor();

    var quiz = totalAtoms >= 3 || isCombo;
    this.emit('SYNTHESIS', { playerIdx: playerIdx, key: info.key, formulaHTML: info.formulaHTML, name: info.systematic,
                             points: points, cards: cards, cation: as.cation, anion: as.anion, quizNext: quiz });

    if (quiz) {
      st.status = 'QUIZ';
      st.quiz = { id: ++this.quizSeq, question: CC.generateFlashQuestion(as.cation, as.anion, this.config.level),
                  ownerIdx: playerIdx, answeringIdx: playerIdx, phase: 'FLASH' };
      this.emit('QUIZ');
      this.maybeBotAnswer();
    } else {
      this.advanceTurn();
    }
  };

  GameEngine.prototype.maybeBotAnswer = function () {
    var q = this.state.quiz;
    if (this.config.mode !== 'BOT' || !q || q.answeringIdx !== 1) return;
    var self = this, id = q.id, phase = q.phase;
    var hit = { APPRENTICE: 0.45, CHEMIST: 0.65, NOBEL: 0.85 }[this.config.botLevel] || 0.65;
    this.later(1800, function () {
      if (!self.state.quiz || self.state.quiz.id !== id || self.state.quiz.phase !== phase) return;
      var opts = self.state.quiz.question.options;
      var ok = opts.findIndex(function (o) { return o.correct; });
      self.resolveQuizAnswer(Math.random() < hit ? ok : (ok + 1) % opts.length);
    });
  };

  GameEngine.prototype.resolveQuizAnswer = function (optionIndex) {
    var st = this.state;
    if (!st || st.status !== 'QUIZ' || !st.quiz) return;
    var q = st.quiz;
    var chosen = optionIndex !== null && optionIndex !== undefined ? q.question.options[optionIndex] : null;
    if (chosen && chosen.correct) {
      var w = st.players[q.answeringIdx];
      w.score += 3;
      st.lastAction = t('{p} acertó el reto y gana 3 puntos.', { p: w.name });
      st.quiz = null; st.status = 'PLAYING';
      this.emit('QUIZ_RESULT', { ok: true, chosen: optionIndex, winnerIdx: q.answeringIdx, rebound: q.phase === 'REBOUND', question: q.question });
      this.advanceTurn();
      return;
    }
    if (q.phase === 'FLASH') {
      var failedIdx = q.answeringIdx;
      q.phase = 'REBOUND';
      q.answeringIdx = 1 - q.ownerIdx;
      this.emit('QUIZ_RESULT', { ok: false, chosen: optionIndex, loserIdx: failedIdx, rebound: false, toRebound: true, question: q.question });
      this.emit('QUIZ');
      this.maybeBotAnswer();
    } else {
      st.lastAction = t('Nadie acertó. Era: {r}.', { r: q.question.correctText.replace(/<\/?sub>/g, '') });
      st.quiz = null; st.status = 'PLAYING';
      this.emit('QUIZ_RESULT', { ok: false, chosen: optionIndex, loserIdx: q.answeringIdx, rebound: true, question: q.question });
      this.advanceTurn();
    }
  };

  GameEngine.prototype.refillHand = function (playerIdx) {
    var p = this.state.players[playerIdx];
    while (p.hand.length < HAND_SIZE && this.state.deck.length > 0) p.hand.push(this.state.deck.pop());
  };

  GameEngine.prototype.advanceTurn = function () {
    var st = this.state;
    if (st.deck.length === 0 && st.players.some(function (p) { return p.hand.length === 0; })) {
      st.status = 'GAMEOVER';
      this.emit('GAMEOVER');
      return;
    }
    st.turn = 1 - st.turn;
    this.emit('TURN', { turn: st.turn });
    if (this.config.mode === 'BOT' && st.turn === 1 && st.status === 'PLAYING') {
      var self = this;
      this.later(1300, function () { self.executeBotTurn(); });
    }
  };

  // ¿Cerraría el compuesto esta carta?
  GameEngine.prototype.wouldClose = function (card) {
    var atom = this.atomFor(card);
    return !!atom && analyze(this.state.reactor.atoms.concat([atom])).closed;
  };

  GameEngine.prototype.executeBotTurn = function () {
    var st = this.state;
    if (st.status !== 'PLAYING' || st.turn !== 1) return;
    var hand = st.players[1].hand, r = st.reactor, self = this;

    if (this.config.botLevel === 'NOBEL' && r.status === 'EMPTY' && hand.length >= 2) {
      var best = null;
      for (var mask = 1; mask < (1 << hand.length); mask++) {
        var ids = [];
        for (var b = 0; b < hand.length; b++) if (mask & (1 << b)) ids.push(hand[b].id);
        if (ids.length >= 2 && (!best || ids.length > best.length) && this.comboCheck(1, ids).valid) best = ids;
      }
      if (best) { this.playCombo(1, best); return; }
    }

    var moves = hand.filter(function (c) { return self.canPlayCard(c).valid; });
    if (!moves.length) {
      this.recycleCards(1, hand.slice(0, Math.min(3, hand.length)).map(function (c) { return c.id; }));
      return;
    }
    CC.shuffle(moves);
    var pick = moves[0];
    if (this.config.botLevel !== 'APPRENTICE') {
      var closing = moves.find(function (c) { return c.specialType !== 'ELECTROLYSIS' && self.wouldClose(c); });
      var element = moves.find(function (c) { return c.type === 'ELEMENT'; });
      if (closing) pick = closing;
      else if (this.config.botLevel === 'NOBEL' && r.cards.length >= 3 && moves.some(function (c) { return c.specialType === 'ELECTROLYSIS'; })) {
        pick = moves.find(function (c) { return c.specialType === 'ELECTROLYSIS'; });
      } else if (element) pick = element;
    }
    this.playCard(1, pick.id);
  };

  CC.GameEngine = GameEngine;
})();
