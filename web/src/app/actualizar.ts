"use server";

import { updateTag } from "next/cache";
import { TIMEOUT_FLUJO_MS, flujosActualizacion } from "@/lib/config";

export type ResultadoActualizacion = {
  /** Cuántos flujos se dispararon y cuántos respondieron bien. */
  flujos: number;
  exitosos: number;
  /** Un mensaje por flujo que falló, para mostrarlo en el tablero. */
  fallas: string[];
};

/**
 * Vuelve a leer el sheet, sin tocar n8n.
 *
 * Es la mitad barata de `actualizarDatos`: descarta la copia guardada y listo.
 * Sirve para cuando alguien editó la planilla a mano y quiere verlo en el
 * tablero ya, sin esperar el minuto que tardan los flujos en rearmar las hojas.
 *
 * `updateTag` es lo que hace que sirva de verdad. La lectura del sheet se
 * guarda por `SHEET_REVALIDATE` segundos y, cuando ese plazo vence, Next
 * entrega igual la copia vieja mientras busca la nueva por detrás: por eso
 * refrescar el navegador a veces muestra lo de antes y recién al segundo
 * intento aparece el cambio. `updateTag` vence la copia en el acto y obliga al
 * próximo pedido a esperar el dato fresco.
 */
export async function refrescarDatos(): Promise<void> {
  updateTag("sheet");
}

/**
 * Rearma el libro y descarta la copia cacheada del sheet.
 *
 * El orden importa: primero corren los flujos de n8n que rehacen las pestañas,
 * y recién cuando terminan se invalida el caché. Al revés, el tablero volvería
 * a leer el sheet viejo y los datos nuevos llegarían después de refrescar.
 *
 * Que un flujo falle no cancela la actualización: se invalida igual, porque el
 * sheet pudo haber cambiado por otro lado, y la falla se informa aparte.
 */
export async function actualizarDatos(): Promise<ResultadoActualizacion> {
  const flujos = flujosActualizacion();
  const resultados = await Promise.all(flujos.map(ejecutarFlujo));
  const fallas = resultados.filter((r): r is string => r !== null);

  // `updateTag` y no `revalidateTag` porque acá el usuario está esperando el
  // dato nuevo: hace que el próximo pedido espere la lectura fresca en lugar de
  // servir la copia vieja mientras revalida por detrás.
  updateTag("sheet");

  return { flujos: flujos.length, exitosos: flujos.length - fallas.length, fallas };
}

/** Dispara un flujo. Devuelve `null` si salió bien, o el motivo de la falla. */
async function ejecutarFlujo(url: string): Promise<string | null> {
  const nombre = nombreDeFlujo(url);

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origen: "tablero", momento: new Date().toISOString() }),
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
