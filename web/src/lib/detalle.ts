import type { Columna, Fila } from "@/components/Tabla";

/**
 * El traspaso entre un gráfico y la pestaña de detalle.
 *
 * Al tocar una barra, el gráfico deja en `localStorage` exactamente las filas
 * que la componen y abre `/detalle` en otra pestaña, que las levanta y las
 * pinta con la tabla de siempre.
 *
 * Va por `localStorage` y no por la URL ni por el servidor porque el recorte
 * que hace cada gráfico no siempre existe como filtro: el día de la semana en
 * que volvió un paquete, o el tramo de visitas, son derivados que habría que
 * reconstruir del otro lado. El gráfico ya tiene las filas en la mano; lo único
 * que falta es pasárselas.
 *
 * `sessionStorage` no sirve: la pestaña nueva no comparte el suyo con la que la
 * abrió.
 */
export type Detalle = {
  /** Qué universo se está mirando. Ej.: "Casos del período". */
  titulo: string;
  columnas: Columna[];
  filas: Fila[];
};

export type PayloadDetalle = Detalle & {
  /** Qué recorte se pidió. Ej.: "Estado: Devuelto". */
  contexto: string;
  /** Cuántas filas tenía el universo antes de recortar, para dar proporción. */
  totalUniverso: number;
};

const PREFIJO = "detalle:";

/** Cuántos traspasos se conservan. Alcanza para ir y volver entre pestañas. */
const RECIENTES = 8;

/**
 * Tope de filas por traspaso.
 *
 * `localStorage` da unos 5 MB por origen y un recorte grande del histórico
 * puede pasarse. Se corta acá y la pestaña lo dice, en vez de que el navegador
 * tire una excepción de cuota y no se abra nada.
 */
const TOPE_FILAS = 5000;

export function abrirDetalle(payload: PayloadDetalle): void {
  const clave = `${PREFIJO}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  try {
    podar();
    localStorage.setItem(
      clave,
      JSON.stringify({ ...payload, filas: payload.filas.slice(0, TOPE_FILAS) }),
    );
  } catch {
    // Sin almacenamiento —modo privado, cuota llena— la pestaña se abre igual y
    // muestra su propio aviso: es mejor que un clic que no hace nada.
  }

  window.open(`/detalle?d=${encodeURIComponent(clave)}`, "_blank", "noopener,noreferrer");
}

/**
 * Lo que se ve mientras React todavía no corrió en el navegador.
 *
 * `localStorage` no existe en el servidor, así que el primer render —el del
 * servidor y el de la hidratación— no puede tener el recorte. Distinguir «no
 * llegué a leer» de «no está» evita el parpadeo del cartel de error justo antes
 * de que aparezcan las filas.
 */
export const SIN_HIDRATAR = "sin-hidratar";
export type Instantanea = PayloadDetalle | null | typeof SIN_HIDRATAR;

/*
 * El recorte no cambia después de escribirse, así que la suscripción no tiene
 * a quién avisar. Se memoriza el objeto parseado porque `useSyncExternalStore`
 * compara instantáneas por identidad: parsear de nuevo en cada llamada
 * devolvería un objeto distinto y el hook quedaría en bucle.
 */
let claveEnCache = "";
let valorEnCache: PayloadDetalle | null = null;

export function suscribirDetalle(): () => void {
  return () => {};
}

export function detalleEnServidor(): Instantanea {
  return SIN_HIDRATAR;
}

export function detalleDe(clave: string): PayloadDetalle | null {
  if (clave !== claveEnCache) {
    claveEnCache = clave;
    valorEnCache = leerDetalle(clave);
  }
  return valorEnCache;
}

export function leerDetalle(clave: string): PayloadDetalle | null {
  if (!clave.startsWith(PREFIJO)) return null;
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as PayloadDetalle) : null;
  } catch {
    return null;
  }
}

/** Deja solo los traspasos más nuevos: las claves ordenan por fecha de creación. */
function podar(): void {
  const claves = Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIJO))
    .sort();
  for (const vieja of claves.slice(0, Math.max(0, claves.length - RECIENTES + 1))) {
    localStorage.removeItem(vieja);
  }
}

/** El tope, para que la pestaña de detalle pueda avisar si recortó. */
export const TOPE_DETALLE = TOPE_FILAS;
