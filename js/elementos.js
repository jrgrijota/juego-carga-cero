// Datos del juego: elementos de la baraja, cartas especiales y catálogo del cuaderno.
// Script clásico (sin módulos) para que el juego funcione también abriendo index.html
// directamente desde el disco: los módulos de JavaScript no cargan con file://.
window.CC = window.CC || {};

// category: METAL (catión), NON_METAL (anión) o HYDROGEN (+1 con no metales y −1 con metales).
// numbers: todos sus números de oxidación en estos compuestos. Las cartas los muestran todos
// y el reactor elige solo el que hace que la carga neta llegue a cero.
CC.ELEMENTS = {
  H:  { symbol: 'H',  name: 'Hidrógeno', cationName: 'hidrógeno', anionRoot: 'hidruro', category: 'HYDROGEN',  count: 6, numbers: [1, -1] },
  Na: { symbol: 'Na', name: 'Sodio',     cationName: 'sodio',     anionRoot: '',        category: 'METAL',     count: 4, numbers: [1] },
  K:  { symbol: 'K',  name: 'Potasio',   cationName: 'potasio',   anionRoot: '',        category: 'METAL',     count: 4, numbers: [1] },
  Ca: { symbol: 'Ca', name: 'Calcio',    cationName: 'calcio',    anionRoot: '',        category: 'METAL',     count: 4, numbers: [2] },
  Mg: { symbol: 'Mg', name: 'Magnesio',  cationName: 'magnesio',  anionRoot: '',        category: 'METAL',     count: 4, numbers: [2] },
  Al: { symbol: 'Al', name: 'Aluminio',  cationName: 'aluminio',  anionRoot: '',        category: 'METAL',     count: 4, numbers: [3] },
  Fe: { symbol: 'Fe', name: 'Hierro',    cationName: 'hierro',    anionRoot: '',        category: 'METAL',     count: 4, numbers: [2, 3] },
  Cu: { symbol: 'Cu', name: 'Cobre',     cationName: 'cobre',     anionRoot: '',        category: 'METAL',     count: 4, numbers: [1, 2] },
  Cl: { symbol: 'Cl', name: 'Cloro',     cationName: 'cloro',     anionRoot: 'cloruro', category: 'NON_METAL', count: 6, numbers: [-1] },
  S:  { symbol: 'S',  name: 'Azufre',    cationName: 'azufre',    anionRoot: 'sulfuro', category: 'NON_METAL', count: 5, numbers: [-2] },
  O:  { symbol: 'O',  name: 'Oxígeno',   cationName: 'oxígeno',   anionRoot: 'óxido',   category: 'NON_METAL', count: 6, numbers: [-2] }
};

CC.SPECIAL_CARDS = [
  { specialType: 'CATALYST',     symbol: '×2',  name: 'Catalizador',     desc: 'Repite el último átomo', count: 2 },
  { specialType: 'ELECTROLYSIS', symbol: '⚡',  name: 'Electrólisis',    desc: 'Quita el último átomo',  count: 2 },
  { specialType: 'ISOTOPE',      symbol: 'Iso', name: 'Isótopo comodín', desc: 'Copia un átomo del reactor', count: 1 }
];

// Los 39 compuestos binarios que se pueden formar con esta baraja.
// El nombre es el de la nomenclatura de composición (prefijos) que genera nomenclatura.js;
// la prueba de consistencia está en el README.
CC.COMPOUND_CATALOG = [
  // ÓXIDOS (9)
  { key: 'Na2O',  name: 'Óxido de disodio',          fact: 'Componente fundamental del vidrio común (sodocálcico) y de muchas cerámicas.' },
  { key: 'K2O',   name: 'Óxido de dipotasio',        fact: 'Se usa como referencia para expresar el contenido de potasio de los abonos.' },
  { key: 'CaO',   name: 'Óxido de calcio',           fact: 'Es la cal viva: al añadirle agua se calienta mucho y se forma cal apagada.' },
  { key: 'MgO',   name: 'Óxido de magnesio',         fact: 'Funde a unos 2800 °C, por eso se usa para recubrir el interior de los hornos.' },
  { key: 'Al2O3', name: 'Trióxido de dialuminio',    fact: 'Forma el corindón; con trazas de cromo u otros metales da rubíes y zafiros.' },
  { key: 'FeO',   name: 'Monóxido de hierro',        fact: 'Es el mineral wüstita, presente en el manto terrestre y en las escorias de la siderurgia.' },
  { key: 'Fe2O3', name: 'Trióxido de dihierro',      fact: 'Es el principal componente de la hematita y de la herrumbre rojiza del hierro.' },
  { key: 'Cu2O',  name: 'Óxido de dicobre',          fact: 'Pigmento rojo de las pinturas que evitan que se peguen algas y moluscos a los barcos.' },
  { key: 'CuO',   name: 'Monóxido de cobre',         fact: 'Sólido negro que se usa como pigmento en cerámica.' },

  // CLORUROS (9)
  { key: 'NaCl',  name: 'Cloruro de sodio',          fact: 'Es la sal de mesa, imprescindible para la transmisión de los impulsos nerviosos.' },
  { key: 'KCl',   name: 'Cloruro de potasio',        fact: 'Se usa como sal sin sodio y es la principal fuente de potasio de los abonos.' },
  { key: 'CaCl2', name: 'Dicloruro de calcio',       fact: 'Absorbe mucho la humedad; se echa en las carreteras para fundir el hielo.' },
  { key: 'MgCl2', name: 'Dicloruro de magnesio',     fact: 'Abunda en el agua del mar y se usa para cuajar el tofu (nigari).' },
  { key: 'AlCl3', name: 'Tricloruro de aluminio',    fact: 'Catalizador muy usado en la industria química orgánica.' },
  { key: 'FeCl2', name: 'Dicloruro de hierro',       fact: 'Se usa en las depuradoras para que la suciedad del agua se agrupe y se separe.' },
  { key: 'FeCl3', name: 'Tricloruro de hierro',      fact: 'Disuelve el cobre: se usa para fabricar las pistas de las placas de circuitos.' },
  { key: 'CuCl',  name: 'Monocloruro de cobre',      fact: 'En los fuegos artificiales da a la llama un color azul.' },
  { key: 'CuCl2', name: 'Dicloruro de cobre',        fact: 'Colorea la llama de verde azulado en el ensayo a la llama.' },

  // SULFUROS (9)
  { key: 'Na2S',  name: 'Sulfuro de disodio',        fact: 'Se usa en la fabricación de papel para separar la celulosa de la madera.' },
  { key: 'K2S',   name: 'Sulfuro de dipotasio',      fact: 'Es uno de los residuos sólidos que deja al arder la pólvora negra.' },
  { key: 'CaS',   name: 'Sulfuro de calcio',         fact: 'Brilla en la oscuridad después de iluminarlo: se usó en pinturas luminosas.' },
  { key: 'MgS',   name: 'Sulfuro de magnesio',       fact: 'Se cree que forma parte del polvo que rodea a algunas estrellas viejas.' },
  { key: 'Al2S3', name: 'Trisulfuro de dialuminio',  fact: 'Con la humedad del aire se descompone y desprende sulfuro de hidrógeno, que huele a huevo podrido.' },
  { key: 'FeS',   name: 'Monosulfuro de hierro',     fact: 'Es el mineral troilita, frecuente en los meteoritos.' },
  { key: 'Fe2S3', name: 'Trisulfuro de dihierro',    fact: 'Sólido negro inestable que se descompone poco a poco.' },
  { key: 'Cu2S',  name: 'Sulfuro de dicobre',        fact: 'Es el mineral calcosina, una de las menas más ricas para obtener cobre.' },
  { key: 'CuS',   name: 'Monosulfuro de cobre',      fact: 'Es el mineral covellina, de color azul índigo con brillo metálico.' },

  // COMPUESTOS CON HIDRÓGENO (12)
  { key: 'H2O',   name: 'Agua (oxidano)',            fact: 'Disolvente imprescindible para la vida; el agua líquida es más densa a 4 °C.' },
  { key: 'HCl',   name: 'Cloruro de hidrógeno',      fact: 'Gas que, disuelto en agua, forma el ácido clorhídrico del jugo gástrico.' },
  { key: 'H2S',   name: 'Sulfuro de dihidrógeno',    fact: 'Gas de los volcanes y de la materia en descomposición, con olor a huevo podrido.' },
  { key: 'NaH',   name: 'Hidruro de sodio',          fact: 'En los hidruros el hidrógeno actúa con número de oxidación −1.' },
  { key: 'KH',    name: 'Hidruro de potasio',        fact: 'Reacciona con violencia con el agua; en el laboratorio se guarda en aceite.' },
  { key: 'CaH2',  name: 'Dihidruro de calcio',       fact: 'Se usa para secar disolventes porque reacciona con las trazas de agua.' },
  { key: 'MgH2',  name: 'Dihidruro de magnesio',     fact: 'Se investiga para almacenar hidrógeno de forma segura en estado sólido.' },
  { key: 'AlH3',  name: 'Trihidruro de aluminio',    fact: 'Llamado alano; se ha estudiado como combustible para cohetes.' },
  { key: 'FeH2',  name: 'Dihidruro de hierro',       fact: 'Solo se ha obtenido a presiones enormes, en experimentos sobre el núcleo de la Tierra.' },
  { key: 'FeH3',  name: 'Trihidruro de hierro',      fact: 'Como el anterior, solo existe a presiones de más de 800 000 atmósferas.' },
  { key: 'CuH',   name: 'Monohidruro de cobre',      fact: 'Fue el primer hidruro metálico descubierto, en 1844.' },
  { key: 'CuH2',  name: 'Dihidruro de cobre',        fact: 'Muy inestable: se estudia sobre todo con cálculos y a temperaturas muy bajas.' }
];
