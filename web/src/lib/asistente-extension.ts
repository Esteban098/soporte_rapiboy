import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { TABLA_ASISTENTE_EXTENSION_TOKENS, TABLA_PERFILES } from "./config";
import { buscarPerfil } from "./perfiles";
import { actualizarFila, consultarFresco, TablaFaltante, upsertFila } from "./supabase";
import type { Operador } from "./sesion";

const DIAS_DE_VIGENCIA = 180;

type FilaToken = {
  id: string;
  perfil_id: string;
  token_hash: string;
  created_at: string;
  vence_en: string;
  ultimo_uso: string | null;
  revocado_en: string | null;
};

export type EstadoTokenExtension = {
  disponible: boolean;
  vinculado: boolean;
  venceEn: Date | null;
};

export function hashTokenExtension(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function filaDelPerfil(perfilId: string): Promise<FilaToken | null> {
  const filas = await consultarFresco<FilaToken>(TABLA_ASISTENTE_EXTENSION_TOKENS, {
    perfil_id: "eq." + perfilId,
    limit: "1",
  });
  return filas[0] ?? null;
}

export async function estadoTokenExtension(email: string): Promise<EstadoTokenExtension> {
  const perfil = await buscarPerfil(email);
  if (!perfil) return { disponible: true, vinculado: false, venceEn: null };

  try {
    const fila = await filaDelPerfil(perfil.id);
    const venceEn = fila?.vence_en ? new Date(fila.vence_en) : null;
    return {
      disponible: true,
      vinculado:
        Boolean(fila) &&
        !fila?.revocado_en &&
        Boolean(venceEn && venceEn.getTime() > Date.now()),
      venceEn,
    };
  } catch (error) {
    if (error instanceof TablaFaltante) {
      return { disponible: false, vinculado: false, venceEn: null };
    }
    throw error;
  }
}

export async function generarTokenExtension(
  email: string,
): Promise<{ token: string; venceEn: Date } | { error: string }> {
  const perfil = await buscarPerfil(email);
  if (!perfil || !perfil.activo || perfil.rol === "comercial") {
    return { error: "Tu perfil no puede vincular el Asistente." };
  }

  const token = "rbx_" + randomBytes(32).toString("base64url");
  const venceEn = new Date(Date.now() + DIAS_DE_VIGENCIA * 24 * 60 * 60 * 1000);
  const falla = await upsertFila(
    TABLA_ASISTENTE_EXTENSION_TOKENS,
    {
      perfil_id: perfil.id,
      token_hash: hashTokenExtension(token),
      created_at: new Date().toISOString(),
      vence_en: venceEn.toISOString(),
      ultimo_uso: null,
      revocado_en: null,
    },
    "perfil_id",
  );
  return falla ? { error: falla } : { token, venceEn };
}

export async function revocarTokenExtension(email: string): Promise<string | null> {
  const perfil = await buscarPerfil(email);
  if (!perfil) return "No hay un perfil para vincular.";

  try {
    const fila = await filaDelPerfil(perfil.id);
    if (!fila) return null;
    return actualizarFila(TABLA_ASISTENTE_EXTENSION_TOKENS, fila.id, {
      revocado_en: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof TablaFaltante) return "Falta instalar la migración de la extensión.";
    throw error;
  }
}

/** Autentica un Bearer personal y vuelve a comprobar el perfil en cada pedido. */
export async function operadorDesdeTokenExtension(request: Request): Promise<Operador | null> {
  const cabecera = request.headers.get("authorization")?.trim() ?? "";
  const coincidencia = /^Bearer (rbx_[A-Za-z0-9_-]{40,})$/.exec(cabecera);
  if (!coincidencia) return null;

  let fila: FilaToken | undefined;
  try {
    const filas = await consultarFresco<FilaToken>(TABLA_ASISTENTE_EXTENSION_TOKENS, {
      token_hash: "eq." + hashTokenExtension(coincidencia[1]),
      revocado_en: "is.null",
      vence_en: "gt." + new Date().toISOString(),
      limit: "1",
    });
    fila = filas[0];
  } catch (error) {
    if (error instanceof TablaFaltante) return null;
    throw error;
  }
  if (!fila) return null;

  const perfiles = await consultarFresco<{ email: string; rol: string; activo: boolean }>(
    TABLA_PERFILES,
    { id: "eq." + fila.perfil_id, activo: "eq.true", limit: "1" },
  );
  const perfil = perfiles[0];
  if (!perfil || perfil.rol === "comercial") return null;

  await actualizarFila(TABLA_ASISTENTE_EXTENSION_TOKENS, fila.id, {
    ultimo_uso: new Date().toISOString(),
  }).catch(() => null);

  return {
    email: perfil.email,
    rol: perfil.rol === "admin" ? "admin" : "operador",
  };
}
