import { descifrarTexto } from "@/lib/chat-cifrado";
import { autorizadoN8n, jsonLimitado } from "@/lib/chat-interno";
import { ejecutarRpc, consultarFresco } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Evento = { proveedor_id: string; conversacion_id: string; mensaje_id: string; estado: string };
type Mensaje = {
  id: string;
  conversacion_id: string;
  proveedor_id: string;
  tipo_contenido: string;
  contenido_cifrado: string;
  contenido_iv: string;
  contenido_tag: string;
};
type Conversacion = {
  id: string;
  seller_id: number | null;
  estado: "bot" | "pendiente" | "humano";
};

/** n8n reclama un evento y recibe texto/identidad solo por este canal privado. */
export async function POST(request: Request) {
  if (!autorizadoN8n(request)) return Response.json({ ok: false }, { status: 401 });
  const entrada = await jsonLimitado(request) as { eventId?: unknown } | null;
  const eventId = typeof entrada?.eventId === "string" ? entrada.eventId.trim() : "";
  if (!eventId || eventId.length > 200) return Response.json({ ok: false }, { status: 400 });

  const reclamado = await ejecutarRpc<boolean>("seller_chat_reclamar_evento", { p_proveedor_id: eventId });
  if (!reclamado) return Response.json({ ok: true, omitido: true });

  try {
    const eventos = await consultarFresco<Evento>("seller_chat_eventos", {
      proveedor_id: `eq.${eventId}`,
      limit: "1",
    });
    const evento = eventos[0];
    if (!evento) {
      await ejecutarRpc("seller_chat_evento_finalizar", { p_proveedor_id: eventId, p_error_codigo: "evento_inexistente" });
      return Response.json({ ok: false }, { status: 404 });
    }

    const [mensajes, conversaciones] = await Promise.all([
      consultarFresco<Mensaje>("seller_chat_mensajes", { id: `eq.${evento.mensaje_id}`, limit: "1" }),
      consultarFresco<Conversacion>("seller_chat_conversaciones", { id: `eq.${evento.conversacion_id}`, limit: "1" }),
    ]);
    const mensaje = mensajes[0];
    const conversacion = conversaciones[0];
    if (!mensaje || !conversacion) throw new Error("referencia_inexistente");

    // En cola solo procesa el bot para sellers reconocidos. Los números no
    // vinculados y contenidos no textuales quedan disponibles para atención humana.
    if (conversacion.estado !== "bot" || !conversacion.seller_id) {
      await ejecutarRpc("seller_chat_evento_finalizar", { p_proveedor_id: eventId });
      return Response.json({ ok: true, omitido: true, estado: conversacion.estado });
    }

    return Response.json({
      ok: true,
      eventoId: eventId,
      conversacionId: conversacion.id,
      sellerId: conversacion.seller_id,
      estado: conversacion.estado,
      texto: descifrarTexto({
        cifrado: mensaje.contenido_cifrado,
        iv: mensaje.contenido_iv,
        tag: mensaje.contenido_tag,
      }),
      tipoContenido: mensaje.tipo_contenido,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    await ejecutarRpc("seller_chat_evento_finalizar", { p_proveedor_id: eventId, p_error_codigo: "lectura_fallida" }).catch(() => false);
    return Response.json({ ok: false }, { status: 500 });
  }
}
