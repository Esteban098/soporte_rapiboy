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

/** Tabla operativa: mes anterior y actual hasta el día 9; actual desde el 10. */
export const TABLA_MENSUAL = process.env.SUPABASE_TABLA_MENSUAL?.trim() || "mensual";

/** Archivo físico de los meses que ya salieron de la operación. */
export const TABLA_MENSUAL_HISTORICO =
  process.env.SUPABASE_TABLA_MENSUAL_HISTORICO?.trim() || "mensual_historico";

/** Tabla de la base con lo que quedó sin cerrar en la jornada anterior. */
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

/** Tabla con quién colecta habitualmente cada seller. */
export const TABLA_COLECTAS_ASIGNACION =
  process.env.SUPABASE_TABLA_COLECTAS_ASIGNACION?.trim() || "colectas_asignacion";

/** Tabla con las colectas realizadas, una fila por día, chofer y seller. */
export const TABLA_COLECTAS = process.env.SUPABASE_TABLA_COLECTAS?.trim() || "colectas";

/** Bucket de Storage donde van los adjuntos de esos reportes. Privado. */
export const BUCKET_SEGUIMIENTO = process.env.SUPABASE_BUCKET_SEGUIMIENTO?.trim() || "seguimiento";

/**
 * Cuánto vive una URL firmada de adjunto, en segundos.
 *
 * Corta a propósito: la firma se pide al pintar la página, así que una hora
 * alcanza de sobra para mirar la foto, y un link que se copie a otro lado deja
 * de servir enseguida. El bucket es privado; esto es lo único que da acceso.
 */
export const FIRMA_SEGUNDOS = Number(process.env.SUPABASE_FIRMA_SEGUNDOS ?? 3600);

/**
 * Modelo que resume los comentarios, o `null` si no está configurado.
 *
 * Devuelve `null` en lugar de tirar error porque el resumen es opcional: sin
 * `OPENAI_API_KEY` el tablero sigue tomando reportes y los guarda sin resumir.
 * Es la diferencia entre una función de más y una función que falta.
 */
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

/**
 * Qué botón Actualizar dispara qué flujos.
 *
 * Hay uno global en la barra y uno propio en cada pantalla de histórico. Están
 * separados porque hacen cosas distintas y tardan distinto: el global refresca
 * el mes en curso, que es lo que la operación mira todo el día, mientras que
 * los de histórico vuelven a preguntar por meses cerrados —muchos más casos, y
 * una consulta que no tiene sentido correr cada vez que alguien quiere ver la
 * cola de hoy.
 */
export type ClaveFlujo = "global" | "historico" | "canceladosHistorico" | "colectas";

const VARIABLE_DE_FLUJO: Record<ClaveFlujo, string> = {
  global: "N8N_WEBHOOKS",
  historico: "N8N_WEBHOOKS_HISTORICO",
  canceladosHistorico: "N8N_WEBHOOKS_CANCELADOS_HISTORICO",
  colectas: "N8N_WEBHOOKS_COLECTAS",
};

export const CLAVES_FLUJO = Object.keys(VARIABLE_DE_FLUJO) as ClaveFlujo[];

export function esClaveFlujo(valor: unknown): valor is ClaveFlujo {
  return typeof valor === "string" && valor in VARIABLE_DE_FLUJO;
}

/** Cómo se llama la variable de entorno, para poder decirlo en pantalla. */
export function variableDeFlujo(clave: ClaveFlujo): string {
  return VARIABLE_DE_FLUJO[clave];
}

/**
 * Los webhooks de un botón, en el orden en que deben correr.
 *
 * Son las *Production URL* del nodo Webhook de cada flujo
 * (`https://…/webhook/…`), separadas por coma. La URL del editor
 * (`https://…/workflow/…`) no sirve: devuelve la interfaz de n8n y no ejecuta
 * nada.
 *
 * Viven en el servidor: el navegador nunca ve estas URLs, así nadie puede
 * disparar los flujos desde afuera del tablero.
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
