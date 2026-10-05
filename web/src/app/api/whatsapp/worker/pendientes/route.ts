import { autorizadoN8n } from "@/lib/chat-interno";
import { consultarFresco } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Devuelve solo IDs opacos; el reclamo atómico ocurre en /worker/evento. */
export async function GET(request: Request) {
  if (!autorizadoN8n(request)) return Response.json({ ok: false }, { status: 401 });
  try {
    const filas = await consultarFresco<{ proveedor_id: string }>("seller_chat_eventos", {
      select: "proveedor_id",
      estado: "in.(pendiente,fallido,procesando)",
      disponible_en: `lte.${new Date().toISOString()}`,
      order: "creado_en.asc",
      limit: "50",
    });
    return Response.json({ eventos: filas.map((fila) => fila.proveedor_id) }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
