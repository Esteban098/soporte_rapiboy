import "server-only";

import { historialViajeConfig } from "./config";

/** Una única puerta de solo lectura hacia RapiboyData, a través de n8n. */
const TIMEOUT_MS = 30_000;
const ENCABEZADO_TOKEN = "ChatBot-Rapiboy-Token";

export type ErrorRapiboyData =
  | "sin_configuracion"
  | "flujo_inactivo"
  | "token_rechazado"
  | "respuesta_invalida"
  | "sin_respuesta";

export type ResultadoRapiboyData =
  | { ok: true; datos: unknown }
  | { ok: false; codigo: ErrorRapiboyData; estado?: number; detalle?: string };

/**
 * Ejecuta el webhook autenticado que consulta RapiboyData.
 *
 * El navegador nunca recibe la URL ni el token. Los consumidores deciden cómo
 * presentar un error, pero comparten validación, timeout y credenciales.
 */
export async function consultarRapiboyData({
  id,
  entidad = "viaje",
  fecha = null,
  origen,
}: {
  id: string;
  entidad?: "viaje" | "colectas" | "motoboy";
  fecha?: string | null;
  origen: string;
}): Promise<ResultadoRapiboyData> {
  const config = historialViajeConfig();
  if (!config) return { ok: false, codigo: "sin_configuracion" };

  try {
    const respuesta = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { [ENCABEZADO_TOKEN]: config.token } : {}),
      },
      body: JSON.stringify({ origen, id, entidad, fecha }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) {
      const detalle = (await respuesta.text().catch(() => "")).slice(0, 300);
      const codigo = respuesta.status === 404
        ? "flujo_inactivo"
        : respuesta.status === 401 || respuesta.status === 403
          ? "token_rechazado"
          : "respuesta_invalida";
      return { ok: false, codigo, estado: respuesta.status, detalle };
    }

    return { ok: true, datos: await respuesta.json() };
  } catch {
    return { ok: false, codigo: "sin_respuesta" };
  }
}
