import "server-only";
import { ejecutarRpc } from "./supabase";
import type { DecisionEvidencia } from "./evidencias";

export async function guardarRevisionesLote(ids: string[], decision: DecisionEvidencia, comentario: string, revisor: string) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
      ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
      !["CONFIRMADA", "DESCARTADA", "INCONCLUSA"].includes(decision) || typeof comentario !== "string") {
    throw new Error("Datos inválidos. Seleccioná entre 1 y 100 evidencias por lote.");
  }
  const unicos = [...new Set(ids)];
  const guardadas: string[] = [];
  const conflictos: string[] = [];
  const fallidas: string[] = [];
  for (let inicio = 0; inicio < unicos.length; inicio += 5) {
    await Promise.all(unicos.slice(inicio, inicio + 5).map(async (id) => {
      try {
        const ok = await ejecutarRpc<boolean>("evidencia_entrega_revisar", {
          p_id: id, p_decision: decision, p_revisada_por: revisor, p_comentario: comentario.slice(0, 1000),
        });
        (ok ? guardadas : conflictos).push(id);
      } catch {
        fallidas.push(id);
      }
    }));
  }
  return { guardadas, conflictos, fallidas };
}
