"use server";

import { updateTag } from "next/cache";
import { TABLA_MENSUAL, TABLA_MENSUAL_HISTORICO, modoDatos } from "@/lib/config";
import { usuarioActual } from "@/lib/sesion";
import { esOrigenCobro } from "@/lib/siniestrados";
import { actualizarCobroSiniestrado } from "@/lib/supabase";

export async function marcarCobrado(id: number, cobrado: boolean, origen: unknown) {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };
  if (!Number.isSafeInteger(id) || id <= 0 || typeof cobrado !== "boolean" || !esOrigenCobro(origen)) {
    return { ok: false, error: "Datos de cobro inválidos." };
  }
  if (modoDatos() !== "supabase") return { ok: false, error: "El cobro solo se puede guardar en Supabase." };

  try {
    const tabla = origen === "mensual" ? TABLA_MENSUAL : TABLA_MENSUAL_HISTORICO;
    const error = await actualizarCobroSiniestrado(tabla, id, cobrado, quien);
    if (error) return { ok: false, error };
  } catch {
    return { ok: false, error: "No se pudo confirmar el cobro. Actualizá la tabla antes de reintentar." };
  }
  updateTag("datos");
  return { ok: true };
}
