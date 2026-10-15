"use server";

import { updateTag } from "next/cache";
import { modoDatos } from "@/lib/config";
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
    // La base localiza el caso en la tabla operativa o histórica dentro de la
    // misma transacción. Así una rotación concurrente no puede dejar el clic
    // aplicado sobre una tabla que la fila acaba de abandonar.
    const error = await actualizarCobroSiniestrado(id, cobrado, quien);
    if (error) return { ok: false, error };
  } catch {
    return { ok: false, error: "No se pudo confirmar el cobro. Actualizá la tabla antes de reintentar." };
  }
  updateTag("datos");
  return { ok: true };
}
