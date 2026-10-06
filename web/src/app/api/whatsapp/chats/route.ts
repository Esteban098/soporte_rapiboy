import { operadorActual } from "@/lib/sesion";
import { listarChats } from "@/lib/chat-sellers";

export const dynamic = "force-dynamic";

export async function GET() {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  try {
    return Response.json({ ok: true, chats: await listarChats(operador.email) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "No se pudo cargar la bandeja." }, { status: 503 });
  }
}
