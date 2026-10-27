import { responderPedidoAsistente } from "@/lib/asistente-endpoint";
import { operadorActual } from "@/lib/sesion";

/** Chat de la plataforma, autenticado por la sesión normal. */
export async function POST(pedido: Request) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false, error: "Sin permiso." }, { status: 403 });
  return responderPedidoAsistente(pedido, operador);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
