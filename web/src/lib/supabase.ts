import "server-only";
import { REVALIDAR_SEGUNDOS, supabaseConfig } from "./config";

/**
 * Lee una tabla de Supabase y la devuelve con la misma forma que el CSV del
 * libro: primero el encabezado, después las filas, todo como texto.
 *
 * Parece un rodeo —la base ya devuelve JSON tipado— pero es lo que hace que la
 * migración no toque nada más. `mapearColumnas` ubica cada campo por nombre de
 * encabezado y `parsearPedido` ya sabe leer fechas ISO, que es justo como
 * PostgREST devuelve las columnas `date`. Manteniendo la forma, el sheet y la
 * base pasan por exactamente el mismo código: las mismas reglas de estado, los
 * mismos cierres, los mismos bordes. Si en cambio armáramos el `Pedido` directo
 * desde el JSON, tendríamos dos caminos que se van separando con cada arreglo.
 */
export async function leerTabla(tabla: string): Promise<string[][]> {
  const filas = await traerTodo(tabla);
  if (filas.length === 0) return [];

  // El encabezado sale de la tabla y no de una lista fija: así, agregar una
  // columna en Supabase alcanza para que aparezca en el tablero.
  const columnas = Object.keys(filas[0]);
  return [columnas, ...filas.map((fila) => columnas.map((c) => aTexto(fila[c])))];
}

/**
 * Un pedido a PostgREST con las credenciales puestas.
 *
 * La service key saltea RLS, así que este módulo es `server-only`: nunca llega
 * al navegador. Lo que protege los datos es el login del sitio.
 */
async function pedir(ruta: string, init: RequestInit & { next?: NextFetchRequestConfig }) {
  const { url, clave } = supabaseConfig();
  return fetch(`${url}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: clave,
      authorization: `Bearer ${clave}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

/**
 * Traduce un error de PostgREST a algo que sirva leer en pantalla.
 *
 * El caso que más importa es el 23505: alguien intenta cargar un caso que ya
 * está en la tabla. Es el error esperable de la operación, no una falla.
 */
async function motivoDeFalla(respuesta: Response): Promise<string> {
  const cuerpo = await respuesta.text().catch(() => "");
  if (cuerpo.includes("23505")) return "Ese caso ya está cargado.";
  if (respuesta.status === 401 || respuesta.status === 403) {
    return "La base rechazó la credencial. Revisá SUPABASE_SERVICE_KEY.";
  }
  return `La base respondió ${respuesta.status}. ${cuerpo}`.trim();
}

/** Inserta una fila. Devuelve `null` si salió bien, o el motivo de la falla. */
export async function insertarFila(
  tabla: string,
  fila: Record<string, unknown>,
): Promise<string | null> {
  const respuesta = await pedir(encodeURIComponent(tabla), {
    method: "POST",
    body: JSON.stringify(fila),
    headers: { prefer: "return=minimal" },
    cache: "no-store",
  });
  return respuesta.ok ? null : motivoDeFalla(respuesta);
}

/** Modifica una fila por id. Devuelve `null` si salió bien. */
export async function actualizarFila(
  tabla: string,
  id: number,
  cambios: Record<string, unknown>,
): Promise<string | null> {
  const respuesta = await pedir(`${encodeURIComponent(tabla)}?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(cambios),
    headers: { prefer: "return=minimal" },
    cache: "no-store",
  });
  return respuesta.ok ? null : motivoDeFalla(respuesta);
}

/** Borra una fila por id. Devuelve `null` si salió bien. */
export async function borrarFila(tabla: string, id: number): Promise<string | null> {
  const respuesta = await pedir(`${encodeURIComponent(tabla)}?id=eq.${id}`, {
    method: "DELETE",
    headers: { prefer: "return=minimal" },
    cache: "no-store",
  });
  return respuesta.ok ? null : motivoDeFalla(respuesta);
}

/** PostgREST corta en 1000 filas por pedido, así que se pagina hasta el final. */
const PAGINA = 1000;

async function traerTodo(tabla: string): Promise<Record<string, unknown>[]> {
  const todo: Record<string, unknown>[] = [];

  for (let desde = 0; ; desde += PAGINA) {
    // Sin un orden explícito, Postgres puede devolver la misma fila en dos
    // páginas y saltearse otra. Con la clave primaria el recorrido es estable.
    const consulta = new URLSearchParams({
      select: "*",
      limit: String(PAGINA),
      offset: String(desde),
      order: "id.asc",
    });

    const respuesta = await pedir(`${encodeURIComponent(tabla)}?${consulta}`, {
      next: { revalidate: REVALIDAR_SEGUNDOS, tags: ["datos"] },
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      throw new Error(
        `No se pudo leer la tabla "${tabla}" de Supabase (HTTP ${respuesta.status}). ` +
          `Revisá SUPABASE_URL, SUPABASE_SERVICE_KEY y que la tabla exista. ${detalle}`.trim(),
      );
    }

    const pagina = (await respuesta.json()) as Record<string, unknown>[];
    todo.push(...pagina);
    if (pagina.length < PAGINA) return todo;
  }
}

/**
 * Pasa un valor de la base al texto que espera el normalizador.
 *
 * Los `null` van a cadena vacía y no a "null" porque el resto de la app trata
 * el vacío como "no hay dato": si llegara el texto "null", aparecería escrito
 * en las celdas del tablero.
 */
function aTexto(valor: unknown): string {
  if (valor == null) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor);
}
