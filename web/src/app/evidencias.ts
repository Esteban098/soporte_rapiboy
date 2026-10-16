"use server";

import { revalidatePath } from "next/cache";
import { actualizarFilas, ejecutarRpc } from "@/lib/supabase";
import { TABLA_EVIDENCIAS_CONFIG } from "@/lib/config";
import { alertasEmergentes, type DecisionEvidencia } from "@/lib/evidencias";
import { esAdmin, operadorActual } from "@/lib/sesion";

export async function revisarEvidencia(id: string, decision: DecisionEvidencia, comentario: string) {
  const operador = await operadorActual();
  if (!operador) return { ok: false, error: "No tenés permiso." } as const;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["CONFIRMADA", "DESCARTADA", "INCONCLUSA"].includes(decision)) {
    return { ok: false, error: "Datos inválidos." } as const;
  }
  const actualizada = await ejecutarRpc<boolean>("evidencia_entrega_revisar", {
    p_id: id, p_decision: decision, p_revisada_por: operador.email, p_comentario: comentario.slice(0, 1000),
  });
  if (!actualizada) return { ok: false, error: "El caso ya fue revisado por otra persona." } as const;
  revalidatePath("/evidencias");
  return { ok: true } as const;
}

export async function reabrirEvidencia(id: string) {
  const operador = await operadorActual();
  if (!operador) return { ok: false, error: "No tenés permiso." } as const;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Datos inválidos." } as const;
  const actualizada = await ejecutarRpc<boolean>("evidencia_entrega_reabrir", {
    p_id: id, p_reabierta_por: operador.email,
  });
  if (!actualizada) return { ok: false, error: "Ya no se puede reabrir esta evidencia." } as const;
  revalidatePath("/evidencias");
  return { ok: true } as const;
}

export async function actualizarConfiguracionEvidencias(datos: {
  modo: "OBSERVACION" | "ACTIVO"; minimo: number; maximo: number;
}) {
  const operador = await operadorActual();
  if (!operador || !await esAdmin()) return { ok: false, error: "Solo un administrador puede cambiar la configuración." } as const;
  if (!Number.isInteger(datos.minimo) || datos.minimo < 1 || datos.minimo > 10_000 ||
      !Number.isInteger(datos.maximo) || datos.maximo < 1 || datos.maximo > 100) {
    return { ok: false, error: "Configuración inválida." } as const;
  }
  const error = await actualizarFilas(TABLA_EVIDENCIAS_CONFIG, { id: "eq.true" }, {
    modo: datos.modo, minimo_muestra_score: datos.minimo,
    maximo_por_corrida: datos.maximo, actualizado_en: new Date().toISOString(), actualizado_por: operador.email,
  });
  if (error) return { ok: false, error } as const;
  revalidatePath("/evidencias");
  return { ok: true } as const;
}

export async function consultarAlertasEvidencias() {
  if (!await operadorActual()) return [];
  return alertasEmergentes();
}
