import "server-only";
import { TABLA_SELLERS_ACTIVOS, TABLA_TRACKER_TIENDAS } from "./config";
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
  const [filas, sellers] = await Promise.all([
    consultarTodo<LugarFila>(TABLA_TRACKER_TIENDAS, {}, "nombre_mapa.asc"),
    consultarTodo<{ id_usuario: number; latitud_manual: number | null; longitud_manual: number | null }>(
      TABLA_SELLERS_ACTIVOS,
      { activo: "is.true", select: "id_usuario,latitud_manual,longitud_manual" },
      "id_usuario.asc",
    ).catch(() => []),
  ]);
  const ubicaciones = new Map(
    sellers
      .filter((seller) => Number.isFinite(seller.latitud_manual) && Number.isFinite(seller.longitud_manual))
      .map((seller) => [seller.id_usuario, seller]),
  );
  return ordenarLugares(
    filas.map((fila) => {
      const ubicacion = fila.id_tienda == null ? null : ubicaciones.get(fila.id_tienda);
      return ubicacion
        ? { ...fila, latitud: ubicacion.latitud_manual as number, longitud: ubicacion.longitud_manual as number }
        : fila;
    }),
  );
}
