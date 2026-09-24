"use server";

import { updateTag } from "next/cache";
import { TABLA_SELLERS_ACTIVOS } from "@/lib/config";
import { actualizarFilas } from "@/lib/supabase";
import { sesionActual } from "@/lib/sesion";

export type SoporteSeller = "CANDE" | "ESTEBAN";
export type ResultadoSoporte = { ok: true } | { ok: false; error: string };
export type ResultadoUbicacion = { ok: true } | { ok: false; error: string };

/** Asigna el responsable operativo sin modificar los datos sincronizados por n8n. */
export async function asignarSoporteSeller(
  idUsuario: number,
  soporte: SoporteSeller,
): Promise<ResultadoSoporte> {
  const quien = (await sesionActual())?.email;
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
    return { ok: false, error: "El ID del seller no es válido." };
  }
  if (soporte !== "CANDE" && soporte !== "ESTEBAN") {
    return { ok: false, error: "Elegí Cande o Esteban." };
  }

  const falla = await actualizarFilas(
    TABLA_SELLERS_ACTIVOS,
    { id_usuario: `eq.${idUsuario}`, activo: "eq.true" },
    {
      soporte_asignado: soporte,
      soporte_asignado_por: quien,
      soporte_asignado_en: new Date().toISOString(),
    },
  );
  if (falla) return { ok: false, error: falla };
  updateTag("sellers-activos");
  return { ok: true };
}

export async function guardarUbicacionSeller(
  idUsuario: number,
  datos: { ubicacion: string; latitud: number; longitud: number } | null,
): Promise<ResultadoUbicacion> {
  const quien = (await sesionActual())?.email;
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
    return { ok: false, error: "El ID del seller no es válido." };
  }

  const cambios = datos === null
    ? {
        ubicacion_manual: null,
        latitud_manual: null,
        longitud_manual: null,
        ubicacion_manual_por: quien,
        ubicacion_manual_en: new Date().toISOString(),
      }
    : {
        ubicacion_manual: datos.ubicacion.trim() || null,
        latitud_manual: datos.latitud,
        longitud_manual: datos.longitud,
        ubicacion_manual_por: quien,
        ubicacion_manual_en: new Date().toISOString(),
      };

  if (datos !== null && (!Number.isFinite(datos.latitud) || datos.latitud < -90 || datos.latitud > 90 || !Number.isFinite(datos.longitud) || datos.longitud < -180 || datos.longitud > 180)) {
    return { ok: false, error: "La latitud o longitud no es válida." };
  }
  if (datos !== null && (!datos.ubicacion.trim() || (datos.latitud === 0 && datos.longitud === 0))) {
    return { ok: false, error: "Completá la ubicación y unas coordenadas válidas." };
  }

  const falla = await actualizarFilas(
    TABLA_SELLERS_ACTIVOS,
    { id_usuario: `eq.${idUsuario}`, activo: "eq.true" },
    cambios,
  );
  if (falla) return { ok: false, error: falla };
  updateTag("sellers-activos");
  return { ok: true };
}

/** Guarda el punto manual del KMZ para un driver sin tocar los datos de SQL. */
export async function guardarUbicacionDriver(
  idMotoboy: number,
  datos: { ubicacion: string; latitud: number; longitud: number } | null,
): Promise<ResultadoUbicacion> {
  const quien = (await sesionActual())?.email;
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };
  if (!Number.isSafeInteger(idMotoboy) || idMotoboy <= 0) return { ok: false, error: "El ID del driver no es válido." };
  if (datos !== null && (!datos.ubicacion.trim() || !Number.isFinite(datos.latitud) || datos.latitud < -90 || datos.latitud > 90 || !Number.isFinite(datos.longitud) || datos.longitud < -180 || datos.longitud > 180)) {
    return { ok: false, error: "Completá la ubicación y unas coordenadas válidas." };
  }
  const cambios = datos === null
    ? { ubicacion_manual: null, latitud_manual: null, longitud_manual: null }
    : { ubicacion_manual: datos.ubicacion.trim(), latitud_manual: datos.latitud, longitud_manual: datos.longitud };
  const falla = await actualizarFilas("drivers_activos", { id_motoboy: `eq.${idMotoboy}`, activo: "eq.true" }, cambios);
  if (falla) return { ok: false, error: falla };
  updateTag("drivers-activos");
  return { ok: true };
}
