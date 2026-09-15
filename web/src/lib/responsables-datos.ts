import "server-only";
import { TABLA_TIENDAS_RESPONSABLES } from "./config";
import { consultar, consultarFresco } from "./supabase";
import { indexarResponsables, type FilaResponsable } from "./responsables";

/**
 * Etiqueta de caché de la distribución. Va aparte de `"datos"`: cambia cuando
 * alguien reasigna una tienda, no cuando corre n8n.
 */
export const ETIQUETA_RESPONSABLES = "tiendas-responsables";

/** Unas cuatrocientas filas: se traen todas de una, con margen de sobra. */
const LIMITE = "5000";

/**
 * La tabla entera, sin caché, para la pantalla que la edita y para revisar
 * choques antes de guardar: ahí una copia de hace una hora dejaría repetir un
 * nombre que alguien acaba de cargar.
 */
export async function leerResponsables(): Promise<FilaResponsable[]> {
  return consultarFresco<FilaResponsable>(TABLA_TIENDAS_RESPONSABLES, {
    order: "nombre.asc",
    limit: LIMITE,
  });
}

/**
 * El índice clave → dueño que usa todo el tablero para pintar las tiendas.
 *
 * Se lee en el layout, así que va cacheado: pedirlo fresco sería una consulta
 * más en cada navegación. Guardar una tienda invalida la etiqueta.
 *
 * Nunca tira. El color es un dato accesorio: si falta la tabla o la base no
 * responde, el tablero se ve como antes y cada pantalla sigue funcionando.
 */
export async function indiceResponsables(): Promise<Record<string, string>> {
  try {
    const filas = await consultar<FilaResponsable>(
      TABLA_TIENDAS_RESPONSABLES,
      { select: "nombre,alias,responsable", limit: LIMITE },
      ETIQUETA_RESPONSABLES,
    );
    return indexarResponsables(filas);
  } catch {
    return {};
  }
}
