import "server-only";
import { consultarFresco, ejecutarRpc, TablaFaltante } from "./supabase";

export type ResultadoColaboracion = { ok: true; repetida?: boolean } | { ok: false; error: string };
export type ComentarioSeguimiento = { id: string; orden: number; autor: string; texto: string; creado_en: string; tipo: "legado" | "creacion" | "correccion" | "comentario"; anterior: string | null };
export const uuidSeguimiento = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const FALTA_COLABORACION = "Falta instalar la migración 55 de dos responsables y comentarios en Supabase.";

function errorSeguro(error: unknown): ResultadoColaboracion {
  return { ok: false, error: error instanceof TablaFaltante || /PGRST202|PGRST205|42703|404/.test(String(error)) ? FALTA_COLABORACION : "No se pudo completar. Reintentá o actualizá la pantalla." };
}

export async function tomarEn(id: string, actor: string, tomar: boolean, admin: boolean, objetivo?: string): Promise<ResultadoColaboracion> {
  if (!uuidSeguimiento(id) || typeof tomar !== "boolean" || (objetivo !== undefined && (typeof objetivo !== "string" || !objetivo.trim() || objetivo.length > 320))) return { ok: false, error: "Solicitud inválida." };
  actor = actor.trim().toLowerCase(); objetivo = objetivo?.trim().toLowerCase();
  if (objetivo && objetivo !== actor && (tomar || !admin)) return { ok: false, error: "Solo un administrador puede retirar a otra persona." };
  try { return await ejecutarRpc<ResultadoColaboracion>("seguimiento_tomar_doble", { p_id: id, p_actor: actor, p_tomar: tomar, p_objetivo: objetivo ?? null, p_admin: admin }); }
  catch (error) { return errorSeguro(error); }
}

export async function comentarEn(id: string, actor: string, texto: string, solicitud: string): Promise<ResultadoColaboracion> {
  if (!uuidSeguimiento(id) || !uuidSeguimiento(solicitud) || typeof texto !== "string" || !texto.trim() || texto.trim().length > 4000) return { ok: false, error: "Escribí un comentario de hasta 4.000 caracteres." };
  try { return await ejecutarRpc<ResultadoColaboracion>("seguimiento_agregar_comentario", { p_id: id, p_actor: actor, p_texto: texto.trim(), p_solicitud: solicitud }); }
  catch (error) { return errorSeguro(error); }
}

export async function leerComentariosEn(id: string, antes?: number) {
  if (!uuidSeguimiento(id) || (antes !== undefined && (!Number.isSafeInteger(antes) || antes < 1))) return { ok: false as const, error: "Solicitud inválida." };
  try {
    const filas = await consultarFresco<ComentarioSeguimiento>("seguimiento_comentarios", {
      select: "id,orden,autor,texto,creado_en,tipo,anterior", seguimiento_id: `eq.${id}`, order: "orden.desc", limit: "51",
      ...(antes !== undefined ? { orden: `lt.${antes}` } : {}),
    });
    const pagina = filas.slice(0, 50);
    return { ok: true as const, comentarios: pagina.reverse(), anteriores: filas.length > 50 ? Math.min(...pagina.map((c) => Number(c.orden))) : null };
  } catch (error) { return errorSeguro(error) as { ok: false; error: string }; }
}
