// Dibujos del juego (SVG en línea, sin archivos externos): un objeto cotidiano para cada
// elemento, las cartas especiales y los avatares de los jugadores.
window.CC = window.CC || {};

(function () {
  function svg(body, vb) {
    return '<svg viewBox="' + (vb || '0 0 64 64') + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  var ICONS = {
    // Hidrógeno: globo (el gas más ligero)
    H: svg('<path d="M32 6c-11 0-19 8.5-19 19 0 12 10 20 17 23l-2 4h8l-2-4c7-3 17-11 17-23 0-10.5-8-19-19-19z" fill="#b48cff" stroke="#5b2fb0" stroke-width="2.5"/>' +
           '<ellipse cx="24" cy="20" rx="4" ry="7" fill="#fff" opacity=".55" transform="rotate(25 24 20)"/>' +
           '<path d="M32 52c-3 4 3 6 0 10" stroke="#5b2fb0" stroke-width="2" fill="none" stroke-linecap="round"/>'),
    // Sodio: farola de luz amarilla
    Na: svg('<path d="M30 30h4v28h-4z" fill="#5d6680"/><rect x="22" y="56" width="20" height="4" rx="2" fill="#3d4560"/>' +
            '<path d="M18 22 32 8l14 14z" fill="#3d4560"/><path d="M22 22h20l-4 10H26z" fill="#ffd84a" stroke="#c99a00" stroke-width="2"/>' +
            '<path d="M14 40l8-6M50 40l-8-6M32 40v-4" stroke="#ffd84a" stroke-width="3" stroke-linecap="round" opacity=".8"/>'),
    // Potasio: plátano
    K: svg('<path d="M12 18c4 24 22 36 42 30-2-3-5-4-8-4-14 2-26-8-28-26z" fill="#ffd23f" stroke="#b98a00" stroke-width="2.5" stroke-linejoin="round"/>' +
           '<path d="M12 18l-2-6 5 1z" fill="#6b4f1d"/><path d="M22 26c4 10 12 15 22 15" stroke="#e6b400" stroke-width="2" fill="none"/>'),
    // Calcio: hueso
    Ca: svg('<g transform="rotate(-35 32 32)"><rect x="16" y="27" width="32" height="10" fill="#fff6e0" stroke="#b79a6a" stroke-width="2.5"/>' +
            '<circle cx="14" cy="26" r="7" fill="#fff6e0" stroke="#b79a6a" stroke-width="2.5"/><circle cx="14" cy="38" r="7" fill="#fff6e0" stroke="#b79a6a" stroke-width="2.5"/>' +
            '<circle cx="50" cy="26" r="7" fill="#fff6e0" stroke="#b79a6a" stroke-width="2.5"/><circle cx="50" cy="38" r="7" fill="#fff6e0" stroke="#b79a6a" stroke-width="2.5"/>' +
            '<rect x="15" y="28.5" width="34" height="7" fill="#fff6e0"/></g>'),
    // Magnesio: bengala
    Mg: svg('<path d="M14 54 34 30" stroke="#8a8fa8" stroke-width="4" stroke-linecap="round"/>' +
            '<path d="M38 26l3-12 3 12 12 3-12 3-3 12-3-12-12-3z" fill="#fff" stroke="#ffd84a" stroke-width="2.5" stroke-linejoin="round"/>' +
            '<circle cx="22" cy="18" r="2.5" fill="#ffd84a"/><circle cx="54" cy="44" r="2.5" fill="#ffd84a"/><circle cx="52" cy="12" r="2" fill="#ff9a4a"/>'),
    // Aluminio: lata
    Al: svg('<rect x="18" y="10" width="28" height="46" rx="6" fill="#d9e1ee" stroke="#6b7a94" stroke-width="2.5"/>' +
            '<rect x="18" y="22" width="28" height="20" fill="#ff5d73"/><path d="M24 32h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
            '<ellipse cx="32" cy="12" rx="12" ry="3" fill="#b8c3d6"/><rect x="29" y="9" width="7" height="3" rx="1.5" fill="#6b7a94"/>'),
    // Hierro: imán
    Fe: svg('<path d="M14 12h12v20a6 6 0 0 0 12 0V12h12v20a18 18 0 0 1-36 0z" fill="#e8453c" stroke="#8a1f1a" stroke-width="2.5" stroke-linejoin="round"/>' +
            '<rect x="14" y="12" width="12" height="9" fill="#c9ced8" stroke="#5d6680" stroke-width="2.5"/><rect x="38" y="12" width="12" height="9" fill="#c9ced8" stroke="#5d6680" stroke-width="2.5"/>' +
            '<path d="M8 6l4 3M56 6l-4 3M32 4v4" stroke="#8a8fa8" stroke-width="2.5" stroke-linecap="round"/>'),
    // Cobre: moneda
    Cu: svg('<circle cx="32" cy="33" r="22" fill="#d9824a" stroke="#8a4a1f" stroke-width="2.5"/><circle cx="32" cy="33" r="16" fill="none" stroke="#f2a873" stroke-width="2"/>' +
            '<text x="32" y="40" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="700" font-size="18" fill="#8a4a1f">1¢</text>' +
            '<ellipse cx="24" cy="22" rx="5" ry="3" fill="#fff" opacity=".35" transform="rotate(-30 24 22)"/>'),
    // Cloro: piscina
    Cl: svg('<rect x="8" y="30" width="48" height="24" rx="5" fill="#4fd1e8" stroke="#1683a0" stroke-width="2.5"/>' +
            '<path d="M8 38c6-4 10 4 16 0s10 4 16 0 10 4 16 0" stroke="#fff" stroke-width="2.5" fill="none"/>' +
            '<path d="M40 30V12a5 5 0 0 1 10 0M48 30V12" stroke="#8a8fa8" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M40 18h8M40 25h8" stroke="#8a8fa8" stroke-width="2.5"/>'),
    // Azufre: volcán
    S: svg('<path d="M6 56 24 22h16l18 34z" fill="#8a6a4a" stroke="#5a4028" stroke-width="2.5" stroke-linejoin="round"/>' +
           '<path d="M24 22h16l-4 8-4-4-4 6z" fill="#ffd23f"/>' +
           '<circle cx="26" cy="12" r="5" fill="#ffe680"/><circle cx="35" cy="9" r="6" fill="#fff2a8"/><circle cx="43" cy="14" r="4" fill="#ffe680"/>'),
    // Oxígeno: burbujas
    O: svg('<circle cx="26" cy="36" r="15" fill="#bfe9ff" stroke="#2a8ad6" stroke-width="2.5"/><circle cx="46" cy="20" r="9" fill="#bfe9ff" stroke="#2a8ad6" stroke-width="2.5"/>' +
           '<circle cx="47" cy="47" r="6" fill="#bfe9ff" stroke="#2a8ad6" stroke-width="2.5"/><path d="M18 30a9 9 0 0 1 7-6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>' +
           '<path d="M42 16a5 5 0 0 1 4-3" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>'),
    CATALYST: svg('<path d="M24 10l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="#ffd84a" stroke="#b98a00" stroke-width="2.5" stroke-linejoin="round"/>' +
                  '<path d="M44 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff2a8" stroke="#b98a00" stroke-width="2.5" stroke-linejoin="round"/>'),
    ELECTROLYSIS: svg('<path d="M36 4 14 36h14l-4 24 26-36H36z" fill="#ffd84a" stroke="#b98a00" stroke-width="2.5" stroke-linejoin="round"/>'),
    ISOTOPE: svg('<ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#ff8a3d" stroke-width="3"/>' +
                 '<ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#3da5ff" stroke-width="3" transform="rotate(60 32 32)"/>' +
                 '<ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#a66bff" stroke-width="3" transform="rotate(-60 32 32)"/>' +
                 '<circle cx="32" cy="32" r="9" fill="#ffd84a" stroke="#b98a00" stroke-width="2.5"/>' +
                 '<text x="32" y="37" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="700" font-size="13" fill="#6b4f00">?</text>')
  };

  // Avatares: un matraz robot para el ordenador y átomos sonrientes para las personas.
  var AVATARS = {
    bot: svg('<rect x="22" y="4" width="20" height="10" rx="3" fill="#8a8fa8"/><circle cx="32" cy="3" r="3" fill="#ff5d73"/>' +
             '<path d="M24 14h16v12l14 24a6 6 0 0 1-5 9H15a6 6 0 0 1-5-9l14-24z" fill="#e9f2ff" stroke="#3d4560" stroke-width="2.5" stroke-linejoin="round"/>' +
             '<path d="M14 44c8-4 14 4 22 0s12-3 16 0l2 4a6 6 0 0 1-5 9H15a6 6 0 0 1-5-9z" fill="#2ee6a6"/>' +
             '<circle cx="26" cy="34" r="4" fill="#1d1b3a"/><circle cx="38" cy="34" r="4" fill="#1d1b3a"/><circle cx="27" cy="33" r="1.3" fill="#fff"/><circle cx="39" cy="33" r="1.3" fill="#fff"/>' +
             '<circle cx="24" cy="51" r="2" fill="#fff" opacity=".7"/><circle cx="40" cy="49" r="1.5" fill="#fff" opacity=".7"/>'),
    p0: atomFace('#ff8a3d', '#ffd84a'),
    p1: atomFace('#3da5ff', '#a66bff')
  };

  function atomFace(c1, c2) {
    return svg('<ellipse cx="32" cy="32" rx="28" ry="11" fill="none" stroke="' + c1 + '" stroke-width="3.5"/>' +
               '<ellipse cx="32" cy="32" rx="28" ry="11" fill="none" stroke="' + c2 + '" stroke-width="3.5" transform="rotate(60 32 32)"/>' +
               '<circle cx="32" cy="32" r="15" fill="#fff6e0" stroke="#1d1b3a" stroke-width="2.5"/>' +
               '<circle cx="26.5" cy="30" r="2.6" fill="#1d1b3a"/><circle cx="37.5" cy="30" r="2.6" fill="#1d1b3a"/>' +
               '<path d="M25 37q7 6 14 0" stroke="#1d1b3a" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
               '<circle cx="23" cy="35" r="2.5" fill="#ff8aa0" opacity=".7"/><circle cx="41" cy="35" r="2.5" fill="#ff8aa0" opacity=".7"/>');
  }

  CC.ART = {
    icon: function (card) { return ICONS[card.type === 'SPECIAL' ? card.specialType : card.symbol] || ''; },
    iconFor: function (key) { return ICONS[key] || ''; },
    avatar: function (key) { return AVATARS[key] || AVATARS.p0; },
    // Objeto que se ve en cada carta (para el lector de pantalla y la ayuda)
    caption: {
      H: 'globo', Na: 'farola de sodio', K: 'plátano', Ca: 'hueso', Mg: 'bengala', Al: 'lata',
      Fe: 'imán', Cu: 'moneda', Cl: 'piscina', S: 'volcán', O: 'burbujas'
    }
  };
})();
