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

/** Avisos por persona: por ahora, menciones con arroba en los reportes. */
export const TABLA_NOTIFICACIONES =
  process.env.SUPABASE_TABLA_NOTIFICACIONES?.trim() || "notificaciones";

/** Tabla con quién colecta habitualmente cada comercio. */
export const TABLA_COLECTAS_ASIGNACION =
  process.env.SUPABASE_TABLA_COLECTAS_ASIGNACION?.trim() || "colectas_asignacion";

/** Tabla con las colectas realizadas, una fila por día, chofer y comercio. */
export const TABLA_COLECTAS = process.env.SUPABASE_TABLA_COLECTAS?.trim() || "colectas";

/* ---------- Live tracker ---------- */

/** Repartidores con operación del día y su última posición conocida. */
export const TABLA_TRACKER_DRIVERS =
  process.env.SUPABASE_TABLA_TRACKER_DRIVERS?.trim() || "tracker_drivers";

/**
 * La vista, no la tabla. Agrega `minutos_sin_actualizar` y `estado_posicion`,
 * que se calculan al leer porque una antigüedad guardada envejece mal.
 */
export const VISTA_TRACKER_DRIVERS =
  process.env.SUPABASE_VISTA_TRACKER_DRIVERS?.trim() || "tracker_drivers_vista";

/** Paquetes de las rutas del día, una fila por viaje. */
export const TABLA_TRACKER_PAQUETES =
  process.env.SUPABASE_TABLA_TRACKER_PAQUETES?.trim() || "tracker_paquetes";

/** Motivos confirmados que silencian una alerta de detención para esa jornada. */
export const TABLA_TRACKER_DEMORAS =
  process.env.SUPABASE_TABLA_TRACKER_DEMORAS?.trim() || "tracker_demoras";

/**
 * Tiendas, dropoff y la bodega, con su punto en el mapa.
 *
 * Es una tabla de referencia: la carga `supabase/migracion-06-lugares.sql`,
 * generado desde `datos/tiendas.kmz`, y no la escribe ningún flujo.
 */
export const TABLA_TRACKER_TIENDAS =
  process.env.SUPABASE_TABLA_TRACKER_TIENDAS?.trim() || "tracker_tiendas";

/**
 * De quién es cada tienda: Grupo A de Esteban, Grupo B de Candelaria.
 *
 * La crea `supabase/migracion-13-tiendas-responsables.sql` y se edita desde
 * la pantalla de Tiendas. Decide el color de cada comercio en todo el tablero.
 */
export const TABLA_TIENDAS_RESPONSABLES =
  process.env.SUPABASE_TABLA_TIENDAS_RESPONSABLES?.trim() || "tiendas_responsables";

/** El domicilio de cada chofer, por `IdMotoboy`. Misma procedencia. */
export const TABLA_TRACKER_CHOFERES =
  process.env.SUPABASE_TABLA_TRACKER_CHOFERES?.trim() || "tracker_choferes";

/** Una fila por corrida de n8n, con su resultado. */
export const TABLA_TRACKER_SYNC =
  process.env.SUPABASE_TABLA_TRACKER_SYNC?.trim() || "tracker_sincronizaciones";

/** Una fila por pregunta al asistente: quién, tokens y costo estimado. */
export const TABLA_ASISTENTE_USO =
  process.env.SUPABASE_TABLA_ASISTENTE_USO?.trim() || "asistente_uso";

/**
 * Preguntas por persona y por día de México. Un uso normal son decenas; el
 * tope está para que un bucle, un abuso o una sesión robada no se convierta
 * en una factura.
 */
export const TOPE_DIARIO_ASISTENTE = Number(process.env.ASISTENTE_TOPE_DIARIO ?? 150);

/** Bucket de Storage donde van los adjuntos de esos reportes. Privado. */
export const BUCKET_SEGUIMIENTO = process.env.SUPABASE_BUCKET_SEGUIMIENTO?.trim() || "seguimiento";

/** Vigencia en segundos de los enlaces firmados al bucket privado. */
export const FIRMA_SEGUNDOS = Number(process.env.SUPABASE_FIRMA_SEGUNDOS ?? 3600);

/**
 * La clave de TomTom para las capas de calles y tráfico del live tracker.
 *
 * Sin clave, las dos casillas no aparecen y el mapa es el de siempre. Con
 * clave, igual arrancan apagadas.
 *
 * Esta clave NO es secreta como las demás de este archivo: las teselas las
 * pide el navegador de cada persona y la clave va en la URL de cada una, así
 * que cualquiera que abra el tablero la puede ver. Por eso tiene que estar
 * restringida a los dominios del tablero en el portal de TomTom.
 */
export function claveTomTom(): string | null {
  return process.env.TOMTOM_API_KEY?.trim() || null;
}

/** Sin API key, los reportes se guardan sin resumen automático. */
export function openaiConfig(): { clave: string; modelo: string } | null {
  const clave = process.env.OPENAI_API_KEY?.trim();
  if (!clave) return null;
  return { clave, modelo: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini" };
}

/**
 * El asistente usa la misma clave pero su propio modelo: resumir dos oraciones
 * y elegir entre cinco herramientas son trabajos distintos, y un modelo chico
 * se equivoca de herramienta.
 */
export function asistenteConfig(): { clave: string; modelo: string } | null {
  const clave = process.env.OPENAI_API_KEY?.trim();
  if (!clave) return null;
  return { clave, modelo: process.env.OPENAI_MODELO_ASISTENTE?.trim() || "gpt-5-mini" };
}

/**
 * El flujo 11 de n8n, que trae el historial de un viaje desde RapiboyData.
 *
 * Va aparte de los `N8N_WEBHOOKS_*` porque no es un botón de refresco: no
 * escribe nada y devuelve datos, así que lleva token (`X-Rapiboy-Token`, la
 * credencial Header Auth del webhook). Sin URL, el asistente dice que no
 * puede consultar el historial en vez de fallar.
 */
export function historialViajeConfig(): { url: string; token: string | null } | null {
  const url = process.env.N8N_WEBHOOK_HISTORIAL_VIAJE?.trim();
  if (!url) return null;
  return { url, token: process.env.N8N_TOKEN_HISTORIAL_VIAJE?.trim() || null };
}

export function sheetId(): string {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("Falta SHEET_ID: ver web/README.md");
  return id;
}

/** Separa el refresco operativo de los históricos y las colectas. */
export type ClaveFlujo =
  | "global"
  | "historico"
  | "canceladosHistorico"
  | "colectas"
  | "trackerPosiciones"
  | "trackerPaquetes";

const VARIABLE_DE_FLUJO: Record<ClaveFlujo, string> = {
  global: "N8N_WEBHOOKS",
  historico: "N8N_WEBHOOKS_HISTORICO",
  canceladosHistorico: "N8N_WEBHOOKS_CANCELADOS_HISTORICO",
  colectas: "N8N_WEBHOOKS_COLECTAS",

  /*
   * Los dos del tracker van separados y no comparten webhook a propósito: son
   * las dos consultas que la pantalla puede pedir por separado. Mover un punto
   * en el mapa no tiene por qué rehacer la ruta entera, y rehacer la ruta no
   * tiene por qué esperar a que todos los dispositivos reporten.
   */
  trackerPosiciones: "N8N_WEBHOOKS_TRACKER_POSICIONES",
  trackerPaquetes: "N8N_WEBHOOKS_TRACKER_PAQUETES",
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
