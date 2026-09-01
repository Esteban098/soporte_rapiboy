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

/**
 * Modifica una fila por id. Devuelve `null` si salió bien.
 *
 * El id va como `string | number` porque no todas las tablas lo tienen
 * numérico: `mensual` usa el id del viaje y `seguimiento` un uuid.
 */
export async function actualizarFila(
  tabla: string,
  id: string | number,
  cambios: Record<string, unknown>,
): Promise<string | null> {
  const respuesta = await pedir(`${encodeURIComponent(tabla)}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(cambios),
    headers: { prefer: "return=minimal" },
    cache: "no-store",
  });
  return respuesta.ok ? null : motivoDeFalla(respuesta);
}

/** Borra una fila por id. Devuelve `null` si salió bien. */
export async function borrarFila(tabla: string, id: string | number): Promise<string | null> {
  const respuesta = await pedir(`${encodeURIComponent(tabla)}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { prefer: "return=minimal" },
    cache: "no-store",
  });
  return respuesta.ok ? null : motivoDeFalla(respuesta);
}

/**
 * Lee una tabla como JSON, sin pasarla por la forma del CSV.
 *
 * `leerTabla` existe para que el sheet y la base compartan normalizador; acá no
 * hace falta, porque `seguimiento` nunca vivió en el libro y no tiene con qué
 * compartir. Devolver el JSON tal cual evita el rodeo de pasar todo a texto
 * para volver a parsearlo.
 *
 * La etiqueta de caché va aparte de `"datos"`: los reportes cambian cuando
 * alguien escribe uno, no cuando corre n8n, y no tiene sentido que guardar un
 * comentario tire abajo la lectura del mes entero.
 */
export async function consultar<T>(
  tabla: string,
  parametros: Record<string, string>,
  etiqueta: string,
): Promise<T[]> {
  const consulta = new URLSearchParams({ select: "*", ...parametros });
  const respuesta = await pedir(`${encodeURIComponent(tabla)}?${consulta}`, {
    next: { revalidate: REVALIDAR_SEGUNDOS, tags: [etiqueta] },
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");

    // "La tabla no existe" no es lo mismo que "la base falló": es el estado
    // normal de una sección recién agregada, antes de correr su script. Se
    // distingue con un error propio para que la pantalla pueda explicar qué
    // falta en vez de mostrar un 500.
    if (respuesta.status === 404 && detalle.includes("PGRST205")) {
      throw new TablaFaltante(tabla);
    }

    throw new Error(
      `No se pudo leer la tabla "${tabla}" de Supabase (HTTP ${respuesta.status}). ` +
        `Revisá que exista: el script está en web/supabase/. ${detalle}`.trim(),
    );
  }
  return (await respuesta.json()) as T[];
}

/** La tabla todavía no está creada en la base. */
export class TablaFaltante extends Error {
  constructor(readonly tabla: string) {
    super(`La tabla "${tabla}" todavía no existe en Supabase.`);
    this.name = "TablaFaltante";
  }
}

/**
 * Lee una tabla sin caché, filtrando por lo que se le pase.
 *
 * Existe aparte de `consultar` porque hay lecturas que no pueden servir una
 * copia guardada: el login busca el perfil y su contraseña, y una copia de hace
 * una hora dejaría entrar con la clave vieja después de cambiarla.
 */
export async function consultarFresco<T>(
  tabla: string,
  parametros: Record<string, string>,
): Promise<T[]> {
  const consulta = new URLSearchParams({ select: "*", ...parametros });
  const respuesta = await pedir(`${encodeURIComponent(tabla)}?${consulta}`, {
    cache: "no-store",
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    if (respuesta.status === 404 && detalle.includes("PGRST205")) throw new TablaFaltante(tabla);
    throw new Error(`No se pudo leer la tabla "${tabla}" (HTTP ${respuesta.status}).`);
  }
  return (await respuesta.json()) as T[];
}

/**
 * Pide una URL de subida firmada para una ruta del bucket.
 *
 * El archivo NO pasa por el servidor: el navegador lo manda directo a Supabase
 * con esta URL, que vale para esa ruta y nada más. Es la única forma que
 * aguanta una foto de teléfono. Una Server Action tiene 1 MB de cuerpo por
 * defecto y en Vercel el techo de una función es 4,5 MB, así que proxear el
 * archivo fallaría justo con el caso normal —una foto de 5 u 8 MB—, y encima lo
 * haría viajar dos veces.
 *
 * La service key se queda acá igual: lo que sale al navegador es un token
 * atado a una ruta, no una credencial del proyecto.
 */
export async function firmarSubida(
  bucket: string,
  ruta: string,
): Promise<{ url: string } | { error: string }> {
  const { url, clave } = supabaseConfig();
  const respuesta = await fetch(
    `${url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${rutaCodificada(ruta)}`,
    {
      method: "POST",
      headers: { apikey: clave, authorization: `Bearer ${clave}` },
      cache: "no-store",
    },
  ).catch(() => null);

  if (!respuesta?.ok) {
    if (respuesta?.status === 404) {
      return { error: `Falta el bucket "${bucket}". Corré web/supabase/seguimiento.sql.` };
    }
    return {
      error: `No se pudo preparar la subida (HTTP ${respuesta?.status ?? "sin respuesta"}).`,
    };
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as { url?: string } | null;
  if (!cuerpo?.url) return { error: "Supabase no devolvió una URL de subida." };

  // Viene relativa al servicio de storage; el navegador necesita la absoluta.
  return { url: `${url}/storage/v1${cuerpo.url}` };
}

/**
 * Firma varias rutas de una sola vez y devuelve ruta -> URL temporal.
 *
 * En lote y no una por una: una tabla con veinte reportes con adjuntos serían
 * veinte viajes a Supabase antes de pintar nada. Las rutas que fallen quedan
 * fuera del mapa en lugar de romper la página: un adjunto que no abre es un
 * problema menor que una pantalla en blanco.
 */
export async function firmarArchivos(
  bucket: string,
  rutas: string[],
  segundos: number,
): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>();
  if (rutas.length === 0) return firmadas;

  const { url, clave } = supabaseConfig();
  const respuesta = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: {
      apikey: clave,
      authorization: `Bearer ${clave}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expiresIn: segundos, paths: rutas }),
    cache: "no-store",
  }).catch(() => null);

  if (!respuesta?.ok) return firmadas;

  const lista = (await respuesta.json().catch(() => [])) as {
    path?: string | null;
    signedURL?: string | null;
  }[];

  for (const item of lista) {
    if (item.path && item.signedURL) firmadas.set(item.path, `${url}/storage/v1${item.signedURL}`);
  }
  return firmadas;
}

/**
 * Lee una fila por id, sin caché.
 *
 * Se usa antes de borrar, para saber qué adjuntos tiene. Va sin caché a
 * propósito: una copia vieja acá significaría borrar los archivos equivocados o
 * dejar los verdaderos huérfanos.
 */
export async function leerFila<T>(tabla: string, id: string | number): Promise<T | null> {
  const respuesta = await pedir(
    `${encodeURIComponent(tabla)}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { cache: "no-store" },
  );
  if (!respuesta.ok) return null;

  const filas = (await respuesta.json().catch(() => [])) as T[];
  return filas[0] ?? null;
}

/**
 * Borra archivos del bucket. Devuelve `null` si salió bien.
 *
 * Va junto con el borrado de la fila que los nombra: si se borrara solo la
 * fila, nadie volvería a saber que esos archivos existen y quedarían ocupando
 * el bucket para siempre.
 */
export async function borrarArchivos(bucket: string, rutas: string[]): Promise<string | null> {
  if (rutas.length === 0) return null;

  const { url, clave } = supabaseConfig();
  const respuesta = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: {
      apikey: clave,
      authorization: `Bearer ${clave}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prefixes: rutas }),
    cache: "no-store",
  }).catch(() => null);

  if (respuesta?.ok) return null;
  return `No se pudieron borrar los adjuntos (HTTP ${respuesta?.status ?? "sin respuesta"}).`;
}

/** Codifica cada tramo de la ruta por separado, para no escapar las barras. */
function rutaCodificada(ruta: string): string {
  return ruta.split("/").map(encodeURIComponent).join("/");
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
