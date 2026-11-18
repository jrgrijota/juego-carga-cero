// Partida en línea entre dos dispositivos con un código de 4 caracteres.
//
// Por la red solo viajan las jugadas (unos pocos bytes): los dos dispositivos tienen el
// mismo motor con la misma semilla y aplican las mismas jugadas en el mismo orden.
// El anfitrión es el árbitro: recibe las jugadas del invitado, las comprueba y las
// reenvía numeradas a los dos.
//
// Dos caminos para conectarse:
//  1. Directo (WebRTC con PeerJS, copiado en js/vendor/). Es lo más rápido, pero muchas
//     redes de centros y de móviles lo bloquean.
//  2. Si en unos segundos no hay conexión directa, por un buzón público (ntfy.sh, por
//     HTTPS en el puerto 443, que casi nunca está bloqueado). Por él pasan solo las
//     jugadas y el código de sala: ni nombres ni datos del alumnado.
window.CC = window.CC || {};

(function () {
  function t(s, v) { return window.i18n ? window.i18n.t(s, v) : s; }

  var PEER_PREFIX = 'simulaciencia-cargacero-';
  var RELAY = 'ntfy.sh';
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var DIRECT_TIMEOUT = 6000;
  var peerLoading = null;

  function loadPeerJS() {
    if (window.Peer) return Promise.resolve();
    if (peerLoading) return peerLoading;
    peerLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/vendor/peerjs.min.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { peerLoading = null; reject(); };
      document.head.appendChild(s);
    });
    return peerLoading;
  }

  function randomCode() {
    var rnd = new Uint32Array(4), code = '';
    window.crypto.getRandomValues(rnd);
    for (var i = 0; i < 4; i++) code += CODE_CHARS.charAt(rnd[i] % CODE_CHARS.length);
    return code;
  }
  function randomId() {
    var rnd = new Uint32Array(2);
    window.crypto.getRandomValues(rnd);
    return rnd[0].toString(36) + rnd[1].toString(36);
  }
  function topicFor(code) {
    var d = new Date();
    return 'simulaciencia-cargacero-' + code + '-' + d.getUTCFullYear() + (d.getUTCMonth() + 1) + d.getUTCDate();
  }

  // ── Buzón ntfy.sh: suscripción por WebSocket y envío por POST ──
  function Relay(code, onMessage, onOpen, onError) {
    this.topic = topicFor(code);
    this.me = randomId();
    this.onMessage = onMessage;
    this.lastId = null;
    this.closed = false;
    this.retries = 0;
    this.connect(onOpen, onError);
  }
  Relay.prototype.connect = function (onOpen, onError) {
    var self = this;
    var url = 'wss://' + RELAY + '/' + this.topic + '/ws' + (this.lastId ? '?since=' + this.lastId : '');
    try { this.ws = new WebSocket(url); } catch (e) { if (onError) onError(); return; }
    this.ws.onopen = function () { self.retries = 0; if (onOpen) { onOpen(); onOpen = null; } };
    this.ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event !== 'message' || !m.message) return;
      self.lastId = m.id;
      var data;
      try { data = JSON.parse(m.message); } catch (e) { return; }
      if (!data || data.from === self.me) return;
      self.onMessage(data);
    };
    this.ws.onclose = function () {
      if (self.closed) return;
      if (self.retries++ < 5) setTimeout(function () { if (!self.closed) self.connect(null, onError); }, 1000 * self.retries);
      else if (onError) onError();
    };
  };
  // Los envíos van en fila, uno detrás de otro, para que lleguen en el mismo orden
  Relay.prototype.send = function (obj) {
    var self = this;
    obj.from = this.me;
    var body = JSON.stringify(obj);
    this.queue = (this.queue || Promise.resolve()).then(function () {
      if (self.closed) return;
      return fetch('https://' + RELAY + '/' + self.topic, { method: 'POST', body: body }).catch(function () {});
    });
    return this.queue;
  };
  Relay.prototype.close = function () { this.closed = true; try { this.ws.close(); } catch (e) { /* ya cerrado */ } };

  // ── Gestor de la conexión ──
  function NetworkManager(onStatus, onData) {
    this.onStatus = onStatus;
    this.onData = onData;
    this.reset();
  }

  NetworkManager.prototype.reset = function () {
    this.peer = null; this.conn = null; this.relay = null;
    this.channel = null;        // 'direct' o 'relay'
    this.isHost = false;
    this.roomCode = '';
    this.connected = false;
    clearTimeout(this.timer);
  };

  NetworkManager.prototype.status = function (msg, err, code) { if (this.onStatus) this.onStatus(msg, err, code); };

  NetworkManager.prototype.markConnected = function (channel, onConnected) {
    if (this.connected) return;
    this.connected = true;
    this.channel = channel;
    clearTimeout(this.timer);
    // Cerrar el camino que no se usa
    if (channel === 'relay' && this.peer) { try { this.peer.destroy(); } catch (e) { /* nada */ } this.peer = null; }
    if (channel === 'direct' && this.relay) { this.relay.close(); this.relay = null; }
    this.status(channel === 'direct' ? t('¡Conectados! (directo)') : t('¡Conectados! (por internet)'), false);
    if (onConnected) onConnected();
  };

  NetworkManager.prototype.receive = function (data) {
    if (!data || typeof data !== 'object') return;
    if (this.onData) this.onData(data);
  };

  NetworkManager.prototype.createRoom = function (onConnected) {
    var self = this;
    this.destroy();
    this.isHost = true;
    this.roomCode = randomCode();
    this.status(t('Sala creada. Dile este código a tu rival:'), false, this.roomCode);

    // Buzón: el invitado saluda con HELLO y el anfitrión contesta WELCOME
    this.relay = new Relay(this.roomCode, function (data) {
      if (data.t === 'HELLO' && !self.connected) {
        self.relay.send({ t: 'WELCOME' });
        self.markConnected('relay', onConnected);
      } else if (self.channel === 'relay') self.receive(data);
    }, null, function () {
      if (!self.connected) self.status(t('No se pudo abrir la sala por internet. Comprueba la conexión.'), true);
    });

    // Conexión directa, por si el otro dispositivo la consigue
    loadPeerJS().then(function () {
      if (self.connected || !self.isHost) return;
      self.peer = new window.Peer(PEER_PREFIX + self.roomCode);
      self.peer.on('connection', function (conn) {
        if (self.connected) { conn.close(); return; }
        conn.on('open', function () {
          self.conn = conn;
          conn.on('data', function (d) { self.receive(d); });
          conn.on('close', function () { if (self.channel === 'direct') self.status(t('El rival se ha desconectado.'), true); });
          self.markConnected('direct', onConnected);
        });
      });
      self.peer.on('error', function () { /* sin conexión directa: queda el buzón */ });
    }, function () { /* sin PeerJS: queda el buzón */ });
  };

  NetworkManager.prototype.joinRoom = function (rawCode, onConnected) {
    var self = this;
    this.destroy();
    var code = (rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { this.status(t('Escribe un código de 4 caracteres.'), true); return; }
    this.isHost = false;
    this.roomCode = code;
    this.status(t('Conectando con la sala {c}…', { c: code }), false);

    function useRelay() {
      if (self.connected || self.relay) return;
      if (self.peer) { try { self.peer.destroy(); } catch (e) { /* nada */ } self.peer = null; }
      self.status(t('Probando otra forma de conectar…'), false);
      self.relay = new Relay(code, function (data) {
        // Cualquier mensaje del anfitrión vale como bienvenida (por si llega antes que WELCOME)
        if (!self.connected && data.t !== 'HELLO') self.markConnected('relay', onConnected);
        if (self.channel === 'relay' && data.t !== 'WELCOME') self.receive(data);
      }, function () {
        self.relay.send({ t: 'HELLO' });
        self.timer = setTimeout(function () {
          if (!self.connected) self.status(t('No hay respuesta de la sala {c}. ¿Está bien escrito el código y la sala sigue abierta?', { c: code }), true);
        }, 12000);
      }, function () {
        if (!self.connected) self.status(t('No se pudo conectar. Comprueba la conexión a internet.'), true);
      });
    }

    this.timer = setTimeout(useRelay, DIRECT_TIMEOUT);
    loadPeerJS().then(function () {
      if (self.connected || self.relay) return;
      self.peer = new window.Peer();
      self.peer.on('open', function () {
        var conn = self.peer.connect(PEER_PREFIX + code, { reliable: true });
        conn.on('open', function () {
          self.conn = conn;
          conn.on('data', function (d) { self.receive(d); });
          conn.on('close', function () { if (self.channel === 'direct') self.status(t('El rival se ha desconectado.'), true); });
          self.markConnected('direct', onConnected);
        });
      });
      self.peer.on('error', function () { clearTimeout(self.timer); useRelay(); });
    }, useRelay);
  };

  NetworkManager.prototype.send = function (payload) {
    if (this.channel === 'direct' && this.conn && this.conn.open) this.conn.send(payload);
    else if (this.channel === 'relay' && this.relay) this.relay.send(payload);
  };

  NetworkManager.prototype.destroy = function () {
    if (this.conn) { try { this.conn.close(); } catch (e) { /* nada */ } }
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* nada */ } }
    if (this.relay) this.relay.close();
    this.reset();
  };

  CC.NetworkManager = NetworkManager;
})();
