import "server-only";
import {
  TABLA_COLECTAS_ASIGNACION,
  TABLA_COLECTAS_VIVO,
  TABLA_COLECTAS_VIVO_DRIVERS,
  TABLA_COLECTAS_VIVO_POSICIONES,
} from "./config";
import { consultarTodo } from "./supabase";
import { diaDeOperacion } from "./tracker";
import type {
  ColectaVivoFila,
  ColectasDelDia,
  DriverVivoFila,
  PosicionRecorrido,
} from "./colectas-vivo";

/**
 * Lee la foto de las colectas de hoy.
 *
 * Sin caché: es una pantalla de «dónde está ahora», y una copia de hace una
 * hora mostraría al repartidor en la tienda que ya dejó. Son unas setenta
 * filas por día, así que leerlas en cada carga no le cuesta nada a nadie.
 *
 * El día es el de México (`diaDeOperacion`), no el del servidor: entre las
 * 18:00 y la medianoche de México el servidor de Vercel ya está en mañana.
 *
 * `sinPosiciones` saca las coordenadas del repartidor **acá**, en el
 * servidor. El rol comercial ve las colectas pero no el live tracker, y
 * esconder la capa en el navegador no alcanza: lo que llega, se puede mirar.
 */
export async function leerColectasDelDia(
  { sinPosiciones }: { sinPosiciones: boolean },
  dia = diaDeOperacion(),
): Promise<ColectasDelDia> {
  const [colectas, drivers, lugares] = await Promise.all([
    consultarTodo<ColectaVivoFila>(TABLA_COLECTAS_VIVO, { fecha_operacion: `eq.${dia}` }, "id_colecta.asc"),
    consultarTodo<DriverVivoFila>(
      TABLA_COLECTAS_VIVO_DRIVERS,
      { fecha_operacion: `eq.${dia}` },
      "id_motoboy.asc",
    ),
    lugaresDeColecta(),
  ]);

  return {
    dia,
    colectas,
    drivers: sinPosiciones
      ? drivers.map((d) => ({ ...d, latitud: null, longitud: null, posicion_en: null }))
      : drivers,
    lugarDeColecta: lugares,
    sinPosiciones,
  };
}

/**
 * El dropOFF de cada comercio, de la asignación del flujo 06.
 *
 * Es un agregado: si la tabla no existe o falla, las colectas se muestran
 * igual, sin el nombre del punto compartido.
 */
async function lugaresDeColecta(): Promise<Record<number, string>> {
  try {
    const filas = await consultarTodo<{ id_usuario: number; lugar_colecta: string | null }>(
      TABLA_COLECTAS_ASIGNACION,
      { select: "id_usuario,lugar_colecta", lugar_colecta: "ilike.dropoff*" },
      "id_usuario.asc",
    );
    return Object.fromEntries(
      filas.filter((f) => f.lugar_colecta).map((f) => [f.id_usuario, f.lugar_colecta as string]),
    );
  } catch {
    return {};
  }
}

/** Cuántos repartidores se pueden pedir de una vez. */
export const TOPE_RECORRIDOS = 25;

/**
 * Los reportes de posición de hoy de algunos repartidores, en orden de hora.
 *
 * No viaja con la página: son miles de filas por día y solo interesan las de
 * los repartidores que alguien eligió en el mapa, así que el navegador las
 * pide para esos. Quien llama decide si corresponde —el rol comercial no ve
 * posiciones—.
 *
 * Sin la migración 16 devuelve vacío: el mapa dibuja el recorrido igual, solo
 * con las tiendas por las que pasó.
 */
export async function leerRecorridos(
  ids: number[],
  dia = diaDeOperacion(),
): Promise<Record<number, PosicionRecorrido[]>> {
  const validos = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, TOPE_RECORRIDOS);
  if (validos.length === 0) return {};

  let filas: { id_motoboy: number; posicion_en: string; latitud: number; longitud: number }[];
  try {
    filas = await consultarTodo(
      TABLA_COLECTAS_VIVO_POSICIONES,
      {
        select: "id_motoboy,posicion_en,latitud,longitud",
        fecha_operacion: `eq.${dia}`,
        id_motoboy: `in.(${validos.join(",")})`,
      },
      "posicion_en.asc",
    );
  } catch {
    return {};
  }

  const porDriver: Record<number, PosicionRecorrido[]> = {};
  for (const f of filas) {
    (porDriver[f.id_motoboy] ??= []).push({ lat: f.latitud, lon: f.longitud, en: f.posicion_en });
  }
  return porDriver;
}
