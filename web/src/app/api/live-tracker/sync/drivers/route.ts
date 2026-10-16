import { operadorActual } from "@/lib/sesion";
import { ejecutarSync } from "../../nucleo";

/**
 * La mitad «posiciones» del botón Actualizar.
 *
 * Relee la ubicación más reciente entre Motoboy y los eventos de HistorialViaje
 * atribuidos al driver por su reserva histórica. El botón inicia este flujo
 * en paralelo con paquetes; cada sincronización tiene su propio lock.
 */
export async function POST() {
  return ejecutarSync("trackerPosiciones", "drivers", await operadorActual());
}

/** Sin caché y sin GET: nada que servir sin correr el flujo. */
export const dynamic = "force-dynamic";
