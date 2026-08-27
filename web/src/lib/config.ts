import "server-only";

/**
 * Configuración de la fuente de datos. Todo lo de este módulo es server-only:
 * la URL del sheet nunca llega al navegador, así el login del sitio protege de
 * verdad los datos aunque la hoja esté publicada.
 */

/**
 * Pestaña con el detalle de los casos abiertos del mes en curso. Es la única
 * del libro que la web lee como fuente de pedidos: las pestañas de meses
 * anteriores quedaron como archivo y varias fueron vaciadas o reutilizadas, así
 * que no son una fuente confiable de historial.
 */
export const TAB_MENSUAL = process.env.SHEET_TAB_MENSUAL?.trim() || "Mensual";

/**
 * Lo que quedó sin cerrar en la jornada anterior. Es la única vista del día que
 * se sigue leyendo del libro: los demorados se derivan de `Mensual`, así que ya
 * no hace falta que nadie los vuelva a pegar cada mañana.
 */
export const TAB_AYER = "Ayer";


export type ModoDatos = "sheet" | "fixture";

export function modoDatos(): ModoDatos {
  return process.env.SHEET_MODE === "fixture" || !process.env.SHEET_ID ? "fixture" : "sheet";
}

export function sheetId(): string {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("Falta SHEET_ID: ver web/README.md");
  return id;
}

/**
 * Flujos de n8n que rearman el libro, en el orden en que deben correr.
 *
 * Son las *Production URL* del nodo Webhook de cada flujo
 * (`https://…/webhook/…`), separadas por coma. La URL del editor
 * (`https://…/workflow/…`) no sirve: devuelve la interfaz de n8n y no ejecuta
 * nada.
 *
 * Viven en el servidor: el navegador nunca ve estas URLs, así nadie puede
 * disparar los flujos desde afuera del tablero.
 */
export function flujosActualizacion(): string[] {
  return (process.env.N8N_WEBHOOKS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

/** Cuánto se espera a cada flujo antes de darlo por colgado, en milisegundos. */
export const TIMEOUT_FLUJO_MS = Number(process.env.N8N_TIMEOUT_MS ?? 120_000);

/**
 * Cada cuánto se vuelve a leer el sheet, en segundos. El libro se actualiza una
 * vez por día, así que una hora es de sobra y mantiene los tableros rápidos.
 */
export const REVALIDAR_SEGUNDOS = Number(process.env.SHEET_REVALIDATE ?? 3600);
