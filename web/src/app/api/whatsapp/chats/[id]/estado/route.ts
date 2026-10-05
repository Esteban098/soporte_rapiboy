import { operadorActual } from "@/lib/sesion";
import { cerrarChat, tomarChat } from "@/lib/chat-sellers";
import { jsonLimitado } from "@/lib/chat-interno";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const cuerpo = await jsonLimitado(request, 1024) as { accion?: unknown } | null;
  if (cuerpo?.accion !== "tomar" && cuerpo?.accion !== "cerrar") {
    return Response.json({ ok: false, error: "Acción inválida." }, { status: 400 });
  }
  const cambio = cuerpo.accion === "tomar"
    ? await tomarChat(id, operador.email)
    : await cerrarChat(id, operador.email);
  return Response.json({ ok: cambio }, { status: cambio ? 200 : 409 });
}
