import { marcarChatLeido } from "@/lib/chat-sellers";
import { operadorActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  try {
    return Response.json({ ok: await marcarChatLeido(id, operador.email) });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
