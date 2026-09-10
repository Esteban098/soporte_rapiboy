import { operadorActual } from "@/lib/sesion";
import { ejecutarSync } from "../../nucleo";

/**
 * Actualizar posiciones.
 *
 * Corre el flujo que relee `Motoboy.Latitud` y `Motoboy.Longitud` de los
 * repartidores con reserva vigente. No mira paquetes: es la mitad barata de la
 * pantalla y por eso tiene botón propio, para poder pedirla seguido sin
 * arrastrar la reconciliación entera de la ruta.
 */
export async function POST() {
  return ejecutarSync("trackerPosiciones", "drivers", await operadorActual());
}

/** Sin caché y sin GET: nada que servir sin correr el flujo. */
export const dynamic = "force-dynamic";
