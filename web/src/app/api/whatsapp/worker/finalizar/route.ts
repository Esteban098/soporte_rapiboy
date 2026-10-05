import { autorizadoN8n, jsonLimitado } from "@/lib/chat-interno";
import { ejecutarRpc } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** n8n cierra o agenda un reintento; el error recibido debe ser un código, nunca texto del mensaje. */
export async function POST(request: Request) {
  if (!autorizadoN8n(request)) return Response.json({ ok: false }, { status: 401 });
  const entrada = await jsonLimitado(request) as {
    eventId?: unknown;
    errorCode?: unknown;
  } | null;
  const eventId = typeof entrada?.eventId === "string" ? entrada.eventId.trim() : "";
  const errorCode = typeof entrada?.errorCode === "string" ? entrada.errorCode : null;
  if (!eventId || eventId.length > 200 || (errorCode && !/^[a-z0-9_-]{1,80}$/.test(errorCode))) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const actualizado = await ejecutarRpc<boolean>("seller_chat_evento_finalizar", {
    p_proveedor_id: eventId,
    p_error_codigo: errorCode,
  });
  return Response.json({ ok: actualizado });
}
