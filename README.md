# Carga cero — Juego de formulación

Juego de cartas para practicar la formulación y la nomenclatura de **compuestos binarios** (óxidos, cloruros, sulfuros, hidruros y compuestos del hidrógeno con no metales). Forma parte de [SimulaCiencia](https://simulaciencia.es).

Cada carta es un elemento con **todos** sus números de oxidación (el hierro trae +2 y +3; el hidrógeno, +1 y −1). Los jugadores echan cartas al reactor y, en cuanto **la carga neta llega a cero**, el compuesto se forma solo: el juego elige el número de oxidación que encaja. Si tiene 3 átomos o más, hay que nombrarlo o formularlo en un reto rápido («Nombra rápido»), y si se falla el rival puede robar los puntos.

Cada jugada se ve: las cartas vuelan a la mesa, el robot dice lo que hace en un bocadillo y cada compuesto formado se celebra en el centro con sus cartas, su fórmula y su nombre.

## Modos

- **Nivel básico:** retos con nombres con prefijos (dicloruro de calcio).
- **Nivel avanzado:** también retos con el nombre con número de oxidación, como óxido de hierro(III).
- **Rival:** el ordenador (Aprendiz, Químico o Nobel), dos jugadores por turnos en el mismo dispositivo (con cortina para no ver la mano del otro) o en línea con un código de 4 caracteres.
- **Opciones:** tiempo para responder (8 s, 15 s o sin límite) y cartas con el símbolo o el nombre ocultos para practicar.
- **Cuaderno:** los 39 compuestos que se pueden formar, con un dato curioso de cada uno. Se guarda en el navegador.

## Cómo abrirlo

Abre `index.html` en el navegador (funciona sin servidor y sin conexión, salvo el modo en línea).

- Tema: Noche (por defecto), Día o Alto contraste, con el botón de la paleta o con `?tema=noche`, `?tema=dia` o `?tema=contraste`.
- Idiomas: de momento solo en español (ver «Pendiente»).

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Panel, tablero y ventanas |
| `css/style.css` | Estilos y los tres temas (con variables CSS) |
| `css/fonts/fredoka.woff2` | Letra Fredoka (licencia SIL OFL en `fredoka-OFL.txt`) |
| `js/elementos.js` | Elementos de la baraja, cartas especiales y catálogo de 39 compuestos |
| `js/nomenclatura.js` | Nombres con prefijos y con número de oxidación, y preguntas de los retos |
| `js/arte.js` | Dibujos de las cartas y de los personajes (SVG) |
| `js/motor.js` | Reglas, baraja, combos, retos y jugador automático; avisa de cada jugada para animarla |
| `js/red.js` | Modo en línea: conexión directa y, si falla, por un buzón en internet |
| `js/interfaz.js` | Mesa, animaciones, ventanas, teclado, sonido y temas |
| `js/i18n.js`, `js/sello.js`, `js/estadisticas.js`, `favicon.svg` | Comunes a todas las simulaciones, sin cambios |
| `js/vendor/peerjs.min.js` | PeerJS 1.5.4 (licencia MIT en `peerjs.LICENSE.txt`) |

## Modo en línea y privacidad

Los dos dispositivos tienen el mismo motor y la misma semilla, así que por la red solo viajan las jugadas (unos pocos bytes). El anfitrión hace de árbitro: comprueba cada jugada del invitado y la reenvía numerada.

1. **Conexión directa** (WebRTC): para encontrarse se usa el servidor público gratuito de PeerJS (`0.peerjs.com`), por el que pasa solo el código de la sala. Después la partida va de un dispositivo a otro, que así conocen la dirección IP del otro.
2. **Buzón por internet:** si en 6 segundos no hay conexión directa (muchas redes de centros y de móviles la bloquean), las jugadas pasan por el servicio público ntfy.sh (HTTPS, puerto 443). Por él pasan solo las jugadas y el código de sala.

No se envían nombres ni datos del alumnado. **Límite conocido:** ntfy.sh limita las peticiones por dirección IP (unas 60 seguidas y luego una cada 10 s), y en un centro todo el alumnado comparte la misma IP, así que el buzón sirve para alguna pareja suelta, no para una clase entera.

## Pendiente

- Traducciones (en, ca, eu, gl): la nomenclatura cambia de un idioma a otro, así que hace falta un generador de nombres por idioma, no solo diccionarios.
- Guía docente.

## Licencia

Código bajo licencia MIT (`LICENSE`); contenido didáctico bajo CC BY-SA 4.0 (`LICENSE-CONTENT.md`).
