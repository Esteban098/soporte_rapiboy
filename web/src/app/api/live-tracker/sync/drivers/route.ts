import { operadorActual } from "@/lib/sesion";
import { ejecutarSync } from "../../nucleo";

/**
 * La mitad «posiciones» del botón Actualizar.
 *
 * Corre el flujo que relee `Motoboy.Latitud` y `Motoboy.Longitud` de los
 * repartidores con reserva vigente. No mira paquetes. El botón la llama
 * después de la de paquetes, así que un repartidor recién sumado ya tiene
 * posición en la misma pasada.
 */
export async function POST() {
  return ejecutarSync("trackerPosiciones", "drivers", await operadorActual());
}

/** Sin caché y sin GET: nada que servir sin correr el flujo. */
export const dynamic = "force-dynamic";
