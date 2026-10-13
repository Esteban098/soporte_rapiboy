import datos from "./cobertura.json";

/**
 * Los polígonos donde Rapiboy entrega, y cómo saber si un punto cae adentro.
 *
 * Salen del KMZ que mantiene operaciones (`datos/`), convertido por
 * `scripts/cobertura.mts`. Acá no se consulta ningún servicio: la cobertura es
 * un archivo del repo, así que responder «está dentro» o «está fuera» no
 * depende de la red ni de que la base esté arriba.
 */

/** Un punto en grados decimales, como los escribe Google Maps. */
export type Punto = { lon: number; lat: number };

type Anillo = [number, number][];

type PoligonoCrudo = {
  nombre: string;
  zona: string;
  /** Contorno completo. Es lo que decide si un domicilio entra. */
  contorno: Anillo;
  huecos: Anillo[];
  /** El mismo contorno simplificado, solo para dibujar. */
  trazo: Anillo[];
};

export type Caja = { oeste: number; este: number; sur: number; norte: number };

// El JSON se infiere como `number[][]`: TypeScript no puede saber que cada par
// tiene exactamente dos elementos, así que la forma se afirma acá una sola vez.
export const COBERTURA = datos as unknown as {
  nombre: string;
  bbox: Caja;
  poligonos: PoligonoCrudo[];
};

/** El polígono que cubre un punto: el nombre que usa operación para esa área. */
export type Zona = { nombre: string; zona: string };

export const RESUMEN = {
  zonas: new Set(COBERTURA.poligonos.map((p) => p.zona)).size,
  poligonos: COBERTURA.poligonos.length,
  puntos: COBERTURA.poligonos.reduce(
    (n, p) => n + p.contorno.length + p.huecos.reduce((m, h) => m + h.length, 0),
    0,
  ),
};

/**
 * Todos los polígonos que cubren el punto. Vacío si no lo cubre ninguno.
 *
 * Devuelve el nombre y no un booleano porque saber *cuál* es lo que sirve
 * después: es el mismo nombre que lleva la columna `poligono` de los pedidos,
 * así que permite ver si el caso está asignado al área que le toca.
 *
 * Devuelve la lista y no el primero que coincide porque los polígonos se pisan
 * en los bordes: alrededor del 1% del área cubierta cae en dos. Ahí no hay una
 * respuesta correcta única, y quedarse con una haría que dependiera del orden
 * del archivo, que no significa nada.
 *
 * Ray casting: se tira una semirrecta horizontal y se cuentan los cruces con el
 * anillo; impar es adentro. Un punto entra si cae dentro del contorno de algún
 * polígono y fuera de todos sus huecos.
 */
export function ubicarPunto(punto: Punto): Zona[] {
  return COBERTURA.poligonos
    .filter(
      (poligono) =>
        enAnillo(poligono.contorno, punto) &&
        !poligono.huecos.some((hueco) => enAnillo(hueco, punto)),
    )
    .map((poligono) => ({ nombre: poligono.nombre, zona: poligono.zona }));
}

/*
 * Polígonos colindantes del KMZ.
 *
 * La cercanía operativa no se mide en kilómetros: un domicilio pertenece a un
 * polígono y puede absorber también los que comparten su borde. El margen es
 * exclusivamente topológico (unos centímetros en las coordenadas exportadas),
 * para tolerar vértices que el KMZ escribió con distinto redondeo; no amplía
 * zonas ni convierte esta regla en una búsqueda por radio.
 */
const TOLERANCIA_BORDE = 0.000_002;
const VECINOS = vecinosDeCobertura();

/** El polígono de un punto y los que comparten borde con él. */
export function poligonosAledanosAlPunto(punto: Punto): Zona[] {
  const propios = ubicarPunto(punto);
  const nombres = new Set(propios.map((zona) => zona.nombre));
  for (const zona of propios) {
    for (const vecino of VECINOS.get(zona.nombre) ?? []) nombres.add(vecino);
  }
  return COBERTURA.poligonos
    .filter((poligono) => nombres.has(poligono.nombre))
    .map((poligono) => ({ nombre: poligono.nombre, zona: poligono.zona }));
}

function vecinosDeCobertura(): Map<string, Set<string>> {
  const vecinos = new Map(COBERTURA.poligonos.map((poligono) => [poligono.nombre, new Set<string>()]));
  for (let i = 0; i < COBERTURA.poligonos.length; i += 1) {
    for (let j = i + 1; j < COBERTURA.poligonos.length; j += 1) {
      const a = COBERTURA.poligonos[i];
      const b = COBERTURA.poligonos[j];
      if (!compartenBorde(a, b)) continue;
      vecinos.get(a.nombre)?.add(b.nombre);
      vecinos.get(b.nombre)?.add(a.nombre);
    }
  }
  return vecinos;
}

function compartenBorde(a: PoligonoCrudo, b: PoligonoCrudo): boolean {
  const cajaA = cajaDe(a.contorno);
  const cajaB = cajaDe(b.contorno);
  if (
    cajaA.este + TOLERANCIA_BORDE < cajaB.oeste ||
    cajaB.este + TOLERANCIA_BORDE < cajaA.oeste ||
    cajaA.norte + TOLERANCIA_BORDE < cajaB.sur ||
    cajaB.norte + TOLERANCIA_BORDE < cajaA.sur
  ) return false;

  for (let i = 0; i < a.contorno.length - 1; i += 1) {
    for (let j = 0; j < b.contorno.length - 1; j += 1) {
      if (distanciaEntreSegmentos(a.contorno[i], a.contorno[i + 1], b.contorno[j], b.contorno[j + 1]) <= TOLERANCIA_BORDE) return true;
    }
  }
  return false;
}

function cajaDe(anillo: Anillo): Caja {
  return anillo.reduce((caja, [lon, lat]) => ({
    oeste: Math.min(caja.oeste, lon), este: Math.max(caja.este, lon),
    sur: Math.min(caja.sur, lat), norte: Math.max(caja.norte, lat),
  }), { oeste: Infinity, este: -Infinity, sur: Infinity, norte: -Infinity });
}

type Par = [number, number];

function distanciaEntreSegmentos(a: Par, b: Par, c: Par, d: Par): number {
  if (segmentosSeCruzan(a, b, c, d)) return 0;
  return Math.min(distanciaPuntoSegmento(a, c, d), distanciaPuntoSegmento(b, c, d), distanciaPuntoSegmento(c, a, b), distanciaPuntoSegmento(d, a, b));
}

function segmentosSeCruzan(a: Par, b: Par, c: Par, d: Par): boolean {
  const cruz = (origen: Par, destino: Par, punto: Par) =>
    (destino[0] - origen[0]) * (punto[1] - origen[1]) - (destino[1] - origen[1]) * (punto[0] - origen[0]);
  const abC = cruz(a, b, c);
  const abD = cruz(a, b, d);
  const cdA = cruz(c, d, a);
  const cdB = cruz(c, d, b);
  return (abC === 0 || abD === 0 || Math.sign(abC) !== Math.sign(abD)) &&
    (cdA === 0 || cdB === 0 || Math.sign(cdA) !== Math.sign(cdB));
}

function distanciaPuntoSegmento(punto: Par, inicio: Par, fin: Par): number {
  const dx = fin[0] - inicio[0];
  const dy = fin[1] - inicio[1];
  const largo2 = dx * dx + dy * dy;
  if (largo2 === 0) return Math.hypot(punto[0] - inicio[0], punto[1] - inicio[1]);
  const t = Math.max(0, Math.min(1, ((punto[0] - inicio[0]) * dx + (punto[1] - inicio[1]) * dy) / largo2));
  return Math.hypot(punto[0] - (inicio[0] + t * dx), punto[1] - (inicio[1] + t * dy));
}

function enAnillo(anillo: Anillo, { lon, lat }: Punto): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    // El cruce se cuenta una sola vez por arista: `>` de un lado y `>=` del
    // otro haría que un punto exactamente a la altura de un vértice cuente dos.
    const cruza = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/**
 * Si el punto está en la ventana del mapa.
 *
 * Sirve para distinguir «lo geocodifiqué y quedó fuera de cobertura» de «esto
 * está en otra ciudad»: las dos cosas son «fuera», pero la segunda casi siempre
 * es una dirección mal escrita y conviene decirlo distinto.
 */
export function enLaZona(punto: Punto, margen = 0.15): boolean {
  const { oeste, este, sur, norte } = COBERTURA.bbox;
  return (
    punto.lon >= oeste - margen &&
    punto.lon <= este + margen &&
    punto.lat >= sur - margen &&
    punto.lat <= norte + margen
  );
}

/* ---------- Proyección al SVG ---------- */

/** Ancho del `viewBox`. El alto sale de la proporción real del terreno. */
export const ANCHO = 1000;

/**
 * Un grado de longitud mide menos que uno de latitud, y la diferencia crece con
 * la latitud. Sin corregir por el coseno, el mapa sale estirado a lo ancho: a
 * 19,5° un grado de longitud son ~94% de uno de latitud.
 */
const ESCALA_LON = Math.cos(((COBERTURA.bbox.sur + COBERTURA.bbox.norte) / 2) * (Math.PI / 180));

const CAJA = conMargen(COBERTURA.bbox, 0.02);

export const ALTO = Math.round(
  (ANCHO * (CAJA.norte - CAJA.sur)) / ((CAJA.este - CAJA.oeste) * ESCALA_LON),
);

function conMargen(caja: Caja, proporcion: number): Caja {
  const dx = (caja.este - caja.oeste) * proporcion;
  const dy = (caja.norte - caja.sur) * proporcion;
  return {
    oeste: caja.oeste - dx,
    este: caja.este + dx,
    sur: caja.sur - dy,
    norte: caja.norte + dy,
  };
}

/**
 * La ventana que cubre el `viewBox`, en grados, más su tamaño en unidades SVG.
 *
 * Se expone para que el live tracker pueda proyectar en el navegador sin
 * importar este módulo: `cobertura.json` pesa casi 300 KB y mandarlo al cliente
 * para ubicar diez marcadores sería pagar el archivo entero por seis números.
 * El mapa de fondo se sigue dibujando en el servidor; al cliente le viajan
 * solo estos límites.
 */
export function ventanaProyeccion(): Caja & { ancho: number; alto: number } {
  return { ...CAJA, ancho: ANCHO, alto: ALTO };
}

/** Grados a coordenadas del `viewBox`. La `y` se invierte: el norte va arriba. */
export function proyectar({ lon, lat }: Punto): { x: number; y: number } {
  return {
    x: ((lon - CAJA.oeste) / (CAJA.este - CAJA.oeste)) * ANCHO,
    y: ((CAJA.norte - lat) / (CAJA.norte - CAJA.sur)) * ALTO,
  };
}

/**
 * El `d` de cada polígono, dibujado con el contorno simplificado.
 *
 * Los huecos van en el mismo path que su contorno: con `fill-rule="evenodd"`
 * recortan el relleno en vez de taparlo con un parche del color del fondo.
 * Este KMZ no trae ninguno, pero el anterior sí y la próxima versión puede
 * volver a traerlos.
 */
export function caminos(): { clave: string; d: string; nombre: string; zona: string }[] {
  return COBERTURA.poligonos.map((poligono, i) => ({
    clave: `${poligono.zona}-${poligono.nombre}-${i}`,
    d: poligono.trazo.map(camino).join(" "),
    nombre: poligono.nombre,
    zona: poligono.zona,
  }));
}

function camino(anillo: Anillo): string {
  const partes = anillo.map(([lon, lat], i) => {
    const { x, y } = proyectar({ lon, lat });
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return partes.join(" ") + " Z";
}
