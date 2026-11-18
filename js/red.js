// Partida en línea entre dos dispositivos con un código de 4 caracteres.
// Usa PeerJS (copiado en js/vendor/, no desde un CDN) y el servidor público gratuito
// de PeerJS solo para que los dos dispositivos se encuentren; después la partida va
// directamente de uno a otro (WebRTC). PeerJS solo se carga si se elige este modo.
window.CC = window.CC || {};

(function () {
  function t(s, v) { return window.i18n ? window.i18n.t(s, v) : s; }

  var PEER_PREFIX = 'simulaciencia-cargacero-';
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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

  function generateRoomCode() {
    var code = '';
    var rnd = new Uint32Array(4);
    (window.crypto || window.msCrypto).getRandomValues(rnd);
    for (var i = 0; i < 4; i++) code += CODE_CHARS.charAt(rnd[i] % CODE_CHARS.length);
    return code;
  }

  function NetworkManager(onStatus, onData) {
    this.onStatus = onStatus;
    this.onData = onData;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = '';
  }

  NetworkManager.prototype.createRoom = function (onConnected) {
    var self = this;
    this.destroy();
    this.onStatus(t('Preparando la sala…'), false);
    loadPeerJS().then(function () {
      self.isHost = true;
      self.roomCode = generateRoomCode();
      self.peer = new window.Peer(PEER_PREFIX + self.roomCode);
      self.peer.on('open', function () {
        self.onStatus(t('Sala creada. Código: {c}. Esperando al rival…', { c: self.roomCode }), false, self.roomCode);
      });
      self.peer.on('connection', function (connection) {
        if (self.conn) { connection.close(); return; }
        self.conn = connection;
        self.setupConnection(onConnected);
      });
      self.peer.on('error', function (err) {
        self.onStatus(t('Error de conexión ({e}). Prueba a crear otra sala.', { e: err.type }), true);
      });
    }, function () {
      self.onStatus(t('No se pudo cargar el modo en línea. Comprueba la conexión a internet.'), true);
    });
  };

  NetworkManager.prototype.joinRoom = function (rawCode, onConnected) {
    var self = this;
    this.destroy();
    var code = (rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { this.onStatus(t('Escribe un código de 4 caracteres.'), true); return; }
    this.onStatus(t('Conectando con la sala {c}…', { c: code }), false);
    loadPeerJS().then(function () {
      self.isHost = false;
      self.roomCode = code;
      self.peer = new window.Peer();
      self.peer.on('open', function () {
        self.conn = self.peer.connect(PEER_PREFIX + code, { reliable: true });
        self.setupConnection(onConnected);
      });
      self.peer.on('error', function (err) {
        self.onStatus(err.type === 'peer-unavailable'
          ? t('No hay ninguna sala con el código {c}.', { c: code })
          : t('No se pudo conectar con la sala {c} ({e}).', { c: code, e: err.type }), true);
      });
    }, function () {
      self.onStatus(t('No se pudo cargar el modo en línea. Comprueba la conexión a internet.'), true);
    });
  };

  NetworkManager.prototype.setupConnection = function (onConnected) {
    var self = this;
    this.conn.on('open', function () {
      self.onStatus(t('Conectados en la sala {c}.', { c: self.roomCode }), false);
      if (onConnected) onConnected();
    });
    this.conn.on('data', function (data) { if (self.onData && data && typeof data === 'object') self.onData(data); });
    this.conn.on('close', function () { self.onStatus(t('El rival se ha desconectado.'), true); });
    this.conn.on('error', function () { self.onStatus(t('Se ha cortado la conexión.'), true); });
  };

  NetworkManager.prototype.send = function (payload) {
    if (this.conn && this.conn.open) this.conn.send(payload);
  };

  NetworkManager.prototype.destroy = function () {
    if (this.conn) { try { this.conn.close(); } catch (e) { /* ya cerrada */ } this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ya cerrado */ } this.peer = null; }
    this.isHost = false;
    this.roomCode = '';
  };

  CC.NetworkManager = NetworkManager;
})();
