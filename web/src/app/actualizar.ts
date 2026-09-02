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
 * Corre los flujos de n8n de un botón y descarta la copia cacheada.

 * `clave` dice qué botón se apretó: el global de la barra o el propio de una
 * pantalla de histórico. Llega del navegador, así que se valida contra la lista
 * en vez de usarse para armar el nombre de una variable de entorno: sin eso,
 * cualquiera podría pedir que se lea otra.
 *
 * Es la única forma de traer datos nuevos desde el tablero. Antes había también
 * un botón Refrescar que solo vencía el caché sin tocar n8n; se sacó porque
 * partía la acción en dos y ninguna de las dos mitades era lo que la gente
 * quería: apretar Refrescar releía los mismos datos viejos, porque lo que
 * estaba desactualizado era la base, no la copia.
 *
 * El orden importa: primero corren los flujos, y recién cuando terminan se
 * invalida el caché. Al revés, el tablero volvería a leer la base vieja y los
 * datos nuevos aparecerían recién en la visita siguiente.
 *
 * Que un flujo falle no cancela la invalidación: la base pudo haber cambiado
 * por otro lado —la ingesta de la mañana, alguien editando— y la falla se
 * informa aparte.
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

  // `updateTag` y no `revalidateTag` porque acá el usuario está esperando el
  // dato nuevo: hace que el próximo pedido espere la lectura fresca en lugar de
  // servir la copia vieja mientras revalida por detrás.
  updateTag("datos");

  // Los reportes no los toca ningún flujo de n8n; el botón global igual los
  // invalida porque es el que la gente aprieta esperando ver todo al día.
  if (cual === "global") updateTag("seguimiento");

  return { flujos: flujos.length, exitosos: flujos.length - fallas.length, fallas };
}

/**
 * Lo que el flujo recibe en el cuerpo del webhook.
 *
 * `alcance` y el rango existen para que n8n pueda acotar la consulta. Sin
 * esto el flujo no tiene forma de saber qué se está mirando y termina
 * releyendo todo, que es justo lo que no queremos en el histórico: son muchos
 * más casos y la consulta arma un `IN (...)` con todos los ids.
 *
 * El tablero los manda; usarlos o ignorarlos es decisión del flujo. Mientras
 * n8n no los lea, el botón sigue haciendo lo mismo que antes.
 */
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
