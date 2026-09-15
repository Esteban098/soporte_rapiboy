import { mosaico, type Tesela } from "./lluvia";
import type { Ventana } from "./tracker";

/**
 * El mapa de calles y el tráfico de TomTom, como cuentas puras.
 *
 * Las dos capas son opcionales y arrancan apagadas: sin `TOMTOM_API_KEY` ni
 * aparecen, y con la clave cargada no se pide nada hasta que alguien las
 * prende. El mapa del tablero sigue siendo el de siempre -las zonas de
 * reparto- y estas capas van debajo y encima de él, nunca en su lugar.
 *
 * A diferencia de la lluvia, el zoom sigue al encuadre. El radar tiene un
 * píxel de un kilómetro y sirve igual a cualquier acercamiento; una calle o
 * una línea de tráfico no, y cubrir la ciudad entera a zoom de calle serían
 * cientos de imágenes. Eligiendo el zoom por los píxeles de la pantalla, la
 * cantidad de teselas queda en una docena a cualquier acercamiento.
 *
 * Este módulo no hace `fetch` ni toca el DOM. La geometría es lo que se puede
 * equivocar en silencio -una calle corrida sigue pareciendo una calle- y así
 * se prueba sola en `scripts/trafico.test.mts`.
 */

export type CapaTomTom = "calles" | "trafico";

/**
 * De 512 px. Con la de 256 hacen falta cuatro veces más imágenes para cubrir
 * la misma pantalla, y TomTom cobra por tesela pedida.
 */
export const TAMANO_TESELA = 512;

/**
 * Entre 9 y 18. Por debajo de 9 la ventana de la ciudad entra en una sola
 * tesela y no hay nada que ganar; por encima de 18 las calles no tienen más
 * detalle que mostrar y solo se multiplican los pedidos.
 */
export const ZOOM_MIN = 9;
export const ZOOM_MAX = 18;

/**
 * Tope de teselas por capa. Si un encuadre raro pidiera más, la capa no se
 * dibuja: antes que decenas de pedidos pagos en vuelo, el mapa sin la capa,
 * que sigue funcionando porque las zonas no dependen de ella.
 */
export const MAX_TESELAS = 30;

/**
 * Cada cuánto se vuelven a pedir las teselas de tráfico.
 *
 * TomTom no publica una frecuencia de actualización para estas teselas, así
 * que el número es una elección nuestra: dos minutos alcanza para que el
 * color de una avenida no quede viejo mientras alguien sigue una ruta, sin
 * pagar un pedido por tesela cada pocos segundos. Las calles no se refrescan.
 */
export const REFRESCO_TRAFICO_MS = 2 * 60 * 1000;

const BASE = "https://api.tomtom.com";

/** Una tesela del mapa de calles. Estilo diurno, el mismo para todos. */
export function urlCalles(clave: string, t: Tesela): string {
  return `${BASE}/map/1/tile/basic/main/${t.z}/${t.x}/${t.y}.png?key=${encodeURIComponent(clave)}&tileSize=${TAMANO_TESELA}`;
}

/**
 * Una tesela de tráfico, en el estilo `relative0`.
 *
 * `relative0` pinta la velocidad en relación con la normal de esa calle, con
 * verde para tránsito libre. Es el que se lee sin leyenda: rojo es «va mucho
 * más lento que de costumbre», que es justo la pregunta de la operación. El
 * `absolute` pintaría de rojo cualquier calle de 30 km/h aunque ande fluida.
 */
export function urlTrafico(clave: string, t: Tesela): string {
  return `${BASE}/traffic/map/4/tile/flow/relative0/${t.z}/${t.x}/${t.y}.png?key=${encodeURIComponent(clave)}&tileSize=${TAMANO_TESELA}`;
}

export function urlTesela(capa: CapaTomTom, clave: string, t: Tesela): string {
  return capa === "calles" ? urlCalles(clave, t) : urlTrafico(clave, t);
}

/**
 * Qué parte del mapa se está mirando, en grados.
 *
 * Es la inversa exacta de `proyectarEn`: el mapa del tablero proyecta la
 * longitud y la latitud en línea recta, así que de unidades del `viewBox` a
 * grados alcanza con una regla de tres. Una prueba lo verifica ida y vuelta.
 */
export function cajaVisible(
  v: Ventana,
  vista: { x: number; y: number; w: number; h: number },
): Ventana {
  const lonPorUnidad = (v.este - v.oeste) / v.ancho;
  const latPorUnidad = (v.norte - v.sur) / v.alto;
  return {
    ...v,
    oeste: v.oeste + vista.x * lonPorUnidad,
    este: v.oeste + (vista.x + vista.w) * lonPorUnidad,
    norte: v.norte - vista.y * latPorUnidad,
    sur: v.norte - (vista.y + vista.h) * latPorUnidad,
  };
}

/**
 * El zoom de tesela que pone un píxel de imagen sobre un píxel de pantalla.
 *
 * Con uno menos el mapa se ve borroso; con uno más se pagan cuatro veces más
 * teselas por un detalle que no entra en la pantalla. El ancho en píxeles no
 * es el de la caja: con `preserveAspectRatio` en `meet` el navegador usa la
 * menor de las dos escalas, así que se calcula igual que la escala de los
 * marcadores del lienzo.
 */
export function zoomParaLienzo(
  v: Ventana,
  lienzo: { vista: { x: number; y: number; w: number; h: number }; caja: { ancho: number; alto: number } },
): number {
  const { vista, caja } = lienzo;
  if (!(vista.w > 0) || !(vista.h > 0) || !(caja.ancho > 0) || !(caja.alto > 0)) return ZOOM_MIN;

  const escala = Math.min(caja.ancho / vista.w, caja.alto / vista.h);
  const anchoPx = vista.w * escala;
  const grados = (vista.w * (v.este - v.oeste)) / v.ancho;

  const z = Math.round(Math.log2((360 * anchoPx) / (TAMANO_TESELA * grados)));
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/** Las teselas que cubren lo que se está mirando, o ninguna si serían demasiadas. */
export function teselasParaLienzo(
  v: Ventana,
  lienzo: { vista: { x: number; y: number; w: number; h: number }; caja: { ancho: number; alto: number } },
): Tesela[] {
  const teselas = mosaico(cajaVisible(v, lienzo.vista), zoomParaLienzo(v, lienzo));
  return teselas.length > MAX_TESELAS ? [] : teselas;
}
