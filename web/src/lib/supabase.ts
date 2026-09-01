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

/** PostgREST corta en 1000 filas por pedido, así que se pagina hasta el final. */
const PAGINA = 1000;

async function traerTodo(tabla: string): Promise<Record<string, unknown>[]> {
  const { url, clave } = supabaseConfig();
  const todo: Record<string, unknown>[] = [];

  for (let desde = 0; ; desde += PAGINA) {
    const pedido = new URL(`${url}/rest/v1/${encodeURIComponent(tabla)}`);
    pedido.searchParams.set("select", "*");
    pedido.searchParams.set("limit", String(PAGINA));
    pedido.searchParams.set("offset", String(desde));
    // Sin un orden explícito, Postgres puede devolver la misma fila en dos
    // páginas y saltearse otra. Con la clave primaria el recorrido es estable.
    pedido.searchParams.set("order", "id.asc");

    const respuesta = await fetch(pedido, {
      headers: { apikey: clave, authorization: `Bearer ${clave}` },
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
