"use server";

import { updateTag } from "next/cache";
import { TIMEOUT_FLUJO_MS, esClaveFlujo, flujosDe, type ClaveFlujo } from "@/lib/config";
import { esMesValido } from "@/lib/periodos";

export type ResultadoActualizacion = {
  /** Cuántos flujos se dispararon y cuántos respondieron bien. */
  flujos: number;
  exitosos: number;
  /** Un mensaje por flujo que falló, para mostrarlo en el tablero. */
  fallas: string[];
};

/**
 * Ejecuta los flujos y después invalida el caché, incluso si alguno falla.
 * La clave del navegador se valida contra los alcances permitidos.
 */
export async function actualizarDatos(
  clave: unknown = "global",
  periodo?: unknown,
): Promise<ResultadoActualizacion> {
  const cual: ClaveFlujo = esClaveFlujo(clave) ? clave : "global";
  const rango = rangoPedido(periodo);
  const flujos = flujosDe(cual);
  const resultados = await Promise.all(flujos.map((url) => ejecutarFlujo(url, cual, rango)));
  const fallas = resultados.filter((r): r is string => r !== null);

  // `updateTag` espera datos frescos; `revalidateTag` puede servir la copia vieja.
  updateTag("datos");

  // El refresco global también relee los reportes, aunque n8n no los modifica.
  if (cual === "global") updateTag("seguimiento");

  return { flujos: flujos.length, exitosos: flujos.length - fallas.length, fallas };
}

/** El alcance y el rango permiten a n8n acotar el refresco histórico. */
export type CuerpoFlujo = {
  origen: "tablero";
  momento: string;
  alcance: ClaveFlujo;
  desde: string | null;
  hasta: string | null;
};

/** El rango que manda el navegador, o `null` si no es un par de meses válido. */
function rangoPedido(valor: unknown): { desde: string; hasta: string } | null {
  if (typeof valor !== "object" || valor === null) return null;
  const { desde, hasta } = valor as { desde?: unknown; hasta?: unknown };
  if (!esMesValido(desde) || !esMesValido(hasta)) return null;
  return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
}

/** Dispara un flujo. Devuelve `null` si salió bien, o el motivo de la falla. */
async function ejecutarFlujo(
  url: string,
  alcance: ClaveFlujo,
  rango: { desde: string; hasta: string } | null,
): Promise<string | null> {
  const nombre = nombreDeFlujo(url);
  const cuerpo: CuerpoFlujo = {
    origen: "tablero",
    momento: new Date().toISOString(),
    alcance,
    desde: rango?.desde ?? null,
    hasta: rango?.hasta ?? null,
  };

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_FLUJO_MS),
    });

    if (!respuesta.ok) {
      return respuesta.status === 404
        ? `${nombre}: n8n no reconoce ese webhook (404). Si el flujo está en modo prueba, hay que activarlo.`
        : `${nombre}: respondió ${respuesta.status}`;
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return `${nombre}: sigue corriendo después de ${Math.round(TIMEOUT_FLUJO_MS / 1000)} s`;
    }
    return `${nombre}: no se pudo contactar`;
  }
}

/** Último tramo de la URL del webhook, que es como se identifica el flujo. */
function nombreDeFlujo(url: string): string {
  try {
    const partes = new URL(url).pathname.split("/").filter(Boolean);
    return partes.at(-1) ?? url;
  } catch {
    return url;
  }
}
