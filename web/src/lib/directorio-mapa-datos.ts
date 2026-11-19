import "server-only";
import { TABLA_TRACKER_TIENDAS } from "./config";
import { consultarTodo } from "./supabase";
import { leerDriversDirectorio, leerSellersDirectorio } from "./directorio-datos";
import { armarPuntosDirectorio, type ReferenciaDirectorio } from "./directorio-mapa";

/** Solo devuelve puntos, sin teléfonos, correos ni grupos de WhatsApp. */
export async function leerMapaDirectorio(conDrivers: boolean) {
  const resultados = await Promise.allSettled([
    leerSellersDirectorio(),
    conDrivers ? leerDriversDirectorio() : Promise.resolve([]),
    consultarTodo<{ id_tienda: number | null; nombre_mapa: string; nombre: string; latitud: number; longitud: number }>(TABLA_TRACKER_TIENDAS, { select: "id_tienda,nombre_mapa,nombre,latitud,longitud" }, "nombre_mapa.asc"),
    conDrivers ? consultarTodo<{ id_motoboy: number; nombre: string; latitud: number; longitud: number }>("tracker_choferes", { select: "id_motoboy,nombre,latitud,longitud" }, "id_motoboy.asc") : Promise.resolve([]),
  ]);
  const [sellers, drivers, tiendas, choferes] = resultados;
  const referencias: ReferenciaDirectorio[] = [
    ...(tiendas.status === "fulfilled" ? tiendas.value.filter((s) => s.id_tienda !== null).map((s) => ({ id: s.id_tienda!, tipo: "seller" as const, nombre: s.nombre, clave: s.nombre_mapa, lat: s.latitud, lon: s.longitud })) : []),
    ...(choferes.status === "fulfilled" ? choferes.value.map((d) => ({ id: d.id_motoboy, tipo: "driver" as const, nombre: d.nombre, clave: String(d.id_motoboy), lat: d.latitud, lon: d.longitud })) : []),
  ];
  const ss = sellers.status === "fulfilled" ? sellers.value : [];
  const dd = drivers.status === "fulfilled" ? drivers.value : [];
  const puntos = armarPuntosDirectorio(ss, dd, referencias);
  const ubicados = new Set(puntos.map((p) => `${p.tipo}:${p.id}`));
  return { puntos, sinCoordenadas: ss.length + dd.length - ubicados.size,
    advertencias: resultados.flatMap((r, i) => r.status === "rejected" ? [`No se pudo leer ${["Sellers", "Drivers", "ubicaciones de sistema de sellers", "ubicaciones de sistema de drivers"][i]}. Los puntos disponibles se muestran igualmente.`] : []) };
}
