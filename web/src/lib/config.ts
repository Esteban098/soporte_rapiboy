import "server-only";

/**
 * Configuración de la fuente de datos. Todo lo de este módulo es server-only:
 * la URL del sheet nunca llega al navegador, así el login del sitio protege de
 * verdad los datos aunque la hoja esté publicada.
 */

/**
 * Pestañas con detalle de pedidos, de la más nueva a la más vieja. Cuando el
 * equipo archive un mes nuevo, alcanza con agregarlo a SHEET_TABS en Vercel:
 * no hace falta tocar el código ni volver a desplegar.
 */
const TABS_POR_DEFECTO = [
  "Mensual",
  "Julio2026",
  "Mayo2026",
  "dic",
  "nov",
  "Oct",
  "Sep",
  "Agosto",
  "Julio",
  "Junio",
  "Mayo",
];

export const TABS_PEDIDOS: string[] =
  process.env.SHEET_TABS?.split(",")
    .map((t) => t.trim())
    .filter(Boolean) ?? TABS_POR_DEFECTO;

/** Vistas que el equipo vuelve a pegar cada mañana. */
export const TAB_AYER = "Ayer";
export const TAB_DEMORADOS = "Demorados";
export const TAB_DEMORADO_NO_ENTREGADO = "DemoradoNoEntregado";

/** Cancelaciones de Mercado Libre. */
export const TAB_CANCELADOS = "Cancelados";

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
 * Cada cuánto se vuelve a leer el sheet, en segundos. El libro se actualiza una
 * vez por día, así que una hora es de sobra y mantiene los tableros rápidos.
 */
export const REVALIDAR_SEGUNDOS = Number(process.env.SHEET_REVALIDATE ?? 3600);
