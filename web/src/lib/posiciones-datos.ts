import "server-only";
import { VISTA_TRACKER_DRIVERS } from "./config";
import { consultarTodo } from "./supabase";
import {
  coordenadaValida,
  nombreDeDriver,
  type DriverFila,
  type EstadoPosicion,
} from "./tracker";

/**
 * La última posición conocida de cada repartidor en operación, para mostrarla
 * fuera del live tracker.
 *
 * Es deliberadamente mínima: nombre, coordenadas y qué tan vieja es. No trae
 * domicilio ni paquetes. Quien mira el mapa de tiendas quiere saber qué
 * repartidor anda cerca de un comercio, no la ruta de nadie, y lo que no viaja
 * al navegador no se puede filtrar.
 *
 * Solo la lee el servidor para admin y operador. El rol comercial está afuera
 * del live tracker a propósito, y esta función no puede ser la puerta trasera:
 * la página decide si la llama.
 */

export type PosicionDriver = {
  id: number;
  nombre: string;
  lat: number;
  lon: number;
  /** Cuándo reportó por última vez. */
  fecha: string | null;
  /** Calculado por la vista al leer. */
  minutos: number | null;
  estado: EstadoPosicion;
};

export async function leerPosiciones(): Promise<PosicionDriver[]> {
  const filas = await consultarTodo<DriverFila>(
    VISTA_TRACKER_DRIVERS,
    { activo: "is.true" },
    "id_motoboy.asc",
  );
  return aPosiciones(filas);
}

/**
 * Filas a posiciones. Las que no tienen coordenadas utilizables quedan afuera:
 * un repartidor sin GPS no tiene dónde dibujarse, y el (0, 0) caería en el
 * Atlántico.
 */
export function aPosiciones(filas: DriverFila[]): PosicionDriver[] {
  return filas
    .filter((f) => coordenadaValida(f.latitud, f.longitud))
    .map((f) => ({
      id: f.id_motoboy,
      nombre: nombreDeDriver(f),
      lat: f.latitud as number,
      lon: f.longitud as number,
      fecha: f.fecha_ultima_posicion,
      minutos: f.minutos_sin_actualizar,
      estado: f.estado_posicion,
    }));
}
