import { operadorActual } from "@/lib/sesion";
import { listarChats } from "@/lib/chat-sellers";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await operadorActual()) return Response.json({ ok: false }, { status: 403 });
  try {
    return Response.json({ ok: true, chats: await listarChats() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "No se pudo cargar la bandeja." }, { status: 503 });
  }
}
