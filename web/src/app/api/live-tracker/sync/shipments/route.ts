import { operadorActual } from "@/lib/sesion";
import { ejecutarSync } from "../../nucleo";

/**
 * Actualizar paquetes.
 *
 * Corre la reconciliación completa del día: vuelve a preguntar cuáles son los
 * paquetes de las rutas de hoy y compara contra lo guardado. No parte de los
 * `tracking_id` que ya están en Supabase, y esa es la diferencia que hace que
 * un paquete agregado después de la carga inicial aparezca solo.
 */
export async function POST() {
  return ejecutarSync("trackerPaquetes", "paquetes", await operadorActual());
}

export const dynamic = "force-dynamic";
