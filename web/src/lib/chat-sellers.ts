import "server-only";
import { randomUUID } from "node:crypto";
import { cifrarTexto, descifrarTexto } from "./chat-cifrado";
import { actualizarFila, actualizarFilaSi, consultarFresco, ejecutarRpc, insertarFila } from "./supabase";

type FilaChat = {
  id: string;
  canal: "directo" | "grupo";
  seller_id: number | null;
  estado: "bot" | "pendiente" | "humano";
  asignado_a: string | null;
  ultima_entrada_en: string | null;
  ultimo_mensaje_en: string | null;
  cerrado_en: string | null;
  contacto_cifrado: string;
  contacto_iv: string;
  contacto_tag: string;
  ultimo_mensaje_cifrado: string | null;
  ultimo_mensaje_iv: string | null;
  ultimo_mensaje_tag: string | null;
};

type FilaMensaje = {
  id: string;
  evento_id?: string | null;
  creado_en: string;
  direccion: "entrante" | "saliente";
  autor_tipo: "seller" | "bot" | "operador";
  autor_email: string | null;
  tipo_contenido: string;
  contenido_cifrado: string;
  contenido_iv: string;
  contenido_tag: string;
  estado_envio: "pendiente" | "enviado" | "fallido" | "revision" | null;
};

const VENTANA_ATENCION_MS = 24 * 60 * 60 * 1000;

function ventanaAbierta(ultimaEntrada: string | null): boolean {
  if (!ultimaEntrada) return false;
  const fecha = new Date(ultimaEntrada).getTime();
  return Number.isFinite(fecha) && Date.now() - fecha < VENTANA_ATENCION_MS;
}

function abrir(cifrado: string, iv: string, tag: string): string {
  return descifrarTexto({ cifrado, iv, tag });
}

async function marcarUltimoMensaje(
  conversacionId: string,
  fecha: string,
  cifrado: { cifrado: string; iv: string; tag: string },
): Promise<string | null> {
  const resultado = await actualizarFilaSi("seller_chat_conversaciones", conversacionId, {
    or: `(ultimo_mensaje_en.is.null,ultimo_mensaje_en.lte.${fecha})`,
  }, {
    ultimo_mensaje_en: fecha,
    ultimo_mensaje_cifrado: cifrado.cifrado,
    ultimo_mensaje_iv: cifrado.iv,
    ultimo_mensaje_tag: cifrado.tag,
    actualizado_en: new Date().toISOString(),
  });
  return "error" in resultado ? resultado.error : null;
}

export async function listarChats() {
  const filas = await consultarFresco<FilaChat>("seller_chat_conversaciones", {
    order: "ultimo_mensaje_en.desc.nullslast",
    limit: "300",
  });
  return filas.map((chat) => ({
    id: chat.id,
    canal: chat.canal,
    sellerId: chat.seller_id,
    estado: chat.estado,
    asignadoA: chat.asignado_a,
    ultimaEntradaEn: chat.ultima_entrada_en,
    ventanaAbierta: ventanaAbierta(chat.ultima_entrada_en),
    ultimoMensajeEn: chat.ultimo_mensaje_en,
    cerradoEn: chat.cerrado_en,
    telefono: abrir(chat.contacto_cifrado, chat.contacto_iv, chat.contacto_tag),
    extracto: chat.ultimo_mensaje_cifrado
      ? abrir(chat.ultimo_mensaje_cifrado, chat.ultimo_mensaje_iv ?? "", chat.ultimo_mensaje_tag ?? "")
      : "",
  }));
}

export async function leerMensajes(conversacionId: string) {
  const filas = await consultarFresco<FilaMensaje>("seller_chat_mensajes", {
    conversacion_id: `eq.${conversacionId}`,
    order: "creado_en.asc",
    limit: "500",
  });
  return filas.map((mensaje) => ({
    id: mensaje.id,
    creadoEn: mensaje.creado_en,
    direccion: mensaje.direccion,
    autorTipo: mensaje.autor_tipo,
    autorEmail: mensaje.autor_email,
    tipoContenido: mensaje.tipo_contenido,
    estadoEnvio: mensaje.estado_envio,
    texto: abrir(mensaje.contenido_cifrado, mensaje.contenido_iv, mensaje.contenido_tag),
  }));
}

export async function tomarChat(conversacionId: string, email: string): Promise<boolean> {
  return ejecutarRpc<boolean>("seller_chat_tomar", {
    p_conversacion_id: conversacionId,
    p_email: email,
  });
}

export async function cerrarChat(conversacionId: string, email: string): Promise<boolean> {
  return ejecutarRpc<boolean>("seller_chat_cerrar", {
    p_conversacion_id: conversacionId,
    p_email: email,
  });
}

async function enviarMensaje(
  chat: FilaChat,
  texto: string,
  autorTipo: "bot" | "operador",
  autorEmail: string | null,
  estadoEsperado: "bot" | "pendiente" | "humano",
  eventoId?: string,
): Promise<{ ok: boolean; error?: string; omitido?: boolean; ventanaCerrada?: boolean }> {
  const conversacionId = chat.id;
  if (chat.estado !== estadoEsperado) return { ok: false, error: "La conversación cambió de estado." };
  const chats = await consultarFresco<FilaChat>("seller_chat_conversaciones", {
    id: `eq.${conversacionId}`,
    limit: "1",
  });
  const actual = chats[0];
  if (!actual || actual.estado !== estadoEsperado || actual.asignado_a !== chat.asignado_a) {
    return { ok: false, error: "La conversación cambió de estado." };
  }
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const version = process.env.META_GRAPH_API_VERSION?.trim();
  if (!token || !phoneId || !version || !/^v\d+\.\d+$/.test(version)) {
    return { ok: false, error: "Falta configurar el envío de WhatsApp en el servidor." };
  }

  const respuestaRepetida = async(): Promise<{ ok: boolean; error?: string; omitido?: boolean } | null> => {
    if (!eventoId) return null;
    const filas = await consultarFresco<FilaMensaje>("seller_chat_mensajes", {
      evento_id: `eq.${eventoId}`,
      limit: "1",
    });
    const previa = filas[0];
    if (!previa) return null;
    if (previa.estado_envio === "enviado") {
      const error = await marcarUltimoMensaje(conversacionId, previa.creado_en, {
        cifrado: previa.contenido_cifrado,
        iv: previa.contenido_iv,
        tag: previa.contenido_tag,
      });
      return error ? { ok: false, error } : { ok: true, omitido: true };
    }

    const error = await actualizarFila("seller_chat_mensajes", previa.id, { estado_envio: "revision" });
    if (!error) {
      const escalado = await escalarChat(conversacionId).catch(() => false);
      if (!escalado) {
        const actual = await consultarFresco<FilaChat>("seller_chat_conversaciones", {
          id: `eq.${conversacionId}`,
          limit: "1",
        });
        if (actual[0]?.estado === "bot") {
          return { ok: false, error: "El envío previo sigue en curso; el evento se reintentará." };
        }
      }
    }
    return error
      ? { ok: false, error }
      : { ok: true, omitido: true };
  };

  const existente = await respuestaRepetida();
  if (existente) return existente;

  if (!ventanaAbierta(actual.ultima_entrada_en)) {
    return {
      ok: false,
      ventanaCerrada: true,
      error: "La ventana de atención de WhatsApp cerró. Esperá a que el seller vuelva a escribir.",
    };
  }

  const rowId = randomUUID();
  const localId = `pending:${rowId}`;
  const contenido = cifrarTexto(texto);
  const falla = await insertarFila("seller_chat_mensajes", {
    id: rowId,
    conversacion_id: conversacionId,
    proveedor_id: localId,
    evento_id: eventoId ?? null,
    direccion: "saliente",
    autor_tipo: autorTipo,
    autor_email: autorEmail?.toLowerCase() ?? null,
    tipo_contenido: "text",
    estado_envio: "pendiente",
    contenido_cifrado: contenido.cifrado,
    contenido_iv: contenido.iv,
    contenido_tag: contenido.tag,
  });
  if (falla) {
    const repetida = await respuestaRepetida();
    return repetida ?? { ok: false, error: falla };
  }

  const reservado = await ejecutarRpc<boolean>("seller_chat_reservar_envio", {
    p_conversacion_id: conversacionId,
    p_estado: estadoEsperado,
    p_email: autorEmail?.toLowerCase() ?? null,
    p_token: rowId,
  });
  if (!reservado) {
    await actualizarFila("seller_chat_mensajes", rowId, { estado_envio: "fallido" });
    const actualizada = await consultarFresco<FilaChat>("seller_chat_conversaciones", {
      id: `eq.${conversacionId}`,
      limit: "1",
    }).catch(() => []);
    if (!ventanaAbierta(actualizada[0]?.ultima_entrada_en ?? null)) {
      return {
        ok: false,
        ventanaCerrada: true,
        error: "La ventana de atención de WhatsApp cerró. Esperá a que el seller vuelva a escribir.",
      };
    }
    return { ok: false, error: "La conversación cambió de estado antes del envío." };
  }

  try {
    const telefono = abrir(actual.contacto_cifrado, actual.contacto_iv, actual.contacto_tag);
    const respuesta = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefono,
        type: "text",
        text: { body: texto, preview_url: false },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const cuerpo = await respuesta.json().catch(() => null) as { messages?: { id?: string }[] } | null;
    const idMeta = cuerpo?.messages?.[0]?.id ?? "";
    if (!respuesta.ok || !idMeta) throw new Error("meta_send_failed");

    const errorFinal = await actualizarFila("seller_chat_mensajes", rowId, {
      proveedor_id: idMeta,
      estado_envio: "enviado",
    });
    if (errorFinal) return { ok: false, error: "Meta aceptó el mensaje, pero no se pudo confirmar en la base. Reintento seguro pendiente." };
    const errorConversacion = await marcarUltimoMensaje(conversacionId, new Date().toISOString(), contenido);
    if (errorConversacion) return { ok: false, error: "No se pudo actualizar la bandeja; reintento seguro pendiente." };
    return { ok: true };
  } catch {
    await actualizarFila("seller_chat_mensajes", rowId, { estado_envio: "revision" });
    return { ok: false, error: "Meta no confirmó el envío. El mensaje quedó guardado para revisión." };
  } finally {
    await ejecutarRpc("seller_chat_liberar_envio", {
      p_conversacion_id: conversacionId,
      p_token: rowId,
    }).catch(() => false);
  }
}

/** El operador solo responde mientras tenga tomada esa conversación. */
export async function responderComoOperador(
  conversacionId: string,
  email: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  const chats = await consultarFresco<FilaChat>("seller_chat_conversaciones", {
    id: `eq.${conversacionId}`,
    limit: "1",
  });
  const chat = chats[0];
  if (!chat || chat.estado !== "humano" || chat.asignado_a !== email.toLowerCase()) {
    return { ok: false, error: "Tomá la conversación antes de responder." };
  }
  return enviarMensaje(chat, texto, "operador", email, "humano");
}

/** n8n puede responder solo con el bot al mando o enviar el aviso de derivación en estado pendiente. */
export async function responderComoBot(
  conversacionId: string,
  texto: string,
  tipo: "bot" | "pendiente" = "bot",
  eventoId?: string,
): Promise<{ ok: boolean; error?: string; omitido?: boolean; ventanaCerrada?: boolean }> {
  const chats = await consultarFresco<FilaChat>("seller_chat_conversaciones", {
    id: `eq.${conversacionId}`,
    limit: "1",
  });
  const chat = chats[0];
  if (!chat || !chat.seller_id) return { ok: false, error: "El contacto no está vinculado a un seller." };
  return enviarMensaje(chat, texto, "bot", null, tipo, eventoId);
}

export async function escalarChat(conversacionId: string): Promise<boolean> {
  return ejecutarRpc<boolean>("seller_chat_escalar", { p_conversacion_id: conversacionId });
}
