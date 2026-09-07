import "server-only";

/**
 * Pestaña con el detalle de los casos abiertos del mes en curso. Es la única
 * del libro que la web lee como fuente de pedidos: las pestañas de meses
 * anteriores quedaron como archivo y varias fueron vaciadas o reutilizadas, así
 * que no son una fuente confiable de historial.
 */
export const TAB_MENSUAL = process.env.SHEET_TAB_MENSUAL?.trim() || "Mensual";

export const TAB_AYER = "Ayer";

/** Viajes cancelados el mismo día en que se colectaron. */
export const TAB_CANCELADOS = "Cancelados";

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
  [TAB_CANCELADOS]: "399453788",
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
 * Prioridad automática: Supabase, Sheet, fixtures.
 * `ORIGEN_DATOS` permite forzar una fuente sin quitar credenciales.
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

/** Tabla operativa: mes anterior y actual hasta el día 9; actual desde el 10. */
export const TABLA_MENSUAL = process.env.SUPABASE_TABLA_MENSUAL?.trim() || "mensual";

/** Archivo físico de los meses que ya salieron de la operación. */
export const TABLA_MENSUAL_HISTORICO =
  process.env.SUPABASE_TABLA_MENSUAL_HISTORICO?.trim() || "mensual_historico";

/** Cola de casos nuevos de la jornada. */
export const TABLA_AYER = process.env.SUPABASE_TABLA_AYER?.trim() || "ayer";

/** Tabla de la base con los viajes cancelados el mismo día. */
export const TABLA_CANCELADOS = process.env.SUPABASE_TABLA_CANCELADOS?.trim() || "cancelados";

/** Archivo físico de cancelaciones de períodos ya cerrados. */
export const TABLA_CANCELADOS_HISTORICO =
  process.env.SUPABASE_TABLA_CANCELADOS_HISTORICO?.trim() || "cancelados_historico";

/** Tabla de la base con quién puede entrar al tablero y con qué permiso. */
export const TABLA_PERFILES = process.env.SUPABASE_TABLA_PERFILES?.trim() || "perfiles";

/** Tabla de la base con los reportes que carga el equipo desde el tablero. */
export const TABLA_SEGUIMIENTO = process.env.SUPABASE_TABLA_SEGUIMIENTO?.trim() || "seguimiento";

/** Tabla con quién colecta habitualmente cada comercio. */
export const TABLA_COLECTAS_ASIGNACION =
  process.env.SUPABASE_TABLA_COLECTAS_ASIGNACION?.trim() || "colectas_asignacion";

/** Tabla con las colectas realizadas, una fila por día, chofer y comercio. */
export const TABLA_COLECTAS = process.env.SUPABASE_TABLA_COLECTAS?.trim() || "colectas";

/** Bucket de Storage donde van los adjuntos de esos reportes. Privado. */
export const BUCKET_SEGUIMIENTO = process.env.SUPABASE_BUCKET_SEGUIMIENTO?.trim() || "seguimiento";

/** Vigencia en segundos de los enlaces firmados al bucket privado. */
export const FIRMA_SEGUNDOS = Number(process.env.SUPABASE_FIRMA_SEGUNDOS ?? 3600);

/** Sin API key, los reportes se guardan sin resumen automático. */
export function openaiConfig(): { clave: string; modelo: string } | null {
  const clave = process.env.OPENAI_API_KEY?.trim();
  if (!clave) return null;
  return { clave, modelo: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini" };
}

export function sheetId(): string {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("Falta SHEET_ID: ver web/README.md");
  return id;
}

/** Separa el refresco operativo de los históricos y las colectas. */
export type ClaveFlujo = "global" | "historico" | "canceladosHistorico" | "colectas";

const VARIABLE_DE_FLUJO: Record<ClaveFlujo, string> = {
  global: "N8N_WEBHOOKS",
  historico: "N8N_WEBHOOKS_HISTORICO",
  canceladosHistorico: "N8N_WEBHOOKS_CANCELADOS_HISTORICO",
  colectas: "N8N_WEBHOOKS_COLECTAS",
};

export function esClaveFlujo(valor: unknown): valor is ClaveFlujo {
  return typeof valor === "string" && valor in VARIABLE_DE_FLUJO;
}

/** Cómo se llama la variable de entorno, para poder decirlo en pantalla. */
export function variableDeFlujo(clave: ClaveFlujo): string {
  return VARIABLE_DE_FLUJO[clave];
}

/**
 * URLs de producción (`/webhook/`), separadas por coma y solo en el servidor.
 * Las URLs del editor (`/workflow/`) no ejecutan flujos.
 */
export function flujosDe(clave: ClaveFlujo): string[] {
  return (process.env[VARIABLE_DE_FLUJO[clave]] ?? "")
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
