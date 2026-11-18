# Carga cero — Juego de formulación

Juego de cartas para practicar la formulación y la nomenclatura de **compuestos binarios** (óxidos, cloruros, sulfuros, hidruros y compuestos del hidrógeno con no metales). Forma parte de [SimulaCiencia](https://simulaciencia.es).

Cada carta es un elemento con su número de oxidación. Los jugadores las colocan en el reactor hasta que **la carga neta es cero**: entonces se ha formado un compuesto. Si tiene 3 átomos o más, hay que nombrarlo o formularlo en un reto rápido («Nombra rápido»), y si se falla el rival puede robar los puntos.

## Modos

- **Nivel básico:** cada carta trae un único número de oxidación (las de Fe y Cu vienen ya con +2/+3 o +1/+2).
- **Nivel avanzado:** al jugar Fe o Cu se elige el número de oxidación, y aparecen retos con el nombre con número de oxidación, como óxido de hierro(III).
- **Rival:** el ordenador (Aprendiz, Químico o Nobel), dos jugadores por turnos en el mismo dispositivo (con cortina para no ver la mano del otro) o en línea con un código de 4 caracteres.
- **Opciones:** tiempo para responder (6 s, 12 s o sin límite) y cartas con el símbolo o el nombre ocultos para practicar.
- **Cuaderno:** los 39 compuestos que se pueden formar, con un dato curioso de cada uno. Se guarda en el navegador.

## Cómo abrirlo

Abre `index.html` en el navegador (funciona sin servidor y sin conexión, salvo el modo en línea).

- Tema: `?tema=claro`, `?tema=oscuro`, `?tema=contraste` o `?tema=simulaciencia`, o con el engranaje.
- Idiomas: de momento solo en español (ver «Pendiente»).

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Panel, tablero y ventanas |
| `css/style.css` | Estilos y los cuatro temas (con variables CSS) |
| `js/elementos.js` | Elementos de la baraja, cartas especiales y catálogo de 39 compuestos |
| `js/nomenclatura.js` | Nombres con prefijos y con número de oxidación, y preguntas de los retos |
| `js/motor.js` | Reglas, baraja, combos, retos y jugador automático |
| `js/red.js` | Modo en línea (PeerJS, cargado solo si se usa) |
| `js/interfaz.js` | Pantalla, teclado, sonido y temas |
| `js/i18n.js`, `js/sello.js`, `js/estadisticas.js`, `favicon.svg` | Comunes a todas las simulaciones, sin cambios |
| `js/vendor/peerjs.min.js` | PeerJS 1.5.4 (licencia MIT en `peerjs.LICENSE.txt`) |

## Modo en línea y privacidad

Para que dos dispositivos se encuentren se usa el servidor público gratuito de PeerJS (`0.peerjs.com`). Por él pasa solo el código de la sala; la partida va directamente de un dispositivo a otro (WebRTC), que así conocen la dirección IP del otro. No se envían nombres ni datos del alumnado.

## Pendiente

- Traducciones (en, ca, eu, gl): la nomenclatura cambia de un idioma a otro, así que hace falta un generador de nombres por idioma, no solo diccionarios.
- Guía docente.

## Licencia

Código bajo licencia MIT (`LICENSE`); contenido didáctico bajo CC BY-SA 4.0 (`LICENSE-CONTENT.md`).
