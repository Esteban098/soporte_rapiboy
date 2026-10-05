import { escalarChat, responderComoBot } from "@/lib/chat-sellers";
import { autorizadoN8n, jsonLimitado } from "@/lib/chat-interno";
import { consultarFresco, ejecutarRpc } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** n8n pasa el texto redactado; el servidor revalida el control antes de enviarlo a Meta. */
export async function POST(request: Request) {
  if (!autorizadoN8n(request)) return Response.json({ ok: false }, { status: 401 });
  const entrada = await jsonLimitado(request) as {
    eventId?: unknown;
    conversacionId?: unknown;
    texto?: unknown;
    derivar?: unknown;
  } | null;
  const eventId = typeof entrada?.eventId === "string" ? entrada.eventId.trim() : "";
  const conversacionId = typeof entrada?.conversacionId === "string" ? entrada.conversacionId : "";
  const texto = typeof entrada?.texto === "string" ? entrada.texto.trim() : "";
  if (!entrada || !eventId || eventId.length > 200 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversacionId) || !texto || texto.length > 4000) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const eventos = await consultarFresco<{ conversacion_id: string; estado: string }>("seller_chat_eventos", {
      proveedor_id: `eq.${eventId}`,
      limit: "1",
    });
    if (eventos[0]?.conversacion_id !== conversacionId || eventos[0]?.estado !== "procesando") {
      return Response.json({ ok: false, error: "El evento no pertenece a esta conversación o ya no está reclamado." }, { status: 409 });
    }

    let modo: "bot" | "pendiente" = "bot";
    if (entrada.derivar === true) {
      const escalado = await escalarChat(conversacionId);
      if (!escalado) {
        const actual = await consultarFresco<{ estado: string }>("seller_chat_conversaciones", {
          id: `eq.${conversacionId}`,
          limit: "1",
        });
        if (actual[0]?.estado === "bot") {
          await ejecutarRpc("seller_chat_evento_finalizar", {
            p_proveedor_id: eventId,
            p_error_codigo: "envio_en_curso",
          });
          return Response.json({ ok: false }, { status: 409 });
        }
        await ejecutarRpc("seller_chat_evento_finalizar", { p_proveedor_id: eventId });
        return Response.json({ ok: true, omitido: true });
      }
      modo = "pendiente";
    }

    const resultado = await responderComoBot(conversacionId, texto, modo, eventId);
    if (resultado.ventanaCerrada) {
      const escalado = await escalarChat(conversacionId);
      if (!escalado) {
        const actual = await consultarFresco<{ estado: string }>("seller_chat_conversaciones", {
          id: `eq.${conversacionId}`,
          limit: "1",
        });
        if (actual[0]?.estado === "bot") {
          await ejecutarRpc("seller_chat_evento_finalizar", {
            p_proveedor_id: eventId,
            p_error_codigo: "envio_en_curso",
          });
          return Response.json({ ok: false }, { status: 409 });
        }
      }
      await ejecutarRpc("seller_chat_evento_finalizar", { p_proveedor_id: eventId });
      return Response.json({ ok: true, omitido: true, derivado: true, error: resultado.error });
    }
    await ejecutarRpc("seller_chat_evento_finalizar", {
      p_proveedor_id: eventId,
      p_error_codigo: resultado.ok ? null : "envio_fallido",
    });
    return Response.json(resultado, { status: resultado.ok ? 200 : 502 });
  } catch {
    await ejecutarRpc("seller_chat_evento_finalizar", {
      p_proveedor_id: eventId,
      p_error_codigo: "procesamiento_fallido",
    }).catch(() => false);
    return Response.json({ ok: false }, { status: 500 });
  }
}
