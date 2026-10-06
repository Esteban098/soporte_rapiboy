import { asignarContactoChat } from "@/lib/chat-sellers";
import { jsonLimitado } from "@/lib/chat-interno";
import { operadorActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const cuerpo = await jsonLimitado(request, 1024) as { sellerId?: unknown } | null;
  const sellerId = cuerpo?.sellerId == null || cuerpo.sellerId === "" ? null : Number(cuerpo.sellerId);
  if (sellerId !== null && (!Number.isSafeInteger(sellerId) || sellerId <= 0)) {
    return Response.json({ ok: false, error: "Seller inválido." }, { status: 400 });
  }
  try {
    const actualizado = await asignarContactoChat(id, sellerId, operador.email);
    return Response.json({ ok: actualizado }, { status: actualizado ? 200 : 409 });
  } catch {
    return Response.json({ ok: false, error: "No se pudo asignar el contacto." }, { status: 503 });
  }
}
