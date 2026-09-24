"use server";

import { updateTag } from "next/cache";
import { fechaOperacionAsistencia, respuestaAsistencia, type RespuestaAsistencia } from "@/lib/asistencia";
import { TABLA_ASISTENCIA_VOTOS } from "@/lib/config";
import { operadorActual } from "@/lib/sesion";
import { upsertFila } from "@/lib/supabase";

export type ResultadoAsistencia = { ok: true } | { ok: false; error: string };

/** Carga o corrige el voto diario desde la operación, siempre auditado por usuario. */
export async function guardarAsistencia(
  idMotoboy: unknown,
  respuestaCruda: unknown,
  fechaCruda: unknown,
): Promise<ResultadoAsistencia> {
  const operador = await operadorActual();
  if (!operador) return { ok: false, error: "Sin permiso para registrar asistencia." };

  const id = Number(idMotoboy);
  const respuesta = respuestaAsistencia(respuestaCruda);
  const fecha = fechaOperacionAsistencia(fechaCruda);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "El IdMotoboy no es válido." };
  if (!respuesta) return { ok: false, error: "La respuesta debe ser Sí o No." };
  if (!fecha) return { ok: false, error: "La fecha operativa no es válida." };

  return guardar({ idMotoboy: id, respuesta, fechaOperacion: fecha, origen: "MANUAL", quien: operador.email });
}

export async function guardarVotoWebhook(datos: {
  idMotoboy: number;
  respuesta: RespuestaAsistencia;
  fechaOperacion: string;
  idPoll?: string | null;
  votadoEn: string;
}): Promise<ResultadoAsistencia> {
  return guardar({ ...datos, origen: "ENCUESTA", quien: null });
}

async function guardar(datos: {
  idMotoboy: number;
  respuesta: RespuestaAsistencia;
  fechaOperacion: string;
  origen: "MANUAL" | "ENCUESTA";
  quien: string | null;
  idPoll?: string | null;
  votadoEn?: string;
}): Promise<ResultadoAsistencia> {
  const falla = await upsertFila(
    TABLA_ASISTENCIA_VOTOS,
    {
      fecha_operacion: datos.fechaOperacion,
      id_motoboy: datos.idMotoboy,
      respuesta: datos.respuesta,
      origen: datos.origen,
      id_poll: datos.idPoll?.slice(0, 200) || null,
      votado_en: datos.votadoEn ?? new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
      actualizado_por: datos.quien,
    },
    "fecha_operacion,id_motoboy",
  );
  if (falla) return { ok: false, error: falla };
  updateTag("asistencia");
  return { ok: true };
}
