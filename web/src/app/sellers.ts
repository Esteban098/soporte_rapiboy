"use server";

import { updateTag } from "next/cache";
import { TABLA_SELLERS_ACTIVOS } from "@/lib/config";
import { actualizarFilas } from "@/lib/supabase";
import { sesionActual } from "@/lib/sesion";

export type SoporteSeller = "CANDE" | "ESTEBAN";
export type ResultadoSoporte = { ok: true } | { ok: false; error: string };

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
