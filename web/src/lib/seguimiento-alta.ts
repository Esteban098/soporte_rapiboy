import "server-only";

import { updateTag } from "next/cache";
import { TABLA_SEGUIMIENTO } from "./config";
import { notificarMenciones } from "./notificaciones";
import { consultarRapiboyData } from "./rapiboy-data";
import {
  etapaDe,
  parsearSeguimiento,
  responsablesDesdeRapiboyData,
  type EtapaSeguimiento,
  type FilaSeguimiento,
} from "./seguimiento";
import { consultar, insertarFila } from "./supabase";

const MAX_ARCHIVOS = 5;
const MAX_COMENTARIO = 4000;
const MAX_RESPONSABLE = 200;
const RUTA_VALIDA = /^[a-zA-Z0-9._-]+\/[0-9a-f-]{36}-[a-zA-Z0-9._-]+$/;

export type DatosReporte = {
  casoId: string;
  driver: string;
  seller: string;
  comentario: string;
  archivos: string[];
  revision?: number;
};

export type ResultadoAlta = { ok: true; id: string } | { ok: false; error: string };

export type Previo = {
  total: number;
  ultimo: { texto: string; estado: EtapaSeguimiento; cuando: string | null } | null;
};

export async function responsablesDelCaso(
  casoId: string,
): Promise<{ driver: string | null; seller: string | null }> {
  if (!/^\d{1,12}$/.test(casoId)) return { driver: null, seller: null };
  const resultado = await consultarRapiboyData({ id: casoId, origen: "seguimiento" });
  if (!resultado.ok) {
    console.error(`[seguimiento] No se pudieron completar responsables: ${resultado.codigo}`);
    return { driver: null, seller: null };
  }
  return responsablesDesdeRapiboyData(resultado.datos);
}

/** Alta compartida por el tablero y la extensión; quien llama autentica al operador. */
export async function crearSeguimientoComo(quien: string, datos: DatosReporte): Promise<ResultadoAlta> {
  const casoId = datos.casoId.trim();
  const driver = datos.driver.trim();
  const seller = datos.seller.trim();
  const comentario = datos.comentario.trim();

  if (!casoId) return { ok: false, error: "Falta el id del caso." };
  if (!/^\d{1,12}$/.test(casoId)) return { ok: false, error: "El id del caso debe contener solo números." };
  if (!comentario) return { ok: false, error: "Escribí un comentario antes de enviar." };
  if (comentario.length > MAX_COMENTARIO) return { ok: false, error: "El comentario es demasiado largo." };
  if (driver.length > MAX_RESPONSABLE || seller.length > MAX_RESPONSABLE) {
    return { ok: false, error: "Driver o seller es demasiado largo." };
  }

  const archivos = datos.archivos.filter((ruta) => RUTA_VALIDA.test(ruta));
  if (archivos.length > MAX_ARCHIVOS) return { ok: false, error: `Se pueden adjuntar hasta ${MAX_ARCHIVOS} archivos.` };

  const encontrados = driver && seller
    ? { driver: null, seller: null }
    : await responsablesDelCaso(casoId);
  const id = crypto.randomUUID();
  const falla = await insertarFila(TABLA_SEGUIMIENTO, {
    id,
    caso_id: casoId,
    comentario_original: comentario,
    archivos,
    estado: "abierto",
    creado_por: quien,
    driver: driver || encontrados.driver,
    seller: seller || encontrados.seller,
  });
  if (falla) return { ok: false, error: falla };

  await notificarMenciones({ autor: quien, seguimientoId: id, casoId, texto: comentario });
  updateTag("seguimiento");
  return { ok: true, id };
}

export async function leerReportesDelCaso(casoId: string): Promise<Previo> {
  const caso = casoId.trim();
  if (!/^\d{1,12}$/.test(caso)) return { total: 0, ultimo: null };
  const filas = await consultar<FilaSeguimiento>(
    TABLA_SEGUIMIENTO,
    { caso_id: `eq.${caso}`, order: "created_at.desc", limit: "20" },
    "seguimiento",
  ).catch(() => []);
  if (filas.length === 0) return { total: 0, ultimo: null };

  const ultimo = parsearSeguimiento(filas[0]);
  return {
    total: filas.length,
    ultimo: {
      texto: ultimo.comentario,
      estado: etapaDe(ultimo),
      cuando: ultimo.creado?.toISOString() ?? null,
    },
  };
}
