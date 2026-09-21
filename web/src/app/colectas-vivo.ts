"use server";

import type { PosicionRecorrido } from "@/lib/colectas-vivo";
import { leerRecorridos } from "@/lib/colectas-vivo-datos";
import { dispararColectasVivo, type ResultadoColectasVivo } from "@/lib/colectas-vivo-sync";
import { operadorActual, sesionActual } from "@/lib/sesion";

/**
 * El botón «Actualizar» de las colectas en vivo, en el mapa de Tiendas.
 *
 * Pide sesión como cualquier acción, porque se puede invocar por HTTP
 * directo. Alcanza con `sesionActual()` y no con `operadorActual()`: el rol
 * comercial ve Tiendas y puede refrescar sus colectas. Lo que no recibe son
 * las posiciones, que la página saca antes de mandar nada al navegador.
 *
 * No invalida ninguna etiqueta de caché: la página de Tiendas no cachea, y el
 * navegador vuelve a pedirla apenas esto termina.
 */
export async function actualizarColectasEnVivo(): Promise<ResultadoColectasVivo> {
  return dispararColectasVivo((await sesionActual()) !== null);
}

/**
 * Por dónde anduvieron hoy los repartidores elegidos en el mapa.
 *
 * Con `operadorActual()`: el recorrido son posiciones, y el rol comercial no
 * las ve. Para él —o sin sesión— la respuesta es vacía, no un error: el mapa
 * sigue dibujando el camino por las tiendas visitadas.
 */
export async function recorridosDeRepartidores(ids: unknown): Promise<Record<number, PosicionRecorrido[]>> {
  if (!(await operadorActual())) return {};
  const lista = Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : [];
  return leerRecorridos(lista);
}
