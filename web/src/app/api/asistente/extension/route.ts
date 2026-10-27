import { responderPedidoAsistente } from "@/lib/asistente-endpoint";
import { operadorDesdeTokenExtension } from "@/lib/asistente-extension";

export async function POST(pedido: Request) {
  const operador = await operadorDesdeTokenExtension(pedido);
  if (!operador) {
    return Response.json({ ok: false, error: "Vinculación inválida o vencida." }, { status: 401 });
  }
  return responderPedidoAsistente(pedido, operador);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
