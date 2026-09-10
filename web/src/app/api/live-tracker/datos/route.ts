import { operadorActual } from "@/lib/sesion";
import { responderJornada } from "../nucleo";

/** La jornada, para que el mapa la relea sin perder selección ni encuadre. */
export async function GET() {
  return responderJornada(await operadorActual());
}

export const dynamic = "force-dynamic";
