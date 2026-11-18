// Interfaz del juego: configuración, tablero, ventanas, sonido, temas y teclado.
window.CC = window.CC || {};

(function () {
  function t(s, v) { return window.i18n ? window.i18n.t(s, v) : s; }
  function num(n, d) { return window.i18n ? window.i18n.num(n, d) : Number(n).toFixed(d); }
  function $(id) { return document.getElementById(id); }

  // Texto que llega de la partida (o del otro dispositivo) y se pinta como HTML:
  // se escapa todo y solo se permiten los subíndices de las fórmulas.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formula(s) { return esc(s).replace(/&lt;(\/?)sub&gt;/g, '<$1sub>'); }
  function signed(n) { return n > 0 ? '+' + n : (n < 0 ? '−' + Math.abs(n) : '0'); }

  var STORAGE_CODEX = 'sim-carga-cero-cuaderno';
  var TOTAL = CC.COMPOUND_CATALOG.length;
  var ALLOWED = {
    level: ['BASIC', 'ADVANCED'], mode: ['BOT', 'LOCAL', 'P2P'],
    botLevel: ['APPRENTICE', 'CHEMIST', 'NOBEL'], quizTime: [6, 12, 0]
  };
  var BOT_NAMES = { APPRENTICE: 'Aprendiz', CHEMIST: 'Químico', NOBEL: 'Nobel' };

  // ── Sonidos (sintetizados, sin archivos) ─────────────
  function SoundFX() { this.enabled = true; this.ctx = null; }
  SoundFX.prototype.tone = function (freq, dur, type, gain, delay) {
    if (!this.enabled) return;
    if (!this.ctx) {
      var A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      this.ctx = new A();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    var now = this.ctx.currentTime + (delay || 0);
    var osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(gain || 0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + dur);
  };
  SoundFX.prototype.card = function () { this.tone(420, 0.08, 'triangle', 0.14); };
  SoundFX.prototype.synthesis = function () { this.tone(523.25, 0.14, 'sine', 0.15, 0); this.tone(659.25, 0.14, 'sine', 0.15, 0.09); this.tone(783.99, 0.24, 'sine', 0.16, 0.18); };
  SoundFX.prototype.zap = function () { this.tone(240, 0.18, 'sawtooth', 0.11, 0); this.tone(150, 0.22, 'sawtooth', 0.11, 0.08); };
  SoundFX.prototype.success = function () { this.tone(587.33, 0.12, 'triangle', 0.16, 0); this.tone(880, 0.2, 'triangle', 0.16, 0.1); };

  // ── Interfaz ─────────────────────────────────────────
  function UI() {
    this.config = { level: 'BASIC', blindMode: false, mode: 'BOT', botLevel: 'CHEMIST', quizTime: 6 };
    this.selected = new Set();
    this.quizInterval = null;
    this.shownQuiz = null;
    this.localPlayerIndex = 0;
    this.lastObservedTurn = 0;
    this.curtain = false;
    this.unlocked = this.loadCodex();
    this.sfx = new SoundFX();
    this.engine = null;
    this.lastFocus = null;
    var self = this;
    this.network = new CC.NetworkManager(
      function (msg, isError, code) { self.p2pStatus(msg, isError, code); },
      function (data) { self.onNetworkData(data); }
    );
    $('codex-total').textContent = TOTAL;
    $('codex-modal-total').textContent = TOTAL;
    this.bindMenu();
    this.bindKeyboard();
    this.setupThemeSelector();
    this.updateCodexCounter();
    this.updateBodyClasses();
  }

  UI.prototype.announce = function (text) {
    var el = $('anuncio');
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 30);
  };

  // ── Cuaderno ─────────────────────────────────────────
  UI.prototype.loadCodex = function () {
    try { var raw = localStorage.getItem(STORAGE_CODEX); return raw ? new Set(JSON.parse(raw)) : new Set(); }
    catch (e) { return new Set(); }
  };
  UI.prototype.unlockCompound = function (key) {
    if (this.unlocked.has(key)) return;
    this.unlocked.add(key);
    try { localStorage.setItem(STORAGE_CODEX, JSON.stringify(Array.from(this.unlocked))); } catch (e) { /* modo privado */ }
    this.updateCodexCounter();
  };
  UI.prototype.codexCount = function () {
    var self = this;
    return CC.COMPOUND_CATALOG.filter(function (c) { return self.unlocked.has(c.key); }).length;
  };
  UI.prototype.updateCodexCounter = function () {
    var n = this.codexCount();
    $('codex-counter').textContent = n;
    $('codex-modal-count').textContent = n;
  };
  UI.prototype.renderCodex = function () {
    var grid = $('codex-grid'), self = this;
    var groups = [[t('Óxidos'), 0], [t('Cloruros'), 9], [t('Sulfuros'), 18], [t('Compuestos con hidrógeno'), 27]];
    grid.innerHTML = '';
    CC.COMPOUND_CATALOG.forEach(function (item, i) {
      groups.forEach(function (g) {
        if (g[1] === i) { var h = document.createElement('h2'); h.className = 'codex-group'; h.textContent = g[0]; grid.appendChild(h); }
      });
      var on = self.unlocked.has(item.key);
      var div = document.createElement('div');
      div.className = 'codex-item ' + (on ? 'unlocked' : 'locked');
      div.innerHTML = on
        ? '<div class="codex-formula">' + esc(item.key).replace(/(\d+)/g, '<sub>$1</sub>') + '</div>' +
          '<div class="codex-name">' + esc(t(item.name)) + '</div><div class="codex-fact">' + esc(t(item.fact)) + '</div>'
        : '<div class="codex-formula">?</div><div class="codex-name">' + esc(t('Sin descubrir')) + '</div>' +
          '<div class="codex-fact">' + esc(t('Forma este compuesto en una partida para ver su ficha.')) + '</div>';
      grid.appendChild(div);
    });
  };

  // ── Ventanas ─────────────────────────────────────────
  UI.prototype.openModal = function (id, focusSel) {
    var m = $(id);
    if (m.hidden) this.lastFocus = document.activeElement;
    m.hidden = false;
    var f = focusSel ? m.querySelector(focusSel) : m.querySelector('button:not(:disabled)');
    if (f) f.focus();
  };
  UI.prototype.closeModal = function (id) {
    var m = $(id);
    if (m.hidden) return;
    m.hidden = true;
    if (this.lastFocus && document.body.contains(this.lastFocus)) this.lastFocus.focus();
  };

  // ── Configuración ────────────────────────────────────
  UI.prototype.setupRadioGroup = function (id, onChange) {
    var box = $(id);
    var buttons = box.querySelectorAll('button');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
        btn.classList.add('active'); btn.setAttribute('aria-checked', 'true');
        onChange(btn.dataset.val);
      });
    });
  };

  UI.prototype.updateBodyClasses = function () {
    document.body.classList.toggle('rival-bot', this.config.mode === 'BOT');
    document.body.classList.toggle('rival-p2p', this.config.mode === 'P2P');
    $('btn-start-game').hidden = this.config.mode === 'P2P';
  };

  UI.prototype.bindMenu = function () {
    var self = this;
    this.setupRadioGroup('select-level', function (v) { self.config.level = v; });
    this.setupRadioGroup('select-bot-level', function (v) { self.config.botLevel = v; });
    this.setupRadioGroup('select-time', function (v) { self.config.quizTime = parseInt(v, 10); });
    this.setupRadioGroup('select-mode', function (v) { self.config.mode = v; self.updateBodyClasses(); });
    $('check-blind').addEventListener('change', function (e) { self.config.blindMode = e.target.checked; });

    $('btn-toggle-sound').addEventListener('click', function (e) {
      self.sfx.enabled = !self.sfx.enabled;
      var b = e.currentTarget;
      b.setAttribute('aria-pressed', String(self.sfx.enabled));
      b.textContent = self.sfx.enabled ? t('🔊 Sonido') : t('🔇 Sin sonido');
      if (self.sfx.enabled) self.sfx.card();
    });

    $('btn-start-game').addEventListener('click', function () {
      self.localPlayerIndex = 0;
      var names = self.config.mode === 'BOT'
        ? [t('Estudiante'), t('Ordenador ({n})', { n: t(BOT_NAMES[self.config.botLevel]) })]
        : [t('Jugador 1'), t('Jugador 2')];
      self.startMatch(names);
    });

    $('btn-reveal-local-hand').addEventListener('click', function () {
      self.curtain = false;
      self.renderState(self.engine.state);
      var first = document.querySelector('#player-hand .card-play');
      if (first) first.focus();
    });

    $('btn-create-room').addEventListener('click', function () {
      self.network.createRoom(function () {
        self.localPlayerIndex = 0;
        self.startMatch([t('Anfitrión'), t('Invitado')]);
        self.network.send({ type: 'SYNC_INIT', config: self.config, state: self.engine.state });
      });
    });
    $('btn-join-room').addEventListener('click', function () {
      self.network.joinRoom($('input-room-code').value, function () { self.localPlayerIndex = 1; });
    });
    $('input-room-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-join-room').click(); });

    $('btn-recycle').addEventListener('click', function () {
      var idx = self.interactiveIdx(), ids = Array.from(self.selected);
      if (ids.length === 0 || ids.length > 3) return;
      self.sfx.card();
      self.selected.clear();
      if (self.config.mode === 'P2P' && !self.network.isHost) self.network.send({ type: 'ACTION_RECYCLE', playerIdx: idx, cardIds: ids });
      else self.engine.recycleCards(idx, ids);
    });
    $('btn-play-combo').addEventListener('click', function () {
      var idx = self.interactiveIdx(), ids = Array.from(self.selected);
      self.selected.clear();
      if (self.config.mode === 'P2P' && !self.network.isHost) self.network.send({ type: 'ACTION_COMBO', playerIdx: idx, cardIds: ids });
      else self.engine.playCombo(idx, ids);
    });

    $('btn-open-codex').addEventListener('click', function () { self.renderCodex(); self.openModal('modal-codex', '#btn-close-codex'); });
    $('btn-close-codex').addEventListener('click', function () { self.closeModal('modal-codex'); });
    $('btn-cancel-valence').addEventListener('click', function () { self.closeModal('modal-valence'); });
    $('btn-copy-report').addEventListener('click', function () { self.copyReport(); });
    $('btn-exit-match').addEventListener('click', function () { self.returnToMenu(); });
    $('btn-play-again').addEventListener('click', function () { self.returnToMenu(); });
  };

  UI.prototype.bindKeyboard = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('modal-codex').hidden) { self.closeModal('modal-codex'); return; }
        if (!$('modal-valence').hidden) { self.closeModal('modal-valence'); return; }
      }
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!self.engine || !self.engine.state) return;
      var n = parseInt(e.key, 10);
      var st = self.engine.state;
      if (st.status === 'QUIZ' && n >= 1 && n <= 3) {
        var b = document.querySelectorAll('#quiz-options button')[n - 1];
        if (b && !b.disabled) b.click();
        return;
      }
      if (!$('modal-valence').hidden || !$('modal-codex').hidden) return;
      if (st.status === 'PLAYING' && !self.curtain && n >= 1 && n <= 5) {
        var idx = self.interactiveIdx();
        if (st.turn !== idx) return;
        var card = st.players[idx].hand[n - 1];
        if (card) self.onCardClick(card, self.engine.canPlayCard(card));
      }
    });
  };

  UI.prototype.p2pStatus = function (msg, isError, code) {
    var el = $('p2p-status');
    el.textContent = msg;
    el.classList.toggle('p2p-status-error', !!isError);
    var c = $('p2p-code');
    if (code) { c.textContent = code; c.hidden = false; } else if (isError) { c.hidden = true; }
    if (this.engine && isError && document.body.classList.contains('pantalla-juego')) this.showBanner(esc(msg), true);
  };

  // ── Partida ──────────────────────────────────────────
  UI.prototype.startMatch = function (names) {
    var self = this;
    this.selected.clear();
    this.lastObservedTurn = 0;
    this.curtain = false;
    this.shownQuiz = null;
    $('last-synthesis-chip').hidden = true;
    document.body.classList.remove('pantalla-menu');
    document.body.classList.add('pantalla-juego');
    if (this.engine) this.engine.destroy();

    this.engine = new CC.GameEngine(this.config,
      function (state) {
        if (self.config.mode === 'LOCAL' && state.turn !== self.lastObservedTurn && state.status === 'PLAYING') self.curtain = true;
        self.lastObservedTurn = state.turn;
        self.renderState(state);
        if (self.config.mode === 'P2P' && self.network.isHost) self.network.send({ type: 'SYNC_STATE', state: state });
      },
      function (event) {
        self.onEngineEvent(event);
        if (self.config.mode === 'P2P' && self.network.isHost) self.network.send({ type: 'SYNC_EVENT', event: event });
      });

    if (this.config.mode !== 'P2P' || this.network.isHost) this.engine.initGame(names);
    $('btn-exit-match').focus();
  };

  UI.prototype.sanitizeConfig = function (c) {
    var out = {};
    Object.keys(ALLOWED).forEach(function (k) { out[k] = ALLOWED[k].indexOf(c && c[k]) !== -1 ? c[k] : ALLOWED[k][0]; });
    out.blindMode = !!(c && c.blindMode);
    out.mode = 'P2P';
    return out;
  };

  UI.prototype.onNetworkData = function (data) {
    var e = this.engine;
    if (data.type === 'SYNC_INIT' && !this.network.isHost) {
      this.config = this.sanitizeConfig(data.config);
      this.startMatch([t('Anfitrión'), t('Invitado')]);
      this.engine.state = data.state;
      this.renderState(data.state);
    } else if (data.type === 'SYNC_STATE' && !this.network.isHost && e) {
      e.state = data.state;
      this.renderState(data.state);
    } else if (data.type === 'SYNC_EVENT' && !this.network.isHost && e) {
      this.onEngineEvent(data.event || {});
    } else if (this.network.isHost && e) {
      // El anfitrión solo acepta jugadas del invitado (jugador 2).
      if (data.type === 'ACTION_PLAY') e.playCard(1, data.cardId, data.chosenCharge, data.isoSymbol);
      else if (data.type === 'ACTION_RECYCLE' && Array.isArray(data.cardIds)) e.recycleCards(1, data.cardIds);
      else if (data.type === 'ACTION_COMBO' && Array.isArray(data.cardIds)) e.playCombo(1, data.cardIds);
      else if (data.type === 'ACTION_QUIZ' && e.state.quiz && e.state.quiz.answeringIdx === 1) e.resolveQuizAnswer(data.optionIndex);
    }
  };

  UI.prototype.returnToMenu = function () {
    clearInterval(this.quizInterval);
    if (this.engine) this.engine.destroy();
    this.engine = null;
    this.network.destroy();
    $('p2p-code').hidden = true;
    ['modal-quiz', 'modal-gameover', 'modal-valence'].forEach(function (id) { $(id).hidden = true; });
    document.body.classList.remove('pantalla-juego');
    document.body.classList.add('pantalla-menu');
    $('btn-start-game').focus();
  };

  UI.prototype.interactiveIdx = function () {
    return this.config.mode === 'LOCAL' ? this.engine.state.turn : this.localPlayerIndex;
  };

  UI.prototype.renderState = function (state) {
    if (!state) return;
    var viewIdx = this.interactiveIdx(), rivalIdx = 1 - viewIdx;

    [0, 1].forEach(function (i) {
      $('p' + i + '-name').textContent = state.players[i].name;
      $('p' + i + '-score').textContent = state.players[i].score;
      $('p' + i + '-box').classList.toggle('active-turn', state.turn === i && state.status !== 'GAMEOVER');
      $('p' + i + '-turn').hidden = state.turn !== i || state.status === 'GAMEOVER';
    });
    var turnName = state.players[state.turn].name;
    $('turn-strip').textContent = state.status === 'GAMEOVER' ? t('Fin de la partida')
      : t('Le toca a {p} · {a}: {x} · {b}: {y}', { p: turnName, a: state.players[0].name, x: state.players[0].score, b: state.players[1].name, y: state.players[1].score });
    $('deck-count').textContent = state.deck.length;
    $('deck-count').classList.toggle('deck-empty', state.deck.length === 0);
    $('discard-count').textContent = state.discard.length;
    if (state.lastAction) {
      $('last-action-log').textContent = state.lastAction;
      if (state.lastAction !== this.lastAnnounced) { this.lastAnnounced = state.lastAction; this.announce(state.lastAction); }
    }

    var rivalCount = state.players[rivalIdx].hand.length;
    $('rival-label').textContent = this.config.mode === 'LOCAL'
      ? t('Mano de {p}:', { p: state.players[rivalIdx].name }) : t('Mano del rival:');
    $('opponent-hand-backs').innerHTML = new Array(rivalCount + 1).join('<span class="mini-card-back">0</span>');
    $('rival-count').textContent = t('{n} cartas', { n: rivalCount });

    // Reactor
    var r = state.reactor;
    var gauge = $('charge-gauge'), val = $('net-charge-value');
    gauge.classList.remove('positive', 'negative', 'zero', 'pending');
    var cat = $('slot-cation'), ani = $('slot-anion');
    cat.classList.remove('filled', 'pending'); ani.classList.remove('filled', 'pending');

    if (r.pendingH) {
      val.textContent = '?';
      gauge.classList.add('pending');
      cat.classList.add('pending');
      $('slot-cation-content').innerHTML = 'H<sub>' + (r.pendingH.count > 1 ? r.pendingH.count : '') + '</sub><span class="ox">' + esc(t('+1 o −1')) + '</span>';
      $('slot-anion-content').innerHTML = '<span class="empty">' + esc(t('¿Metal o no metal?')) + '</span>';
    } else {
      val.textContent = signed(r.netCharge);
      gauge.classList.add(r.netCharge > 0 ? 'positive' : (r.netCharge < 0 ? 'negative' : 'zero'));
      cat.classList.toggle('filled', !!r.cation);
      ani.classList.toggle('filled', !!r.anion);
      $('slot-cation-content').innerHTML = r.cation
        ? esc(r.cation.symbol) + ' × ' + r.cation.count + '<span class="ox">' + signed(r.cation.charge) + '</span>'
        : '<span class="empty">—</span>';
      $('slot-anion-content').innerHTML = r.anion
        ? esc(r.anion.symbol) + ' × ' + r.anion.count + '<span class="ox">' + signed(r.anion.charge) + '</span>'
        : '<span class="empty">—</span>';
    }

    var fEl = $('reactor-formula');
    if (r.status === 'EMPTY') fEl.textContent = t('Reactor vacío: empieza un compuesto');
    else if (r.pendingH) fEl.innerHTML = esc(t('En marcha:')) + ' H' + (r.pendingH.count > 1 ? '<sub>' + r.pendingH.count + '</sub>' : '') + ' + ?';
    else {
      var cs = r.cation ? esc(r.cation.symbol) + (r.cation.count > 1 ? '<sub>' + r.cation.count + '</sub>' : '') : '?';
      var as = r.anion ? esc(r.anion.symbol) + (r.anion.count > 1 ? '<sub>' + r.anion.count + '</sub>' : '') : '?';
      fEl.innerHTML = esc(t('En marcha:')) + ' ' + cs + as;
    }
    $('pile-points').textContent = r.cardsInPile.length;
    var s = Math.min(3, r.stagnationCounter);
    $('stagnation-dots').textContent = '●●●'.slice(0, s) + '○○○'.slice(0, 3 - s);
    $('stagnation-text').textContent = t('{n} de 3', { n: s });

    this.renderHand(state);

    if (state.status === 'QUIZ' && state.quiz) this.openQuiz(state.quiz);
    else { clearInterval(this.quizInterval); this.shownQuiz = null; $('modal-quiz').hidden = true; }

    if (state.status === 'GAMEOVER') this.renderGameOver(state);
  };

  UI.prototype.renderGameOver = function (state) {
    var p0 = state.players[0], p1 = state.players[1];
    $('gameover-title').textContent = p0.score === p1.score ? t('¡Empate!')
      : t('Gana {p}', { p: p0.score > p1.score ? p0.name : p1.name });
    $('gameover-summary').textContent = p0.name + ': ' + p0.score + ' · ' + p1.name + ': ' + p1.score;
    var list = $('gameover-compounds-list');
    list.innerHTML = state.synthesizedHistory.length === 0
      ? '<li>' + esc(t('No se formó ningún compuesto.')) + '</li>'
      : state.synthesizedHistory.map(function (it) {
          return '<li><span><strong>' + formula(it.formulaHTML) + '</strong> · ' + esc(it.name) + '</span><small>' +
                 esc(it.playerName) + ' (+' + it.points + ')</small></li>';
        }).join('');
    this.openModal('modal-gameover', '#btn-play-again');
  };

  UI.prototype.copyReport = function () {
    if (!this.engine || !this.engine.state) return;
    var s = this.engine.state;
    var text = [
      t('Carga cero ({n}): resumen de la partida', { n: this.config.level === 'BASIC' ? t('nivel básico') : t('nivel avanzado') }),
      s.players[0].name + ': ' + s.players[0].score + ' · ' + s.players[1].name + ': ' + s.players[1].score,
      t('Cuaderno: {a} de {b} compuestos', { a: this.codexCount(), b: TOTAL }),
      t('Compuestos formados:')
    ].concat(s.synthesizedHistory.length
      ? s.synthesizedHistory.map(function (c) { return '- ' + c.key + ' (' + c.name + ') · ' + c.playerName + ', +' + c.points; })
      : ['- ' + t('ninguno')]).join('\n');

    var btn = $('btn-copy-report');
    function done() { btn.textContent = t('✓ Copiado'); setTimeout(function () { btn.textContent = t('📋 Copiar resumen'); }, 2200); }
    function fallback() {
      // Dentro de un iframe el portapapeles moderno puede estar bloqueado.
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* sin portapapeles */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  };

  UI.prototype.renderHand = function (state) {
    var self = this;
    var viewIdx = this.interactiveIdx();
    var myTurn = state.status === 'PLAYING' && state.turn === viewIdx;
    var hand = state.players[viewIdx].hand;

    $('hand-owner-label').textContent = this.config.mode === 'LOCAL'
      ? t('Mano de {p}', { p: state.players[viewIdx].name }) : t('Tu mano');

    var curtain = $('local-privacy-curtain'), box = $('player-hand');
    if (this.config.mode === 'LOCAL' && this.curtain && state.status === 'PLAYING') {
      $('local-curtain-title').textContent = t('Turno de {p}. Pásale el dispositivo.', { p: state.players[viewIdx].name });
      curtain.hidden = false; box.hidden = true;
      this.updateHandButtons(viewIdx, false);
      return;
    }
    curtain.hidden = true; box.hidden = false;

    var focusedId = document.activeElement && document.activeElement.closest && document.activeElement.closest('.game-card')
      ? document.activeElement.closest('.game-card').dataset.id : null;
    var focusedToggle = focusedId && document.activeElement.classList.contains('card-select-toggle');
    box.innerHTML = '';

    var ROLE = { METAL: t('▲ Catión'), NON_METAL: t('▼ Anión'), HYDROGEN: t('+1 o −1'), SPECIAL: t('Carta especial') };

    // Las cartas se quedan quietas: los índices 1–5 del teclado coinciden con su posición.
    hand.forEach(function (card, i) {
      var check = myTurn ? self.engine.canPlayCard(card) : { valid: false, reason: t('Espera tu turno') };
      var sel = self.selected.has(card.id);
      var el = document.createElement('div');
      el.className = 'game-card cat-' + card.category + (!check.valid && myTurn ? ' disabled' : '') + (sel ? ' selected' : '');
      el.dataset.id = card.id;

      var numText = card.type === 'SPECIAL' ? '★'
        : (card.category === 'HYDROGEN' ? '+1 / −1' : card.valences.map(signed).join(' / '));
      var hideSym = card.blindModeType === 'NO_SYMBOL', hideName = card.blindModeType === 'NO_NAME';
      var symbol = hideSym ? '?' : card.symbol;
      var name = hideName ? '???' : t(card.name);
      var spoken = (hideSym ? t('símbolo oculto') : card.symbol) + ', ' + (hideName ? t('nombre oculto') : t(card.name)) + ', ' +
                   (card.type === 'SPECIAL' ? t(card.desc) : t('número de oxidación {n}', { n: numText }));
      if (!check.valid && myTurn) spoken += '. ' + t('No se puede jugar: {r}', { r: check.reason || '' });

      el.innerHTML =
        '<span class="kbd-hint" aria-hidden="true">' + (i + 1) + '</span>' +
        '<button type="button" class="card-play" aria-label="' + esc(t('Jugar carta {i}: {d}', { i: i + 1, d: spoken })) + '"' +
          (check.reason ? ' title="' + esc(check.reason) + '"' : '') + '>' +
          '<span class="card-num">' + esc(numText) + '</span>' +
          '<span class="card-symbol' + (hideSym ? ' blind' : '') + '">' + esc(symbol) + '</span>' +
          '<span class="card-name' + (hideName ? ' blind' : '') + '">' + esc(name) + '</span>' +
          (card.type === 'SPECIAL' ? '<span class="card-desc">' + esc(t(card.desc)) + '</span>'
                                   : '<span class="card-role">' + esc(ROLE[card.category]) + '</span>') +
        '</button>' +
        '<button type="button" class="card-select-toggle" aria-pressed="' + sel + '" aria-label="' +
          esc(t('Marcar la carta {i}', { i: i + 1 })) + '">' + esc(sel ? t('✓ Marcada') : t('Marcar')) + '</button>';

      el.querySelector('.card-play').addEventListener('click', function () { if (myTurn) self.onCardClick(card, check); });
      el.querySelector('.card-select-toggle').addEventListener('click', function () { if (myTurn) self.toggleSelect(card.id); });
      box.appendChild(el);
    });

    if (focusedId) {
      var again = box.querySelector('.game-card[data-id="' + focusedId + '"] ' + (focusedToggle ? '.card-select-toggle' : '.card-play'));
      if (again) again.focus();
    }
    this.updateHandButtons(viewIdx, myTurn);
  };

  UI.prototype.toggleSelect = function (id) {
    if (this.selected.has(id)) this.selected.delete(id);
    else if (this.selected.size < 5) this.selected.add(id);
    this.renderState(this.engine.state);
  };

  UI.prototype.updateHandButtons = function (idx, myTurn) {
    var n = this.selected.size, rec = $('btn-recycle'), combo = $('btn-play-combo');
    rec.textContent = n > 3 ? t('↻ Cambiar: 3 como máximo ({n})', { n: n }) : t('↻ Cambiar marcadas ({n}/3)', { n: n });
    rec.disabled = !myTurn || n === 0 || n > 3;
    var canCombo = myTurn && n >= 2 && this.engine.canPlayCombo(idx, Array.from(this.selected)).valid;
    combo.hidden = !canCombo;
    if (canCombo) combo.textContent = t('⚡ Jugar combo ({n} cartas)', { n: n });
  };

  UI.prototype.onCardClick = function (card, check) {
    var idx = this.interactiveIdx(), self = this;
    if (!check.valid) {
      this.showBanner(esc(check.reason || t('Esa carta no se puede jugar ahora.')), true);
      return;
    }
    if (card.type === 'ELEMENT' && card.valences.length > 1 && card.category !== 'HYDROGEN') {
      var valid = card.valences.filter(function (v) { return self.engine.canPlayElement(card, v).valid; });
      if (valid.length > 1) {
        this.askChoice(t('{n} ({s})', { n: t(card.name), s: card.symbol }), t('¿Con qué número de oxidación entra en este compuesto?'),
          valid.map(function (v) { return { label: signed(v), value: v }; }),
          function (v) { self.dispatchPlay(idx, card.id, v, null); });
        return;
      }
      this.dispatchPlay(idx, card.id, valid[0], null);
      return;
    }
    if (card.type === 'SPECIAL' && card.specialType === 'ISOTOPE') {
      var opts = this.engine.getIsotopeOptions();
      if (opts.length > 1) {
        this.askChoice(t('Isótopo comodín'), t('¿Qué elemento del reactor quieres copiar?'),
          opts.map(function (o) { return { label: t(o.name) + ' (' + o.symbol + ')', value: o.symbol }; }),
          function (sym) { self.dispatchPlay(idx, card.id, null, sym); });
        return;
      }
      this.dispatchPlay(idx, card.id, null, opts[0] && opts[0].symbol);
      return;
    }
    this.dispatchPlay(idx, card.id, null, null);
  };

  UI.prototype.dispatchPlay = function (idx, cardId, charge, iso) {
    this.selected.clear();
    this.sfx.card();
    if (this.config.mode === 'P2P' && !this.network.isHost) this.network.send({ type: 'ACTION_PLAY', playerIdx: idx, cardId: cardId, chosenCharge: charge, isoSymbol: iso });
    else this.engine.playCard(idx, cardId, charge, iso);
  };

  UI.prototype.askChoice = function (title, desc, options, onSelect) {
    var self = this;
    $('valence-modal-title').textContent = title;
    $('valence-modal-desc').textContent = desc;
    var box = $('valence-options');
    box.innerHTML = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'primary-btn';
      b.textContent = o.label;
      b.addEventListener('click', function () { self.closeModal('modal-valence'); onSelect(o.value); });
      box.appendChild(b);
    });
    this.openModal('modal-valence');
  };

  // ── Reto «Nombra rápido» ─────────────────────────────
  UI.prototype.openQuiz = function (quiz) {
    var key = quiz.id + '-' + quiz.phase;
    if (this.shownQuiz === key) return;   // ya está abierto: no reiniciar el tiempo
    this.shownQuiz = key;
    clearInterval(this.quizInterval);
    var self = this, st = this.engine.state;
    var rebound = quiz.phase === 'REBOUND';
    var who = st.players[quiz.answeringIdx].name;

    $('quiz-badge').textContent = rebound ? t('Rebote: {p} puede robar +3', { p: who }) : t('Nombra rápido · +3 puntos');
    $('quiz-badge').classList.toggle('rebound', rebound);
    $('quiz-formula').innerHTML = formula(quiz.question.headerHTML);

    var canAnswer = this.config.mode === 'LOCAL' ||
      (this.config.mode === 'BOT' && quiz.answeringIdx === 0) ||
      (this.config.mode === 'P2P' && quiz.answeringIdx === this.localPlayerIndex);
    $('quiz-prompt').textContent = canAnswer
      ? t('{q} · contesta {p}', { q: t(quiz.question.promptText), p: who })
      : t('{q} · está contestando {p}…', { q: t(quiz.question.promptText), p: who });

    var opts = $('quiz-options');
    opts.innerHTML = '';
    quiz.question.options.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="kbd-quiz" aria-hidden="true">' + (i + 1) + '</span> <span>' + formula(t(o.text)) + '</span>';
      b.disabled = !canAnswer;
      b.addEventListener('click', function () {
        clearInterval(self.quizInterval);
        if (self.config.mode === 'P2P' && !self.network.isHost) self.network.send({ type: 'ACTION_QUIZ', optionIndex: i });
        else self.engine.resolveQuizAnswer(i);
      });
      opts.appendChild(b);
    });
    this.openModal('modal-quiz', canAnswer ? '#quiz-options button' : null);

    var total = this.config.quizTime ? (rebound ? Math.max(4, this.config.quizTime * 0.6) : this.config.quizTime) : 0;
    var timerEl = $('quiz-timer'), bar = $('quiz-timer-bar');
    bar.style.width = '100%';
    if (!total || (this.config.mode === 'BOT' && quiz.answeringIdx === 1)) {
      timerEl.textContent = total ? '' : t('Sin límite');
      return;
    }
    var remaining = total;
    timerEl.textContent = num(remaining, 1) + ' s';
    this.quizInterval = setInterval(function () {
      remaining -= 0.1;
      if (remaining <= 0) {
        clearInterval(self.quizInterval);
        bar.style.width = '0%';
        timerEl.textContent = num(0, 1) + ' s';
        if (self.config.mode !== 'P2P' || self.network.isHost) self.engine.resolveQuizAnswer(null);
      } else {
        timerEl.textContent = num(remaining, 1) + ' s';
        bar.style.width = Math.max(0, remaining / total * 100) + '%';
      }
    }, 100);
  };

  UI.prototype.onEngineEvent = function (ev) {
    if (ev.type === 'COMPOUND_SYNTHESIZED') {
      if (this.config.mode === 'LOCAL' || ev.playerIdx === this.localPlayerIndex) this.unlockCompound(ev.key);
      this.sfx.synthesis();
      this.effect('pulse-zero-effect');
      var chip = $('last-synthesis-chip');
      chip.innerHTML = esc(t('Último compuesto:')) + ' <strong>' + formula(ev.formulaHTML) + '</strong> · ' + esc(ev.name);
      chip.hidden = false;
    } else if (ev.type === 'SIMPLE_BANNER') {
      this.showBanner(esc(t('¡Carga cero!')) + ' ' + formula(ev.formulaHTML) + ' · ' + esc(ev.name) + ' ' + esc(t('(+{n} puntos)', { n: ev.points })));
    } else if (ev.type === 'ELECTROLYSIS_USED') {
      this.sfx.zap();
      this.effect('shake-effect');
      this.showBanner(esc(t('⚡ {p} usa Electrólisis y quita el último átomo', { p: ev.playerName })), true);
    } else if (ev.type === 'QUIZ_SUCCESS') {
      this.sfx.success();
      this.showBanner(esc(ev.isRebound ? t('¡Rebote! {p} roba 3 puntos', { p: ev.winnerName }) : t('¡Correcto! {p} suma 3 puntos', { p: ev.winnerName })));
    } else if (ev.type === 'QUIZ_FAILED') {
      this.showBanner(esc(t('Nadie acertó. Era:')) + ' ' + formula(ev.correctName), true);
    } else if (ev.type === 'DECOMPOSED') {
      this.sfx.zap();
      this.effect('shake-effect');
      this.showBanner(esc(t('El compuesto a medias se ha descompuesto: nadie se lleva el bote.')), true);
    }
  };

  UI.prototype.effect = function (cls) {
    var z = $('reactor-zone');
    z.classList.remove('shake-effect', 'pulse-zero-effect');
    void z.offsetWidth;
    z.classList.add(cls);
  };

  UI.prototype.showBanner = function (html, bad) {
    var b = $('synthesis-banner');
    b.innerHTML = html;
    b.classList.toggle('is-bad', !!bad);
    b.hidden = false;
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(function () { b.hidden = true; }, 3400);
  };

  // ── Temas ────────────────────────────────────────────
  UI.prototype.setupThemeSelector = function () {
    var btn = $('theme-btn'), panel = $('theme-panel'), opts = document.querySelectorAll('.theme-opt');
    function close() {
      panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true');
      btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.classList.toggle('open');
      btn.classList.toggle('active', open);
      btn.setAttribute('aria-expanded', String(open));
      panel.setAttribute('aria-hidden', String(!open));
    });
    document.addEventListener('click', function (e) { if (!btn.contains(e.target) && !panel.contains(e.target)) close(); });
    opts.forEach(function (o) {
      o.addEventListener('click', function () {
        var th = o.dataset.theme;
        document.body.classList.remove('theme-light', 'theme-contrast', 'theme-marca');
        // El tema SimulaCiencia parte del claro y cambia sus colores por los de la marca.
        if (th === 'marca') document.body.classList.add('theme-light', 'theme-marca');
        else if (th !== 'dark') document.body.classList.add('theme-' + th);
        opts.forEach(function (b) { b.classList.remove('active'); });
        o.classList.add('active');
        close();
      });
    });
    // ?tema=claro|oscuro|contraste|simulaciencia, como en las simulaciones
    var p = new URLSearchParams(location.search).get('tema');
    var map = { simulaciencia: 'marca', marca: 'marca', claro: 'light', oscuro: 'dark', contraste: 'contrast' };
    var target = p && map[p] && document.querySelector('.theme-opt[data-theme="' + map[p] + '"]');
    if (target) target.click();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { CC.ui = new UI(); });
  else CC.ui = new UI();
})();
