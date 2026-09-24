import type { Ventana } from "./tracker";

/**
 * El radar de lluvia de RainViewer, como cuentas puras.
 *
 * Sale a un servidor externo -igual que las calles y el tráfico de TomTom-, y por eso es
 * opcional: el mapa del live tracker se dibuja igual con la red caída, y esta
 * capa se prende a mano cuando llueve y hay que explicar por qué la ruta va
 * lenta. Nada de acá corre si nadie la prende.
 *
 * La API es pública y sin clave (https://www.rainviewer.com/api.html). Pide
 * atribución visible, que la pone `Lluvia.tsx` debajo del control.
 *
 * Este módulo no hace `fetch` ni toca el DOM: recibe el JSON del índice y
 * devuelve qué cuadros hay y qué teselas cubren la ventana del mapa. Así la
 * geometría —que es lo que se puede equivocar en silencio— se prueba sola.
 */

export const INDICE_RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json";

/** Un cuadro del radar: una foto del cielo, con su hora. */
export type CuadroRadar = {
  /** Segundos Unix. Es también lo que identifica al cuadro. */
  time: number;
  /** El prefijo de la URL de sus teselas, tal como lo da la API. */
  path: string;
  /** Los cuadros futuros son pronóstico, no observación, y se avisan. */
  pronostico: boolean;
};

export type IndiceRadar = { host: string; cuadros: CuadroRadar[] };

/**
 * Cuántos cuadros pasados se conservan.
 *
 * RainViewer publica un cuadro cada diez minutos y suele tener trece atrás.
 * Con ocho la animación cubre más de una hora, que alcanza para ver hacia
 * dónde va la tormenta, y baja a la mitad las imágenes que hay que bajar.
 */
export const CUADROS_PASADOS = 8;

/**
 * Lee el índice de RainViewer.
 *
 * Devuelve `null` en vez de tirar ante cualquier forma inesperada: es un
 * servicio de terceros y gratuito, y que cambie el JSON tiene que apagar la
 * capa, no romper el live tracker.
 */
export function leerIndice(crudo: unknown): IndiceRadar | null {
  if (typeof crudo !== "object" || crudo === null) return null;
  const raiz = crudo as { host?: unknown; radar?: unknown };
  if (typeof raiz.host !== "string" || raiz.host === "") return null;
  if (typeof raiz.radar !== "object" || raiz.radar === null) return null;

  const radar = raiz.radar as { past?: unknown; nowcast?: unknown };
  const pasados = cuadros(radar.past, false).slice(-CUADROS_PASADOS);
  const futuros = cuadros(radar.nowcast, true);
  if (pasados.length === 0 && futuros.length === 0) return null;

  return { host: raiz.host.replace(/\/$/, ""), cuadros: [...pasados, ...futuros] };
}

function cuadros(lista: unknown, pronostico: boolean): CuadroRadar[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter(
      (c): c is { time: number; path: string } =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as { time?: unknown }).time === "number" &&
        typeof (c as { path?: unknown }).path === "string",
    )
    .map((c) => ({ time: c.time, path: c.path, pronostico }));
}

/** El último cuadro observado: el «ahora» del radar. */
export function cuadroActual(indice: IndiceRadar): number {
  const ultimo = indice.cuadros.findLastIndex((c) => !c.pronostico);
  return ultimo === -1 ? 0 : ultimo;
}

/* ---------- Teselas ---------- */

/** Una tesela XYZ y los grados que cubre. */
export type Tesela = {
  z: number;
  x: number;
  y: number;
  oeste: number;
  este: number;
  norte: number;
  sur: number;
};

/**
 * Cuántas teselas se aceptan por cuadro.
 *
 * Cada tesela es una imagen por cuadro: con once cuadros, doce teselas ya son
 * ciento treinta y dos descargas para prender la capa. El radar tiene una
 * resolución de alrededor de un kilómetro, así que pedir más zoom no muestra
 * más lluvia, solo cuesta más.
 */
const MAX_TESELAS = 12;

/**
 * El zoom más alto que sirve la API pública.
 *
 * Arriba de 7 RainViewer no devuelve un error: devuelve una imagen gris que
 * dice «Zoom Level Not Supported», que sobre el mapa se ve como una mancha con
 * texto. Está comprobado a mano contra el servicio —una tesela de z=8 pesa
 * siempre lo mismo, y es esa—. Si alguna vez habilitan más zoom en el plan
 * gratuito, este número es lo único que hay que mover.
 */
const ZOOM_MAX = 7;

/**
 * El zoom más detallado que cubre la ventana sin pasarse de teselas.
 *
 * El mapa no usa tiles para nada más, así que este zoom no es el del encuadre:
 * es fijo para toda la pantalla y se elige una sola vez por ventana. Acercarse
 * agranda la imagen del radar, que es lo correcto —la lluvia no tiene detalle
 * más fino que el que bajó—.
 *
 * Para una ciudad da siempre `ZOOM_MAX`: la ventana entra en un par de teselas
 * mucho antes de que el tope de teselas moleste. El límite de cantidad está
 * igual porque es el que gobierna si alguna vez se mira una ventana más grande.
 */
export function zoomDeMosaico(v: Ventana, maxTeselas = MAX_TESELAS): number {
  let elegido = 1;
  for (let z = 1; z <= ZOOM_MAX; z++) {
    if (cuantasTeselas(v, z) <= maxTeselas) elegido = z;
    else break;
  }
  return elegido;
}

function cuantasTeselas(v: Ventana, z: number): number {
  const { x0, x1, y0, y1 } = rango(v, z);
  return (x1 - x0 + 1) * (y1 - y0 + 1);
}

function rango(v: Ventana, z: number) {
  return {
    x0: Math.floor(xDeLon(v.oeste, z)),
    x1: Math.floor(xDeLon(v.este, z)),
    y0: Math.floor(yDeLat(v.norte, z)),
    y1: Math.floor(yDeLat(v.sur, z)),
  };
}

/** Las teselas que cubren la ventana del mapa, con sus grados. */
export function mosaico(v: Ventana, z: number): Tesela[] {
  const { x0, x1, y0, y1 } = rango(v, z);
  const teselas: Tesela[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      teselas.push({
        z,
        x,
        y,
        oeste: lonDeX(x, z),
        este: lonDeX(x + 1, z),
        norte: latDeY(y, z),
        sur: latDeY(y + 1, z),
      });
    }
  }
  return teselas;
}

/*
 * Web Mercator, que es la cuadrícula en la que RainViewer sirve sus teselas.
 *
 * El mapa del tablero no es Mercator: proyecta la longitud y la latitud
 * derecho, corrigiendo el ancho por el coseno de la latitud media.
 *
 * En longitud las dos proyecciones son la misma cuenta, así que el eje x cae
 * exacto. En latitud no: Mercator estira hacia los polos y acá cada tesela se
 * ubica por sus esquinas y se rellena parejo en el medio. Medido sobre la
 * ventana real —teselas de z=7, que es lo que sirve la API pública— el
 * corrimiento máximo es de 352 m, contra un píxel de radar de 572 m: la lluvia
 * queda dentro de su propio píxel, que es lo mejor que puede pedirse de un
 * dato de esta resolución. `scripts/lluvia.test.mts` falla si crece.
 *
 * Con la ventana de una ciudad alcanza. Para una ventana de varios grados de
 * alto no alcanzaría, y ahí habría que partir cada tesela en franjas.
 */

function xDeLon(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function yDeLat(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

function lonDeX(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function latDeY(y: number, z: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
}

/* ---------- URLs ---------- */

/**
 * Las teselas se piden de 512 px aunque cubran el mismo terreno que una de 256.
 *
 * Con el zoom limitado a 7, el detalle que baja es lo único que hay: una de 512
 * trae el doble de píxeles por grado y es la diferencia entre una mancha de
 * lluvia con forma y cuatro cuadrados de color.
 */
const TAMANO = 512;

/** Paleta 4 («Universal Blue»), suavizada y con la nieve marcada aparte. */
const PALETA = 4;
const SUAVE = 1;
const NIEVE = 1;

/** La URL de una tesela de un cuadro. */
export function urlTesela(indice: IndiceRadar, cuadro: CuadroRadar, t: Tesela): string {
  return `${indice.host}${cuadro.path}/${TAMANO}/${t.z}/${t.x}/${t.y}/${PALETA}/${SUAVE}_${NIEVE}.png`;
}

/** La hora visible del cuadro en Argentina. */
export function horaDeCuadro(time: number): string {
  return `${new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(time * 1000))} hs arg`;
}
