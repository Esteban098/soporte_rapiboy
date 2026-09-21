import "server-only";
import { TIMEOUT_FLUJO_MS, flujosDe, variableDeFlujo } from "./config";
import { ZONA_OPERACION, diaDeOperacion } from "./tracker";

export type ResultadoColectasVivo = { ok: boolean; mensaje: string | null };

/**
 * Lo que manda el tablero al flujo 12. El día lo decide la web, en hora de
 * México, y viaja como texto: el servidor de la web, el de n8n y el de la
 * base pueden estar en tres zonas distintas.
 */
export type CuerpoColectasVivo = {
  origen: "tablero";
  momento: string;
  alcance: "colectasVivo";
  dia: string;
  zona: string;
};

/**
 * Dispara el flujo que relee las colectas de hoy y la posición de sus
 * repartidores, y espera a que termine.
 *
 * No escribe en Supabase: quien escribe es n8n, con su credencial. La web
 * dispara y después vuelve a leer.
 *
 * Quién pide entra como parámetro y no se resuelve acá: `@/lib/sesion`
 * arrastra next-auth, que no carga bajo la condición con la que corren las
 * pruebas. Así el rechazo sin sesión se puede probar de verdad.
 */
export async function dispararColectasVivo(
  autorizado: boolean,
  momento: Date = new Date(),
): Promise<ResultadoColectasVivo> {
  if (!autorizado) return { ok: false, mensaje: "Sin permiso para actualizar las colectas." };

  // Un solo webhook: dos corridas del mismo flujo en paralelo escribirían las
  // mismas filas y no ganarían nada.
  const [url] = flujosDe("colectasVivo");
  if (!url) {
    return {
      ok: false,
      mensaje: `No hay flujo configurado. Se carga en ${variableDeFlujo("colectasVivo")}, con la URL de producción del flujo 12.`,
    };
  }

  const cuerpo: CuerpoColectasVivo = {
    origen: "tablero",
    momento: momento.toISOString(),
    alcance: "colectasVivo",
    dia: diaDeOperacion(momento),
    zona: ZONA_OPERACION,
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
      return {
        ok: false,
        mensaje:
          respuesta.status === 404
            ? "n8n no reconoce el webhook (404). Si el flujo está en modo prueba, hay que activarlo."
            : `El flujo respondió ${respuesta.status}. Se muestra la última foto guardada.`,
      };
    }
    return { ok: true, mensaje: null };
  } catch (error) {
    const vencido = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      mensaje: vencido
        ? `El flujo sigue corriendo después de ${Math.round(TIMEOUT_FLUJO_MS / 1000)} s.`
        : "No se pudo contactar a n8n. Se muestra la última foto guardada.",
    };
  }
}
