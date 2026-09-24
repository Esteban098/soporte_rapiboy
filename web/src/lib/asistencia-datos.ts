import "server-only";

import { TABLA_ASISTENCIA_VOTOS, TABLA_DRIVERS_ACTIVOS } from "./config";
import { consultarTodo } from "./supabase";
import type { RespuestaAsistencia } from "./asistencia";

type VotoFila = {
  fecha_operacion: string;
  id_motoboy: number;
  respuesta: RespuestaAsistencia;
  origen: "ENCUESTA" | "MANUAL";
  votado_en: string;
};

type DriverFila = { id_motoboy: number; nombre: string; activo: boolean };

export type VotoAsistencia = {
  fechaOperacion: string;
  idMotoboy: number;
  respuesta: RespuestaAsistencia;
  origen: "ENCUESTA" | "MANUAL";
  votadoEn: string;
};

export type DriverAsistencia = { idMotoboy: number; nombre: string };

/** Datos mínimos para asistencia; el teléfono nunca sale de la tabla privada de vínculos. */
export async function leerAsistencia(desde: string, hasta: string): Promise<{
  votos: VotoAsistencia[];
  drivers: DriverAsistencia[];
}> {
  const [votos, drivers] = await Promise.all([
    consultarTodo<VotoFila>(
      TABLA_ASISTENCIA_VOTOS,
      { fecha_operacion: `gte.${desde}`, and: `(fecha_operacion.lte.${hasta})` },
      "fecha_operacion.desc,id_motoboy.asc",
    ),
    consultarTodo<DriverFila>(TABLA_DRIVERS_ACTIVOS, { activo: "eq.true", select: "id_motoboy,nombre,activo" }, "nombre.asc,id_motoboy.asc"),
  ]);

  return {
    votos: votos.map((voto) => ({
      fechaOperacion: voto.fecha_operacion,
      idMotoboy: Number(voto.id_motoboy),
      respuesta: voto.respuesta,
      origen: voto.origen,
      votadoEn: voto.votado_en,
    })),
    drivers: drivers.map((driver) => ({ idMotoboy: Number(driver.id_motoboy), nombre: driver.nombre })),
  };
}
