import { operadorActual } from "@/lib/sesion";
import { cerrarChat, eliminarChat, tomarChat } from "@/lib/chat-sellers";
import { jsonLimitado } from "@/lib/chat-interno";

export const dynamic = "force-dynamic";

function uuidValido(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!uuidValido(id)) {
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

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!uuidValido(id)) return Response.json({ ok: false }, { status: 400 });
  try {
    const eliminado = await eliminarChat(id, operador.email);
    return Response.json({ ok: eliminado }, { status: eliminado ? 200 : 404 });
  } catch {
    return Response.json({ ok: false, error: "No se pudo eliminar la conversación." }, { status: 503 });
  }
}
