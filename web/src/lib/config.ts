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

/**
 * Identificador interno de cada pestaña dentro del libro.
 *
 * Hacen falta porque la app descarga las hojas por el endpoint `/export`, que
 * las pide por gid y no por nombre. Se ven en la URL al abrir la pestaña en
 * Google Sheets (`...#gid=1701594461`). Si alguna vez se recrea una pestaña, su
 * gid cambia y hay que actualizarlo acá o por `SHEET_GIDS`.
 */
const GIDS_POR_DEFECTO: Record<string, string> = {
  [TAB_MENSUAL]: "1701594461",
  [TAB_AYER]: "0",
};

export function gidDeTab(tab: string): string {
  const propios = Object.fromEntries(
    (process.env.SHEET_GIDS ?? "")
      .split(",")
      .map((par) => par.split(":").map((x) => x.trim()))
      .filter((par) => par.length === 2 && par[0] && par[1]),
  );

  const gid = propios[tab] ?? GIDS_POR_DEFECTO[tab];
  if (!gid) {
    throw new Error(
      `No sé el gid de la pestaña "${tab}". Abrila en Google Sheets, copiá el número que ` +
        `aparece en la URL después de #gid= y agregalo a SHEET_GIDS (por ejemplo: "${tab}:123456").`,
    );
  }
  return gid;
}


export type ModoDatos = "supabase" | "sheet" | "fixture";

/**
 * De dónde salen los casos.
 *
 * Se elige solo según lo que haya configurado, sin variable de por medio en el
 * caso normal: si están las credenciales de Supabase manda la base, si no está
 * el sheet, y si no hay nada quedan los fixtures. `ORIGEN_DATOS` fuerza uno
 * puntual, que es lo que permite volver al sheet en el acto si la base falla
 * sin tener que borrar credenciales.
 */
export function modoDatos(): ModoDatos {
  const forzado = process.env.ORIGEN_DATOS?.trim();
  if (forzado === "supabase" || forzado === "sheet" || forzado === "fixture") return forzado;

  // Compatibilidad con la variable vieja, que solo sabía de fixtures.
  if (process.env.SHEET_MODE === "fixture") return "fixture";

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) return "supabase";
  return process.env.SHEET_ID ? "sheet" : "fixture";
}

/**
 * Credenciales de la base. La service key saltea RLS, así que este módulo es
 * `server-only` y la clave nunca llega al navegador: el login del sitio es lo
 * que protege los teléfonos y domicilios que trae la tabla.
 */
export function supabaseConfig(): { url: string; clave: string } {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const clave = process.env.SUPABASE_SERVICE_KEY?.trim();

  if (!url || !clave) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY. Están en Supabase, " +
        "en Project Settings > API. Ver web/README.md",
    );
  }
  return { url, clave };
}

/** Tabla de la base con el acumulado del mes en curso. */
export const TABLA_MENSUAL = process.env.SUPABASE_TABLA_MENSUAL?.trim() || "mensual";

/** Tabla de la base con lo que quedó sin cerrar en la jornada anterior. */
export const TABLA_AYER = process.env.SUPABASE_TABLA_AYER?.trim() || "ayer";

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
