import { operadorActual } from "@/lib/sesion";
import { registrarMotivoDemora, type EntradaMotivoDemora } from "../nucleo";

/** Registra el inconveniente confirmado y silencia la alerta de esta jornada. */
export async function POST(pedido: Request) {
  const cuerpo = (await pedido.json().catch(() => ({}))) as EntradaMotivoDemora;
  return registrarMotivoDemora(await operadorActual(), cuerpo);
}

export const dynamic = "force-dynamic";
