// Interfaz del juego: menú, mesa, animaciones, ventanas, sonido, temas y modo en línea.
//
// El motor avisa de cada paso con un evento que lleva una copia del estado (snapshot).
// Aquí los eventos se ponen en cola y se animan de uno en uno: la carta vuela al
// reactor, el compuesto se celebra, el rival «piensa»… y solo entonces se pinta el
// estado nuevo. Así se ve todo lo que pasa, también lo que hace el rival.
window.CC = window.CC || {};

(function () {
  function t(s, v) { return window.i18n ? window.i18n.t(s, v) : s; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formula(s) { return esc(s).replace(/&lt;(\/?)sub&gt;/g, '<$1sub>'); }
  function signed(n) { return n > 0 ? '+' + n : (n < 0 ? '−' + Math.abs(n) : '0'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, REDUCED ? Math.min(ms, 250) : ms); }); }
  function subs(key) { return esc(key).replace(/(\d+)/g, '<sub>$1</sub>'); }

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STORAGE_CODEX = 'sim-carga-cero-cuaderno';
  var TOTAL = CC.COMPOUND_CATALOG.length;
  var BOT_NAMES = { APPRENTICE: 'Aprendiz', CHEMIST: 'Químico', NOBEL: 'Nobel' };
  var CONFETTI = ['#ff8a3d', '#3da5ff', '#a66bff', '#ffd84a', '#2ee6a6', '#ff5d73'];

  // ── Sonidos sintetizados ─────────────────────────────
  function SoundFX() { this.enabled = true; this.ctx = null; }
  SoundFX.prototype.tone = function (freq, dur, type, gain, delay, slide) {
    if (!this.enabled) return;
    try {
      if (!this.ctx) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return; this.ctx = new A(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      var now = this.ctx.currentTime + (delay || 0);
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, now);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, now + dur);
      g.gain.setValueAtTime(gain || 0.1, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(now); o.stop(now + dur);
    } catch (e) { /* sin audio */ }
  };
  SoundFX.prototype.card = function () { this.tone(300, 0.12, 'triangle', 0.12, 0, 600); };
  SoundFX.prototype.plop = function () { this.tone(520, 0.1, 'sine', 0.12, 0, 260); };
  SoundFX.prototype.fanfare = function () { var s = this; [523, 659, 784, 1047].forEach(function (f, i) { s.tone(f, 0.22, 'triangle', 0.13, i * 0.1); }); };
  SoundFX.prototype.zap = function () { this.tone(900, 0.25, 'sawtooth', 0.08, 0, 80); };
  SoundFX.prototype.good = function () { this.tone(660, 0.12, 'triangle', 0.14); this.tone(990, 0.2, 'triangle', 0.14, 0.1); };
  SoundFX.prototype.bad = function () { this.tone(220, 0.3, 'square', 0.07, 0, 110); };
  SoundFX.prototype.turn = function () { this.tone(740, 0.1, 'sine', 0.08); this.tone(988, 0.12, 'sine', 0.08, 0.08); };

  // ── Carta en HTML ────────────────────────────────────
  function cardHTML(card, opts) {
    opts = opts || {};
    if (!card) return '';
    var el = card.type === 'ELEMENT' ? CC.ELEMENTS[card.symbol] : null;
    var hideSym = card.blind === 'SYMBOL', hideName = card.blind === 'NAME';
    var nums = card.type === 'SPECIAL' ? '<span class="gc-num">★</span>'
      : card.numbers.map(function (n) { return '<span class="gc-num">' + signed(n) + '</span>'; }).join('');
    var role = card.type === 'SPECIAL' ? '' : (card.category === 'METAL' ? '▲' : (card.category === 'NON_METAL' ? '▼' : '◆'));
    var bottom = card.type === 'SPECIAL'
      ? '<span class="gc-symbol">' + esc(card.symbol) + '</span><span class="gc-name">' + esc(t(card.name)) + '</span><span class="gc-desc">' + esc(t(card.desc)) + '</span>'
      : '<span class="gc-symbol' + (hideSym ? ' gc-mystery' : '') + '">' + esc(hideSym ? '?' : card.symbol) + '</span>' +
        '<span class="gc-name' + (hideName ? ' gc-mystery' : '') + '">' + esc(hideName ? '???' : t(el.name)) + '</span>';
    return '<div class="gc-top"><span class="gc-art">' + CC.ART.icon(card) + '</span><span class="gc-nums">' + nums + '</span>' +
           (role ? '<span class="gc-role" aria-hidden="true">' + role + '</span>' : '') + '</div>' +
           '<div class="gc-bottom">' + bottom + '</div>' +
           (opts.key ? '<span class="gc-key" aria-hidden="true">' + opts.key + '</span>' : '');
  }
  function makeCard(card, extraClass, opts) {
    var d = document.createElement('div');
    d.className = 'gcard cat-' + card.category + (extraClass ? ' ' + extraClass : '');
    d.innerHTML = cardHTML(card, opts);
    return d;
  }
  function spoken(card) {
    if (card.type === 'SPECIAL') return t(card.name) + ': ' + t(card.desc);
    var nums = card.numbers.map(signed).join(t(' o '));
    return (card.blind === 'SYMBOL' ? t('símbolo oculto') : card.symbol) + ', ' +
           (card.blind === 'NAME' ? t('nombre oculto') : t(CC.ELEMENTS[card.symbol].name)) + ', ' + nums;
  }

  // ── Interfaz ─────────────────────────────────────────
  function UI() {
    this.config = { level: 'BASIC', blindMode: false, mode: 'BOT', botLevel: 'CHEMIST', quizTime: 8 };
    this.selected = new Set();
    this.queue = [];
    this.busy = false;
    this.idleWaiters = [];
    this.view = null;
    this.engine = null;
    this.localIdx = 0;
    this.curtain = false;
    this.unlocked = this.loadCodex();
    this.sfx = new SoundFX();
    this.quizTimer = null;
    this.netSeq = 0; this.netExpect = 1; this.netBuffer = {};
    var self = this;
    this.net = new CC.NetworkManager(
      function (msg, err, code) { self.p2pStatus(msg, err, code); },
      function (data) { self.onNet(data); });

    $('codex-total').textContent = TOTAL;
    $('codex-modal-total').textContent = TOTAL;
    document.querySelectorAll('[data-avatar]').forEach(function (el) { el.innerHTML = CC.ART.avatar(el.dataset.avatar); });
    this.renderHero();
    this.bindMenu();
    this.bindKeyboard();
    this.setupThemes();
    this.updateCodexCounter();
    this.updateBody();
  }

  UI.prototype.announce = function (text) {
    var el = $('anuncio');
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 30);
  };

  UI.prototype.renderHero = function () {
    var box = $('hero-cards');
    var demo = [
      { type: 'ELEMENT', symbol: 'Ca', category: 'METAL', numbers: [2] },
      { type: 'ELEMENT', symbol: 'Cl', category: 'NON_METAL', numbers: [-1] },
      { type: 'ELEMENT', symbol: 'Fe', category: 'METAL', numbers: [2, 3] },
      { type: 'ELEMENT', symbol: 'H', category: 'HYDROGEN', numbers: [1, -1] },
      { type: 'ELEMENT', symbol: 'O', category: 'NON_METAL', numbers: [-2] }
    ];
    demo.forEach(function (c, i) {
      var el = makeCard(c);
      var off = i - 2;
      el.style.setProperty('--cw', '92px');
      el.style.transform = 'translateX(calc(-50% + ' + (off * 70) + 'px)) rotate(' + (off * 9) + 'deg) translateY(' + (Math.abs(off) * 10) + 'px)';
      el.style.animationDelay = (i * 0.3) + 's';
      box.appendChild(el);
    });
  };

  // ── Cuaderno ─────────────────────────────────────────
  UI.prototype.loadCodex = function () {
    try { var raw = localStorage.getItem(STORAGE_CODEX); return raw ? new Set(JSON.parse(raw)) : new Set(); } catch (e) { return new Set(); }
  };
  UI.prototype.unlock = function (key) {
    if (this.unlocked.has(key)) return false;
    this.unlocked.add(key);
    try { localStorage.setItem(STORAGE_CODEX, JSON.stringify(Array.from(this.unlocked))); } catch (e) { /* modo privado */ }
    this.updateCodexCounter();
    return true;
  };
  UI.prototype.codexCount = function () {
    var self = this;
    return CC.COMPOUND_CATALOG.filter(function (c) { return self.unlocked.has(c.key); }).length;
  };
  UI.prototype.updateCodexCounter = function () {
    $('codex-counter').textContent = this.codexCount();
    $('codex-modal-count').textContent = this.codexCount();
  };
  UI.prototype.renderCodex = function () {
    var grid = $('codex-grid'), self = this;
    var groups = { 0: t('Óxidos'), 9: t('Cloruros'), 18: t('Sulfuros'), 27: t('Compuestos con hidrógeno') };
    grid.innerHTML = '';
    CC.COMPOUND_CATALOG.forEach(function (item, i) {
      if (groups[i]) { var h = document.createElement('h4'); h.className = 'codex-group'; h.textContent = groups[i]; grid.appendChild(h); }
      var on = self.unlocked.has(item.key);
      var d = document.createElement('div');
      d.className = 'sticker ' + (on ? 'unlocked' : 'locked');
      d.style.setProperty('--tilt', ((i * 37) % 7 - 3) + 'deg');
      d.innerHTML = on
        ? '<span class="sticker-formula">' + subs(item.key) + '</span><span class="sticker-name">' + esc(t(item.name)) + '</span><span class="sticker-fact">' + esc(t(item.fact)) + '</span>'
        : '<span class="sticker-formula">?</span><span class="sticker-name">' + esc(t('Sin descubrir')) + '</span>';
      grid.appendChild(d);
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

  // ── Menú ─────────────────────────────────────────────
  UI.prototype.radio = function (id, onChange) {
    var buttons = $(id).querySelectorAll('button');
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        buttons.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
        b.classList.add('active'); b.setAttribute('aria-checked', 'true');
        onChange(b.dataset.val);
      });
    });
  };
  UI.prototype.updateBody = function () {
    document.body.classList.toggle('rival-bot', this.config.mode === 'BOT');
    document.body.classList.toggle('rival-p2p', this.config.mode === 'P2P');
    $('btn-start-game').hidden = this.config.mode === 'P2P';
  };

  UI.prototype.bindMenu = function () {
    var self = this;
    this.radio('select-mode', function (v) { self.config.mode = v; self.updateBody(); });
    this.radio('select-bot-level', function (v) { self.config.botLevel = v; });
    this.radio('select-level', function (v) { self.config.level = v; });
    this.radio('select-time', function (v) { self.config.quizTime = parseInt(v, 10); });
    $('check-blind').addEventListener('change', function (e) { self.config.blindMode = e.target.checked; });

    $('btn-start-game').addEventListener('click', function () { self.sfx.turn(); self.startLocalGame(); });
    $('btn-play-again').addEventListener('click', function () {
      self.closeModal('modal-gameover');
      if (self.config.mode === 'P2P') self.toMenu(); else self.startLocalGame();
    });
    $('btn-exit-match').addEventListener('click', function () { self.toMenu(); });

    $('btn-toggle-sound').addEventListener('click', function (e) {
      self.sfx.enabled = !self.sfx.enabled;
      e.currentTarget.setAttribute('aria-pressed', String(self.sfx.enabled));
      $('sound-icon').textContent = self.sfx.enabled ? '🔊' : '🔇';
      if (self.sfx.enabled) self.sfx.plop();
    });
    $('btn-rules').addEventListener('click', function () { self.openModal('modal-rules', '#btn-close-rules'); });
    $('btn-close-rules').addEventListener('click', function () { self.closeModal('modal-rules'); });
    $('btn-open-codex').addEventListener('click', function () { self.renderCodex(); self.openModal('modal-codex', '#btn-close-codex'); });
    $('btn-close-codex').addEventListener('click', function () { self.closeModal('modal-codex'); });
    $('btn-cancel-choice').addEventListener('click', function () { self.closeModal('modal-choice'); });
    $('btn-copy-report').addEventListener('click', function () { self.copyReport(); });

    $('btn-reveal-local-hand').addEventListener('click', function () {
      self.curtain = false;
      self.render();
      var f = document.querySelector('#player-hand .gcard-face'); if (f) f.focus();
    });

    $('btn-recycle').addEventListener('click', function () {
      var ids = Array.from(self.selected);
      if (!ids.length || ids.length > 3 || !self.canAct()) return;
      self.selected.clear();
      self.act({ k: 'recycle', p: self.myIdx(), ids: ids });
    });
    $('btn-play-combo').addEventListener('click', function () {
      var ids = Array.from(self.selected);
      if (!self.canAct()) return;
      self.selected.clear();
      self.act({ k: 'combo', p: self.myIdx(), ids: ids });
    });

    // En línea
    $('btn-create-room').addEventListener('click', function () {
      self.net.createRoom(function () { self.startOnlineAsHost(); });
    });
    $('btn-join-room').addEventListener('click', function () {
      self.net.joinRoom($('input-room-code').value, function () { /* espera INIT del anfitrión */ });
    });
    $('input-room-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-join-room').click(); });
  };

  UI.prototype.bindKeyboard = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        ['modal-codex', 'modal-rules', 'modal-choice'].forEach(function (id) { self.closeModal(id); });
        if (self.skipCelebration) self.skipCelebration();
        return;
      }
      if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (!self.view) return;
      if (!$('modal-quiz').hidden && n >= 1 && n <= 3) {
        var b = document.querySelectorAll('#quiz-options button')[n - 1];
        if (b && !b.disabled) b.click();
        return;
      }
      if (!$('modal-choice').hidden || !$('modal-codex').hidden || !$('modal-rules').hidden) return;
      if (n >= 1 && n <= 5 && self.canAct()) {
        var card = self.view.players[self.myIdx()].hand[n - 1];
        if (card) self.onCardClick(card);
      }
    });
  };

  UI.prototype.p2pStatus = function (msg, err, code) {
    var el = $('p2p-status');
    el.textContent = msg;
    el.classList.toggle('error', !!err);
    var c = $('p2p-code');
    if (code) { c.textContent = code; c.hidden = false; }
    if (err && this.view) this.showBubble('bottom', esc(msg), 4000);
  };

  // ── Arranque de partidas ─────────────────────────────
  UI.prototype.names = function () {
    if (this.config.mode === 'BOT') return [t('Tú'), t('Robot {n}', { n: t(BOT_NAMES[this.config.botLevel]) })];
    if (this.config.mode === 'P2P') return [t('Anfitrión'), t('Invitado')];
    return [t('Jugador 1'), t('Jugador 2')];
  };

  UI.prototype.newEngine = function (seed) {
    var self = this;
    if (this.engine) this.engine.destroy();
    clearInterval(this.quizTimer);
    this.queue = []; this.busy = false; this.idleWaiters = [];
    this.selected.clear();
    this.curtain = false;
    this.view = null;
    var cfg = Object.assign({}, this.config, { seed: seed });
    this.engine = new CC.GameEngine(cfg, function (ev) { self.enqueue(ev); });
    this.engine.waitIdle = function (cb) { self.whenIdle(cb); };
    document.body.classList.remove('pantalla-menu');
    document.body.classList.add('pantalla-juego');
    ['modal-gameover', 'modal-quiz', 'modal-choice'].forEach(function (id) { $(id).hidden = true; });
  };

  UI.prototype.startLocalGame = function () {
    this.localIdx = 0;
    this.newEngine(null);
    this.engine.initGame(this.names());
  };

  UI.prototype.startOnlineAsHost = function () {
    var seed = (Math.random() * 4294967295) >>> 0;
    this.localIdx = 0;
    this.netSeq = 0;
    this.net.send({ t: 'INIT', seed: seed, config: { level: this.config.level, blindMode: this.config.blindMode, quizTime: this.config.quizTime } });
    this.newEngine(seed);
    this.engine.initGame(this.names());
  };

  UI.prototype.toMenu = function () {
    if (this.engine) this.engine.destroy();
    this.engine = null;
    this.view = null;
    clearInterval(this.quizTimer);
    this.queue = []; this.busy = false;
    this.net.destroy();
    $('p2p-code').hidden = true;
    $('fx-layer').innerHTML = '';
    document.querySelectorAll('.celebration, .fly, .confetti').forEach(function (n) { n.remove(); });
    ['modal-gameover', 'modal-quiz', 'modal-choice'].forEach(function (id) { $(id).hidden = true; });
    document.body.classList.remove('pantalla-juego');
    document.body.classList.add('pantalla-menu');
    $('btn-start-game').focus();
  };

  // ── Jugadas: locales o por la red ────────────────────
  UI.prototype.myIdx = function () {
    if (this.config.mode === 'LOCAL') return this.view ? this.view.turn : 0;
    return this.localIdx;
  };
  UI.prototype.isIdle = function () { return !this.busy && this.queue.length === 0; };
  UI.prototype.canAct = function () {
    var v = this.view;
    return !!(v && this.engine && v.status === 'PLAYING' && v.turn === this.myIdx() && this.isIdle() && !this.curtain);
  };

  UI.prototype.applyAction = function (a) {
    var e = this.engine;
    if (!e) return false;
    if (a.k === 'play') return e.playCard(a.p, a.id, a.iso);
    if (a.k === 'combo') return e.playCombo(a.p, a.ids);
    if (a.k === 'recycle') return e.recycleCards(a.p, a.ids);
    if (a.k === 'quiz') {
      if (!e.state.quiz || e.state.quiz.answeringIdx !== a.p) return false;
      e.resolveQuizAnswer(a.o); return true;
    }
    return false;
  };

  // En línea, el anfitrión aplica y reparte las jugadas numeradas; el invitado las pide.
  UI.prototype.act = function (a) {
    if (this.config.mode !== 'P2P') { this.applyAction(a); return; }
    if (this.net.isHost) {
      if (this.applyAction(a)) this.net.send({ t: 'A', n: ++this.netSeq, a: a });
    } else {
      this.net.send({ t: 'REQ', a: a });
    }
  };

  UI.prototype.onNet = function (d) {
    if (d.t === 'INIT' && !this.net.isHost) {
      this.config.mode = 'P2P';
      this.config.level = d.config && d.config.level === 'ADVANCED' ? 'ADVANCED' : 'BASIC';
      this.config.blindMode = !!(d.config && d.config.blindMode);
      this.config.quizTime = [8, 15, 0].indexOf(d.config && d.config.quizTime) !== -1 ? d.config.quizTime : 8;
      this.localIdx = 1;
      this.netExpect = 1; this.netBuffer = {};
      this.newEngine(d.seed >>> 0);
      this.engine.initGame(this.names());
    } else if (d.t === 'REQ' && this.net.isHost && this.engine && d.a && d.a.p === 1) {
      this.act(d.a);
    } else if (d.t === 'A' && !this.net.isHost && this.engine && typeof d.n === 'number') {
      this.netBuffer[d.n] = d.a;
      while (this.netBuffer[this.netExpect]) {
        var a = this.netBuffer[this.netExpect];
        delete this.netBuffer[this.netExpect];
        this.netExpect++;
        this.applyAction(a);
      }
    }
  };

  // ── Cola de animaciones ──────────────────────────────
  UI.prototype.whenIdle = function (cb) {
    if (this.isIdle()) cb(); else this.idleWaiters.push(cb);
  };
  UI.prototype.enqueue = function (ev) {
    this.queue.push(ev);
    if (!this.busy) this.pump();
  };
  UI.prototype.pump = function () {
    var self = this;
    if (!this.queue.length) {
      this.busy = false;
      this.render();
      var w = this.idleWaiters; this.idleWaiters = [];
      w.forEach(function (cb) { cb(); });
      return;
    }
    this.busy = true;
    var ev = this.queue.shift();
    var engineAtStart = this.engine;
    Promise.resolve(this.animate(ev)).catch(function (e) { if (window.console) console.error(e); }).then(function () {
      if (self.engine !== engineAtStart) return;
      self.view = ev.snapshot;
      self.render();
      self.pump();
    });
  };

  UI.prototype.seatOf = function (playerIdx) {
    return playerIdx === this.bottomIdx() ? 'bottom' : 'top';
  };
  UI.prototype.bottomIdx = function () {
    if (this.config.mode === 'LOCAL') return this.view ? this.view.turn : 0;
    return this.localIdx;
  };
  UI.prototype.isMe = function (playerIdx) { return this.config.mode !== 'LOCAL' && playerIdx === this.localIdx; };
  UI.prototype.who = function (playerIdx, snap) {
    var s = snap || this.view;
    return s ? s.players[playerIdx].name : '';
  };

  UI.prototype.animate = function (ev) {
    var self = this, snap = ev.snapshot;
    switch (ev.type) {
      case 'START':
        this.view = snap; this.render();
        return this.toast(this.isMe(snap.turn) ? t('¡Empiezas tú!') : t('¡Empieza {p}!', { p: this.who(snap.turn, snap) }), 1100);

      case 'PLAY': {
        var seat = this.seatOf(ev.playerIdx);
        if (seat === 'top') this.showBubble('top', ev.card.type === 'SPECIAL'
          ? esc(t('¡{c}!', { c: t(ev.card.name) })) : esc(t('¡Echo {s}!', { s: ev.card.symbol })), 1600);
        this.sfx.card();
        this.announce(this.isMe(ev.playerIdx) ? t('Echas {c}.', { c: spoken(ev.card) }) : t('{p} echa {c}.', { p: this.who(ev.playerIdx), c: spoken(ev.card) }));
        return this.flyCard(ev.card, this.sourceRect(ev.playerIdx, ev.card.id), $('flask'), 520).then(function () {
          self.sfx.plop();
          self.view = snap; self.render();
          self.bump($('flask'), 'boom');
          return sleep(snap.reactor.view && snap.reactor.view.closed ? 300 : 350);
        });
      }

      case 'COMBO': {
        if (this.seatOf(ev.playerIdx) === 'top') this.showBubble('top', esc(t('¡Combo!')), 2000);
        this.announce(t('¡Combo de {p} con {n} cartas!', { p: this.who(ev.playerIdx), n: ev.cards.length }));
        var chain = Promise.resolve();
        ev.cards.forEach(function (c, i) {
          chain = chain.then(function () {
            self.sfx.card();
            return self.flyCard(c, self.sourceRect(ev.playerIdx, c.id), $('flask'), 380);
          }).then(function () { self.bump($('flask'), 'boom'); return sleep(120); });
        });
        return chain.then(function () { self.view = snap; self.render(); return sleep(250); });
      }

      case 'SYNTHESIS':
        return this.celebrate(ev).then(function () {
          if (self.isMe(ev.playerIdx) || self.config.mode === 'LOCAL') self.unlock(ev.key);
          self.view = snap; self.render();
          self.bump($(self.seatOf(ev.playerIdx) + '-score'), 'bump');
          return sleep(300);
        });

      case 'QUIZ':
        this.view = snap; this.render();
        this.openQuiz(snap.quiz);
        return sleep(200);

      case 'QUIZ_RESULT':
        return this.quizResult(ev).then(function () {
          if (ev.ok) { self.view = snap; self.render(); self.bump($(self.seatOf(ev.winnerIdx) + '-score'), 'bump'); }
        });

      case 'ELECTROLYSIS': {
        if (this.seatOf(ev.playerIdx) === 'top') this.showBubble('top', esc(t('¡Electrólisis!')), 1600);
        this.sfx.zap();
        this.announce(t('{p} usa Electrólisis y quita {s}.', { p: this.who(ev.playerIdx), s: ev.removedSymbol || '' }));
        return this.flyCard(ev.card, this.sourceRect(ev.playerIdx, ev.card.id), $('flask'), 420).then(function () {
          self.lightning();
          self.bump($('flask'), 'shake');
          var from = document.querySelector('.tray-cards .gcard:last-child');
          var r = from ? from.getBoundingClientRect() : $('flask').getBoundingClientRect();
          return ev.removed ? self.flyCard(ev.removed, r, $('discard-pile'), 480) : null;
        }).then(function () { return sleep(200); });
      }

      case 'RECYCLE': {
        if (this.seatOf(ev.playerIdx) === 'top') this.showBubble('top', esc(ev.cards.length > 1 ? t('Cambio {n} cartas', { n: ev.cards.length }) : t('Cambio 1 carta')), 1500);
        this.announce(t('{p} cambia {n} cartas.', { p: this.who(ev.playerIdx), n: ev.cards.length }));
        return Promise.all(ev.cards.map(function (c, i) {
          return sleep(i * 120).then(function () { return self.flyCard(c, self.sourceRect(ev.playerIdx, c.id), $('discard-pile'), 450, true); });
        })).then(function () { return sleep(250); });
      }

      case 'DECOMPOSED':
        this.sfx.bad();
        this.bump($('flask'), 'shake');
        this.announce(t('El compuesto a medias se ha descompuesto.'));
        return this.banner('bad', t('¡Puf!'), '💨', t('El compuesto a medias se ha descompuesto'), t('3 turnos sin añadir átomos: nadie se lleva las cartas'), 1900);

      case 'TURN': {
        this.view = snap;
        if (this.config.mode === 'LOCAL') { this.curtain = true; this.render(); return sleep(150); }
        this.render();
        if (this.isMe(ev.turn)) { this.sfx.turn(); return this.toast(t('¡Tu turno!'), 900); }
        if (this.config.mode === 'BOT') this.showBubble('top', '<span class="dots"><i></i><i></i><i></i></span>', 0);
        return sleep(200);
      }

      case 'GAMEOVER':
        this.view = snap; this.render();
        this.renderGameOver(snap);
        return sleep(100);
    }
    return null;
  };

  // ── Efectos ──────────────────────────────────────────
  UI.prototype.sourceRect = function (playerIdx, cardId) {
    if (this.seatOf(playerIdx) === 'bottom') {
      var el = document.querySelector('#player-hand .gcard[data-id="' + cardId + '"]');
      if (el) { var r = el.getBoundingClientRect(); el.style.visibility = 'hidden'; return r; }
      return $('bottom-avatar').getBoundingClientRect();
    }
    var backs = document.querySelectorAll('#top-hand .back');
    var b = backs[Math.floor(backs.length / 2)] || $('top-avatar');
    return b.getBoundingClientRect();
  };

  UI.prototype.flyCard = function (card, fromRect, toEl, ms, shrink) {
    if (!toEl || !fromRect) return sleep(ms);
    var to = toEl.getBoundingClientRect();
    var el = makeCard(card, 'fly');
    var w = 92;
    el.style.setProperty('--cw', w + 'px');
    var h = w * 1.42;
    el.style.left = (fromRect.left + fromRect.width / 2 - w / 2) + 'px';
    el.style.top = (fromRect.top + fromRect.height / 2 - h / 2) + 'px';
    document.body.appendChild(el);
    var dx = (to.left + to.width / 2) - (fromRect.left + fromRect.width / 2);
    var dy = (to.top + to.height / 2) - (fromRect.top + fromRect.height / 2);
    var endScale = shrink ? 0.4 : 0.6;
    if (REDUCED || !el.animate) { el.remove(); return Promise.resolve(); }
    var anim = el.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
      { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 60) + 'px) rotate(' + (dx > 0 ? 12 : -12) + 'deg) scale(1.08)', offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(0deg) scale(' + endScale + ')', opacity: shrink ? 0.2 : 1, offset: 1 }
    ], { duration: ms, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
    return new Promise(function (res) { anim.onfinish = function () { el.remove(); res(); }; });
  };

  UI.prototype.bump = function (el, cls) {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  };

  UI.prototype.confetti = function (x, y, n) {
    if (REDUCED) return;
    for (var i = 0; i < n; i++) {
      var c = document.createElement('div');
      c.className = 'confetti';
      c.style.background = CONFETTI[i % CONFETTI.length];
      c.style.left = x + 'px'; c.style.top = y + 'px';
      document.body.appendChild(c);
      var ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260;
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 120;
      var a = c.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + (dy + 260) + 'px) rotate(' + (Math.random() * 720 - 360) + 'deg)', opacity: 0 }
      ], { duration: 1200 + Math.random() * 700, easing: 'cubic-bezier(.2,.8,.4,1)' });
      a.onfinish = (function (node) { return function () { node.remove(); }; })(c);
    }
  };

  UI.prototype.lightning = function () {
    var f = $('flask').getBoundingClientRect();
    var bolt = document.createElement('div');
    bolt.className = 'fly';
    bolt.innerHTML = CC.ART.iconFor('ELECTROLYSIS');
    bolt.style.width = '90px'; bolt.style.height = '90px';
    bolt.style.left = (f.left + f.width / 2 - 45) + 'px'; bolt.style.top = (f.top - 60) + 'px';
    document.body.appendChild(bolt);
    if (!bolt.animate) { bolt.remove(); return; }
    var a = bolt.animate([{ transform: 'translateY(-40px) scale(.6)', opacity: 0 }, { transform: 'translateY(30px) scale(1.2)', opacity: 1 }, { transform: 'translateY(40px) scale(1)', opacity: 0 }], { duration: 600 });
    a.onfinish = function () { bolt.remove(); };
  };

  UI.prototype.toast = function (text, ms) {
    var el = $('turn-toast');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this.toastT);
    this.toastT = setTimeout(function () { el.hidden = true; }, ms + 200);
    return sleep(Math.min(ms, 700));
  };

  UI.prototype.showBubble = function (seat, html, ms) {
    if (seat !== 'top') { this.flashHint(html.replace(/<[^>]+>/g, ''), true); return; }
    var b = $('top-bubble');
    b.innerHTML = html;
    b.hidden = false;
    clearTimeout(this.bubbleT);
    if (ms) this.bubbleT = setTimeout(function () { b.hidden = true; }, ms);
  };
  UI.prototype.hideBubble = function () { $('top-bubble').hidden = true; };

  UI.prototype.flashHint = function (text, bad) {
    var h = $('hand-hint');
    h.textContent = text;
    h.style.color = bad ? 'var(--bad)' : '';
    clearTimeout(this.hintT);
    var self = this;
    this.hintT = setTimeout(function () { h.style.color = ''; self.renderHint(); }, 2600);
  };

  // Tarjeta grande en el centro (compuesto formado, descomposición…). Se cierra sola o con un clic.
  UI.prototype.banner = function (kind, kicker, big, name, extra, ms, cards) {
    var self = this;
    var el = document.createElement('div');
    el.className = 'celebration' + (kind === 'bad' ? ' bad' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="cel-kicker">' + esc(kicker) + '</div>' +
      (cards ? '<div class="cel-cards"></div>' : '') +
      '<div class="cel-formula">' + big + '</div><div class="cel-name">' + esc(name) + '</div>' +
      (extra ? '<div class="' + (kind === 'bad' ? 'cel-who' : 'cel-points') + '">' + esc(extra) + '</div>' : '');
    if (cards) {
      var box = el.querySelector('.cel-cards');
      cards.forEach(function (c) { box.appendChild(makeCard(c, 'mini')); });
    }
    document.body.appendChild(el);
    if (el.animate && !REDUCED) el.animate([{ transform: 'translate(-50%,-50%) scale(.3) rotate(-8deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.06) rotate(2deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 450, easing: 'ease-out' });
    return new Promise(function (res) {
      var done = false;
      function finish() {
        if (done) return; done = true;
        self.skipCelebration = null;
        if (el.animate && !REDUCED) {
          var a = el.animate([{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.7)' }], { duration: 250 });
          a.onfinish = function () { el.remove(); res(); };
        } else { el.remove(); res(); }
      }
      self.skipCelebration = finish;
      el.addEventListener('click', finish);
      setTimeout(finish, REDUCED ? 1200 : ms);
    });
  };

  UI.prototype.celebrate = function (ev) {
    var f = $('flask').getBoundingClientRect();
    this.bump($('flask'), 'boom');
    this.sfx.fanfare();
    this.confetti(f.left + f.width / 2, f.top + f.height / 2, 70);
    var me = this.isMe(ev.playerIdx);
    var who = me ? t('¡Lo has formado tú!') : t('Lo ha formado {p}', { p: this.who(ev.playerIdx) });
    this.announce(t('Carga cero: {f}, {n}. {w} y gana {k} puntos.', { f: ev.key, n: ev.name, w: who, k: ev.points }));
    var self = this;
    return this.banner('good', t('¡Carga cero!'), formula(ev.formulaHTML), ev.name,
      t('+{k} puntos · {w}', { k: ev.points, w: who }), ev.quizNext ? 2300 : 2600, ev.cards).then(function () {
      return self.flyPoints(ev.playerIdx, ev.cards);
    });
  };

  UI.prototype.flyPoints = function (playerIdx, cards) {
    var self = this;
    var target = $(this.seatOf(playerIdx) + '-avatar');
    var f = $('flask').getBoundingClientRect();
    return Promise.all((cards || []).slice(0, 5).map(function (c, i) {
      return sleep(i * 70).then(function () { return self.flyCard(c, f, target, 420, true); });
    }));
  };

  // ── Reto «¡Nombra rápido!» ───────────────────────────
  UI.prototype.canAnswer = function (quiz) {
    return this.config.mode === 'LOCAL' || quiz.answeringIdx === this.localIdx;
  };

  UI.prototype.openQuiz = function (quiz) {
    var self = this;
    clearInterval(this.quizTimer);
    var rebound = quiz.phase === 'REBOUND';
    var who = this.who(quiz.answeringIdx);
    var mine = this.canAnswer(quiz);
    var seat = this.seatOf(quiz.answeringIdx);
    $('quiz-who').innerHTML = $(seat + '-avatar').innerHTML;
    $('quiz-badge').textContent = rebound ? t('¡Rebote! {p} puede robar +3', { p: who }) : t('¡Nombra rápido! +3');
    $('quiz-badge').classList.toggle('rebound', rebound);
    $('quiz-formula').innerHTML = formula(quiz.question.headerHTML);
    $('quiz-prompt').textContent = mine
      ? (this.config.mode === 'LOCAL' ? t('{q} · contesta {p}', { q: t(quiz.question.promptText), p: who }) : t(quiz.question.promptText))
      : t('{q} · está pensando {p}…', { q: t(quiz.question.promptText), p: who });

    var box = $('quiz-options');
    box.innerHTML = '';
    quiz.question.options.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="kbd-quiz" aria-hidden="true">' + (i + 1) + '</span><span>' + formula(t(o.text)) + '</span>';
      b.disabled = !mine;
      b.addEventListener('click', function () {
        if (b.disabled) return;
        box.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
        clearInterval(self.quizTimer);
        self.act({ k: 'quiz', p: quiz.answeringIdx, o: i });
      });
      box.appendChild(b);
    });
    this.openModal('modal-quiz', mine ? '#quiz-options button' : null);

    var total = this.config.quizTime ? (rebound ? Math.max(5, Math.round(this.config.quizTime * 0.6)) : this.config.quizTime) : 0;
    var timerEl = $('quiz-timer'), bar = $('quiz-timer-bar');
    bar.style.width = '100%';
    timerEl.classList.remove('hurry');
    if (!total) { timerEl.textContent = '∞'; return; }
    var left = total, step = 0.1;
    timerEl.textContent = Math.ceil(left);
    this.quizTimer = setInterval(function () {
      left -= step;
      bar.style.width = Math.max(0, left / total * 100) + '%';
      timerEl.textContent = Math.max(0, Math.ceil(left));
      timerEl.classList.toggle('hurry', left <= 3);
      if (left <= 0) {
        clearInterval(self.quizTimer);
        box.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
        // Solo decide el tiempo quien manda en la partida (en línea, el anfitrión)
        var bot = self.config.mode === 'BOT' && quiz.answeringIdx === 1;
        if (!bot && (self.config.mode !== 'P2P' || self.net.isHost)) self.act({ k: 'quiz', p: quiz.answeringIdx, o: null });
      }
    }, step * 1000);
  };

  UI.prototype.quizResult = function (ev) {
    var self = this;
    clearInterval(this.quizTimer);
    var buttons = $('quiz-options').querySelectorAll('button');
    var right = ev.question.options.findIndex(function (o) { return o.correct; });
    buttons.forEach(function (b) { b.disabled = true; });
    if (ev.chosen !== null && ev.chosen !== undefined && buttons[ev.chosen]) buttons[ev.chosen].classList.add(ev.ok ? 'right' : 'wrong');
    if (ev.ok) {
      this.sfx.good();
      var r = $('modal-quiz').querySelector('.quiz-box').getBoundingClientRect();
      this.confetti(r.left + r.width / 2, r.top + r.height / 2, 40);
      $('quiz-prompt').textContent = ev.rebound ? t('¡Rebote! {p} roba 3 puntos', { p: this.who(ev.winnerIdx) }) : t('¡Correcto! +3 puntos para {p}', { p: this.who(ev.winnerIdx) });
      this.announce($('quiz-prompt').textContent);
      return sleep(1400).then(function () { self.closeModal('modal-quiz'); });
    }
    this.sfx.bad();
    if (ev.toRebound) {
      $('quiz-prompt').textContent = ev.chosen === null ? t('¡Se acabó el tiempo! Ahora puede contestar el rival…') : t('¡Fallo! Ahora puede contestar el rival…');
      this.announce($('quiz-prompt').textContent);
      return sleep(1300);
    }
    if (buttons[right]) buttons[right].classList.add('right');
    $('quiz-prompt').textContent = t('Nadie acertó. La respuesta buena está en verde.');
    this.announce(t('Nadie acertó. Era: {r}', { r: ev.question.correctText.replace(/<\/?sub>/g, '') }));
    return sleep(2200).then(function () { self.closeModal('modal-quiz'); });
  };

  // ── Pintar la mesa ───────────────────────────────────
  UI.prototype.render = function () {
    var v = this.view;
    if (!v) return;
    var bottom = this.bottomIdx(), top = 1 - bottom;
    var bottomKey = this.config.mode === 'LOCAL' ? 'p' + bottom : (this.localIdx === 0 ? 'p0' : 'p1');
    var topKey = this.config.mode === 'BOT' ? 'bot' : (this.config.mode === 'LOCAL' ? 'p' + top : (this.localIdx === 0 ? 'p1' : 'p0'));

    $('bottom-name').textContent = v.players[bottom].name;
    $('bottom-score').textContent = v.players[bottom].score;
    $('top-name').textContent = v.players[top].name;
    $('top-score').textContent = v.players[top].score;
    if ($('bottom-avatar').dataset.k !== bottomKey) { $('bottom-avatar').innerHTML = CC.ART.avatar(bottomKey); $('bottom-avatar').dataset.k = bottomKey; }
    if ($('top-avatar').dataset.k !== topKey) { $('top-avatar').innerHTML = CC.ART.avatar(topKey); $('top-avatar').dataset.k = topKey; }

    var playing = v.status === 'PLAYING' || v.status === 'QUIZ';
    $('seat-bottom').classList.toggle('active', playing && v.turn === bottom);
    $('seat-top').classList.toggle('active', playing && v.turn === top);
    if (v.turn !== top || this.config.mode !== 'BOT' || v.status !== 'PLAYING') {
      if ($('top-bubble').querySelector('.dots')) this.hideBubble();
    }

    // Mano del rival (dorsos en abanico)
    var n = v.players[top].hand.length, backs = '';
    for (var i = 0; i < n; i++) backs += '<span class="back" style="--rot:' + ((i - (n - 1) / 2) * 7) + 'deg"></span>';
    $('top-hand').innerHTML = backs;
    $('top-hand-count').textContent = t('{p} tiene {n} cartas', { p: v.players[top].name, n: n });

    $('deck-count').textContent = v.deck.length;
    var last = v.discard[v.discard.length - 1];
    $('discard-top').innerHTML = '';
    if (last) $('discard-top').appendChild(makeCard(last));
    $('discard-count').textContent = v.discard.length;

    this.renderReactor(v.reactor);
    this.renderHand(v);
  };

  UI.prototype.renderReactor = function (r) {
    var pos = $('tray-pos-cards'), neg = $('tray-neg-cards');
    pos.innerHTML = ''; neg.innerHTML = '';
    var a = r.view || CC.GameEngine.analyze(r.atoms || []);
    var groups = a.groups || [];

    // ¿En qué bandeja va cada elemento? Metales a la izquierda, no metales a la derecha;
    // el hidrógeno, en la contraria a su pareja (o «por decidir» si va solo).
    var side = {};
    groups.forEach(function (g) {
      var cat = CC.ELEMENTS[g.symbol].category;
      if (cat === 'METAL') side[g.symbol] = 'pos';
      else if (cat === 'NON_METAL') side[g.symbol] = 'neg';
    });
    groups.forEach(function (g) {
      if (CC.ELEMENTS[g.symbol].category !== 'HYDROGEN') return;
      var other = groups.find(function (x) { return x.symbol !== g.symbol; });
      side[g.symbol] = other ? (side[other.symbol] === 'pos' ? 'neg' : 'pos') : 'pending';
    });

    (r.atoms || []).forEach(function (atom, i) {
      var phys = r.cards[i];
      var shown = phys && phys.type === 'ELEMENT' ? phys
        : { type: 'ELEMENT', symbol: atom.symbol, category: CC.ELEMENTS[atom.symbol].category, numbers: atom.numbers };
      var el = makeCard(shown, 'mini' + (phys && phys.type === 'SPECIAL' ? ' copied' : ''));
      (side[atom.symbol] === 'neg' ? neg : pos).appendChild(el);
    });
    if (!pos.children.length) pos.innerHTML = '<span class="tray-empty"></span>';
    if (!neg.children.length) neg.innerHTML = '<span class="tray-empty"></span>';
    var pendingH = groups.length === 1 && side[groups[0].symbol] === 'pending';
    if (pendingH) neg.innerHTML = '<span class="tray-pending">' + esc(t('El hidrógeno espera: ¿metal o no metal?')) + '</span>';

    // Matraz: carga neta y color del líquido
    var flask = $('flask');
    flask.classList.remove('pos', 'neg', 'zero', 'mixed', 'empty');
    var val = $('net-charge-value'), hint = $('net-charge-hint');
    var opts = a.netOptions || [0];
    var fill = Math.min(85, 18 + (r.atoms || []).length * 12);
    flask.style.setProperty('--fill', fill + '%');
    if (!r.atoms || !r.atoms.length) {
      flask.classList.add('empty'); val.textContent = '0'; hint.textContent = t('vacío');
      flask.style.setProperty('--fill', '12%');
    } else if (opts.length === 1) {
      val.textContent = signed(opts[0]); hint.textContent = '';
      flask.classList.add(opts[0] > 0 ? 'pos' : (opts[0] < 0 ? 'neg' : 'zero'));
    } else {
      val.textContent = '?';
      hint.textContent = opts.map(signed).join(t(' o '));
      flask.classList.add('mixed');
    }

    // Fórmula en marcha
    var f = $('reactor-formula');
    if (!groups.length) f.textContent = t('Echa una carta para empezar');
    else {
      var ordered = groups.slice().sort(function (x, y) { return (side[x.symbol] === 'neg') - (side[y.symbol] === 'neg'); });
      f.innerHTML = ordered.map(function (g) { return esc(g.symbol) + (g.count > 1 ? '<sub>' + g.count + '</sub>' : ''); }).join('') + (groups.length === 1 ? ' + ?' : '');
    }
    var s = Math.min(3, r.stagnation || 0), flames = '';
    for (var i = 0; i < 3; i++) flames += '<span class="flame' + (i < s ? ' on' : '') + '">🔥</span>';
    $('stagnation-dots').innerHTML = s ? flames : '';
    $('stagnation-text').textContent = s ? t('Inestabilidad: {n} de 3', { n: s }) : '';
  };

  UI.prototype.renderHint = function () {
    var v = this.view, h = $('hand-hint');
    if (!v) return;
    if (v.status !== 'PLAYING') h.textContent = '';
    else if (v.turn !== this.myIdx() || !this.isIdle()) h.textContent = this.config.mode === 'LOCAL' ? '' : t('Turno de {p}…', { p: v.players[v.turn].name });
    else if (this.selected.size) h.textContent = t('Marcadas: {n}. Pulsa «Combo» o «Cambiar».', { n: this.selected.size });
    else if (this.stuck) h.textContent = v.deck.length ? t('Ninguna carta encaja. Marca hasta 3 y pulsa «Cambiar» para robar otras.')
      : t('Ninguna carta encaja y el mazo se ha acabado. Marca cartas y pulsa «Descartar»: la partida termina cuando alguien se queda sin cartas.');
    else h.textContent = v.reactor.status === 'EMPTY' ? t('Echa una carta para empezar un compuesto.') : t('¡Te toca! Echa una carta al reactor.');
  };

  UI.prototype.renderHand = function (v) {
    var self = this;
    var me = this.bottomIdx();
    var hand = v.players[me].hand;
    var box = $('player-hand');
    var can = this.canAct();

    var curtain = this.config.mode === 'LOCAL' && this.curtain && v.status === 'PLAYING';
    $('local-privacy-curtain').hidden = !curtain;
    if (curtain) {
      $('local-curtain-title').textContent = t('¡Turno de {p}! Pásale el dispositivo.', { p: v.players[v.turn].name });
      $('curtain-avatar').innerHTML = CC.ART.avatar('p' + v.turn);
    }

    var focusId = document.activeElement && document.activeElement.closest ? (document.activeElement.closest('#player-hand .gcard') || {}).dataset : null;
    focusId = focusId && focusId.id;
    var focusMark = document.activeElement && document.activeElement.classList.contains('gc-mark');
    box.innerHTML = '';
    box.classList.toggle('waiting', !can);
    this.stuck = can && !hand.some(function (c) { return self.engine.canPlayCard(c).valid; });
    box.classList.toggle('stuck', this.stuck);
    $('btn-recycle').classList.toggle('pulse', this.stuck);

    hand.forEach(function (card, i) {
      var check = can ? self.engine.canPlayCard(card) : { valid: false };
      var sel = self.selected.has(card.id);
      var el = makeCard(card, (can ? (check.valid ? 'playable' : 'unplayable') : '') + (sel ? ' selected' : '') + (can && check.closes ? ' closes' : ''), { key: i + 1 });
      el.dataset.id = card.id;
      el.style.setProperty('--rot', ((i - (hand.length - 1) / 2) * 4) + 'deg');
      el.style.setProperty('--lift', (Math.abs(i - (hand.length - 1) / 2) * 6) + 'px');
      // La cara de la carta es un botón (teclado y lector de pantalla)
      var top = el.querySelector('.gc-top'), bottom = el.querySelector('.gc-bottom');
      var face = document.createElement('button');
      face.type = 'button';
      face.className = 'gcard-face';
      face.setAttribute('aria-label', t('Carta {i}: {d}', { i: i + 1, d: spoken(card) }) +
        (can && !check.valid ? '. ' + t('Ahora no se puede: {r}', { r: check.reason || '' }) : '') +
        (can && check.closes ? '. ' + t('¡Cierra el compuesto!') : ''));
      face.appendChild(top); face.appendChild(bottom);
      el.insertBefore(face, el.firstChild);
      var mark = document.createElement('button');
      mark.type = 'button';
      mark.className = 'gc-mark';
      mark.setAttribute('aria-pressed', String(sel));
      mark.setAttribute('aria-label', t('Marcar la carta {i}', { i: i + 1 }));
      mark.textContent = sel ? t('✓ Marcada') : t('Marcar');
      el.appendChild(mark);
      face.addEventListener('click', function () { if (self.canAct()) self.onCardClick(card); });
      mark.addEventListener('click', function () { if (self.canAct()) self.toggleSelect(card.id); });
      box.appendChild(el);
    });
    if (focusId) {
      var again = box.querySelector('.gcard[data-id="' + focusId + '"] ' + (focusMark ? '.gc-mark' : '.gcard-face'));
      if (again) again.focus();
    }

    var n = this.selected.size;
    $('btn-recycle').disabled = !can || n === 0 || n > 3;
    var noDeck = !v.deck.length;
    $('btn-recycle').textContent = noDeck ? (n ? t('Descartar ({n})', { n: n }) : t('Descartar'))
                                          : (n ? t('↻ Cambiar ({n})', { n: n }) : t('↻ Cambiar'));
    var combo = can && n >= 2 && this.engine.comboCheck(me, Array.from(this.selected)).valid;
    $('btn-play-combo').hidden = !combo;
    this.renderHint();
  };

  UI.prototype.toggleSelect = function (id) {
    if (this.selected.has(id)) this.selected.delete(id);
    else if (this.selected.size < 5) this.selected.add(id);
    this.render();
  };

  UI.prototype.onCardClick = function (card) {
    var self = this;
    var check = this.engine.canPlayCard(card);
    if (!check.valid) {
      this.sfx.bad();
      var el = document.querySelector('#player-hand .gcard[data-id="' + card.id + '"]');
      if (el && el.animate) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 });
      this.flashHint(check.reason || t('Esa carta no se puede echar ahora.'), true);
      return;
    }
    if (card.specialType === 'ISOTOPE' && check.isotopeOptions.length > 1) {
      var box = $('choice-options');
      box.innerHTML = '';
      check.isotopeOptions.forEach(function (sym) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip big';
        b.textContent = t(CC.ELEMENTS[sym].name) + ' (' + sym + ')';
        b.addEventListener('click', function () { self.closeModal('modal-choice'); self.selected.clear(); self.act({ k: 'play', p: self.myIdx(), id: card.id, iso: sym }); });
        box.appendChild(b);
      });
      this.openModal('modal-choice');
      return;
    }
    this.selected.clear();
    this.act({ k: 'play', p: this.myIdx(), id: card.id });
  };

  // ── Fin ──────────────────────────────────────────────
  UI.prototype.renderGameOver = function (v) {
    var self = this;
    var p = v.players;
    var win = p[0].score === p[1].score ? -1 : (p[0].score > p[1].score ? 0 : 1);
    var title = win === -1 ? t('¡Empate!')
      : (this.isMe(win) ? t('¡Has ganado!') : (this.config.mode === 'LOCAL' ? t('¡Gana {p}!', { p: p[win].name }) : t('Gana {p}… ¡la próxima es tuya!', { p: p[win].name })));
    $('gameover-title').textContent = title;
    var keys = [this.config.mode === 'BOT' ? 'p0' : 'p0', this.config.mode === 'BOT' ? 'bot' : 'p1'];
    $('gameover-podium').innerHTML = [0, 1].map(function (i) {
      return '<div class="podium-p' + (i === win ? ' win' : '') + '"><span class="pa">' + CC.ART.avatar(keys[i]) + '</span><b>' + p[i].score + '</b><span>' + esc(p[i].name) + '</span></div>';
    }).join('');
    $('gameover-compounds-list').innerHTML = v.synthesizedHistory.length
      ? v.synthesizedHistory.map(function (h) {
          return '<li><span><b>' + formula(h.formulaHTML) + '</b> · ' + esc(h.name) + '</span><small>' + esc(h.playerName) + ' · +' + h.points + '</small></li>';
        }).join('')
      : '<li>' + esc(t('No se formó ningún compuesto.')) + '</li>';
    this.openModal('modal-gameover', '#btn-play-again');
    if (win !== -1 && (this.isMe(win) || this.config.mode === 'LOCAL')) {
      this.sfx.fanfare();
      setTimeout(function () { self.confetti(window.innerWidth / 2, window.innerHeight / 3, 120); }, 200);
    }
    this.announce(title);
  };

  UI.prototype.copyReport = function () {
    var v = this.view;
    if (!v) return;
    var text = [
      t('Carga cero ({n}): resumen de la partida', { n: this.config.level === 'BASIC' ? t('nivel básico') : t('nivel avanzado') }),
      v.players[0].name + ': ' + v.players[0].score + ' · ' + v.players[1].name + ': ' + v.players[1].score,
      t('Cuaderno: {a} de {b} compuestos', { a: this.codexCount(), b: TOTAL }),
      t('Compuestos formados:')
    ].concat(v.synthesizedHistory.length
      ? v.synthesizedHistory.map(function (c) { return '- ' + c.key + ' (' + c.name + ') · ' + c.playerName + ', +' + c.points; })
      : ['- ' + t('ninguno')]).join('\n');
    var btn = $('btn-copy-report');
    function done() { btn.textContent = t('✓ Copiado'); setTimeout(function () { btn.textContent = t('📋 Copiar resumen'); }, 2200); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* sin portapapeles */ }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  };

  // ── Temas ────────────────────────────────────────────
  UI.prototype.setupThemes = function () {
    var btn = $('theme-btn'), panel = $('theme-panel'), opts = document.querySelectorAll('.theme-opt');
    function close() { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.classList.toggle('open');
      panel.setAttribute('aria-hidden', String(!open));
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) { if (!panel.contains(e.target) && !btn.contains(e.target)) close(); });
    function apply(th) {
      document.body.classList.remove('theme-dia', 'theme-contrast');
      if (th !== 'noche') document.body.classList.add('theme-' + th);
      opts.forEach(function (o) { o.classList.toggle('active', o.dataset.theme === th); });
      try { localStorage.setItem('sim-carga-cero-tema', th); } catch (e) { /* nada */ }
    }
    opts.forEach(function (o) { o.addEventListener('click', function () { apply(o.dataset.theme); close(); }); });
    var p = new URLSearchParams(location.search).get('tema');
    var map = { claro: 'dia', dia: 'dia', 'día': 'dia', oscuro: 'noche', noche: 'noche', contraste: 'contrast', contrast: 'contrast' };
    var saved = null;
    try { saved = localStorage.getItem('sim-carga-cero-tema'); } catch (e) { /* nada */ }
    if (map[p]) apply(map[p]); else if (saved && /^(noche|dia|contrast)$/.test(saved)) apply(saved);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { CC.ui = new UI(); });
  else CC.ui = new UI();
})();
