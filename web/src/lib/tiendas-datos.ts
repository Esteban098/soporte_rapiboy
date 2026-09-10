import "server-only";
import { TABLA_TRACKER_TIENDAS } from "./config";
import { consultarTodo } from "./supabase";
import { ordenarLugares, type Lugar, type LugarFila } from "./tiendas";

/**
 * Lee la tabla de tiendas entera.
 *
 * Son sesenta y cinco filas que no cambian solas, así que se traen todas de
 * una: paginar o filtrar del lado del servidor sería más código para la misma
 * respuesta. El filtro por texto lo hace el navegador sobre lo que ya tiene,
 * que es lo que hace que escribir en el buscador no espere a la red.
 *
 * No se cachea porque la tabla se recarga a mano cuando operaciones actualiza
 * el mapa, y ese es exactamente el momento en que alguien entra a comprobar
 * que el cambio quedó.
 */
export async function leerLugares(): Promise<Lugar[]> {
  const filas = await consultarTodo<LugarFila>(TABLA_TRACKER_TIENDAS, {}, "nombre_mapa.asc");
  return ordenarLugares(filas);
}
