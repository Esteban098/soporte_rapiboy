import "server-only";
import { randomUUID } from "node:crypto";
import { cifrarTexto, descifrarTexto } from "./chat-cifrado";
import { actualizarFila, actualizarFilaSi, borrarFila, consultarFresco, ejecutarRpc, insertarFila } from "./supabase";

type EstadoInternoChat = "bot" | "pendiente" | "humano" | "cerrado";
export type EstadoChat = "abierto" | "asignado" | "cerrado";

type FilaChat = {
  id: string;
  created_at: string;
  canal: "directo" | "grupo";
  seller_id: number | null;
  estado: EstadoInternoChat;
  asignado_a: string | null;
  ultima_entrada_en: string | null;
  ultimo_mensaje_en: string | null;
  cerrado_en: string | null;
  cerrado_por: string | null;
  eliminado_en: string | null;
  eliminado_por: string | null;
  contacto_cifrado: string;
  contacto_iv: string;
  contacto_tag: string;
  ultimo_mensaje_cifrado: string | null;
  ultimo_mensaje_iv: string | null;
  ultimo_mensaje_tag: string | null;
};

type FilaLectura = { conversacion_id: string; leido_en: string };

type FilaRespuestaRapida = {
  id: string;
  atajo: string;
  titulo: string;
  contenido: string;
  activa: boolean;
  creado_por: string;
  actualizado_por: string;
  created_at: string;
  actualizado_en: string;
};

export type RespuestaRapida = {
  id: string;
  atajo: string;
  titulo: string;
  contenido: string;
  activa: boolean;
  creadoPor: string;
  actualizadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
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

type ErrorMeta = { code?: unknown; error_subcode?: unknown; type?: unknown };

function mensajeFallaMeta(http: number, error: ErrorMeta | null | undefined): string {
  const codigo = Number(error?.code);
  const subcodigo = Number(error?.error_subcode);
  if (codigo === 190 || subcodigo === 463) {
    return "El token de WhatsApp venció o fue revocado. Actualizá META_WHATSAPP_ACCESS_TOKEN en Vercel.";
  }
  if (codigo === 10 || codigo === 200) {
    return "El token de WhatsApp no tiene permisos para enviar mensajes desde este número.";
  }
  if (codigo === 100) {
    return "Meta rechazó el Phone Number ID o la configuración del mensaje.";
  }
  if (codigo === 131030) {
    return "El destinatario no está habilitado para recibir mensajes de este número de prueba.";
  }
  if (codigo === 131026) {
    return "Meta no pudo entregar el mensaje al número de destino.";
  }
  const referencia = Number.isFinite(codigo) ? `, código ${codigo}` : "";
  return `Meta rechazó el envío (HTTP ${http}${referencia}). Revisá la configuración de WhatsApp Cloud API.`;
}

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

export async function listarChats(email: string, limite = 100) {
  const cantidad = Math.min(1000, Math.max(1, Math.trunc(limite)));
  const [filas, lecturas] = await Promise.all([
    consultarFresco<FilaChat>("seller_chat_conversaciones", {
      eliminado_en: "is.null",
      order: "ultimo_mensaje_en.desc.nullslast",
      limit: String(cantidad + 1),
    }),
    consultarFresco<FilaLectura>("seller_chat_lecturas", {
      email: `eq.${email.toLowerCase()}`,
      limit: "1000",
    }).catch(() => []),
  ]);
  const leidoEn = new Map(lecturas.map((fila) => [fila.conversacion_id, fila.leido_en]));
  const hayMas = filas.length > cantidad;
  const chats = filas.slice(0, cantidad).map((chat) => ({
    id: chat.id,
    canal: chat.canal,
    sellerId: chat.seller_id,
    estado: chat.estado === "humano" ? "asignado" : chat.estado === "cerrado" ? "cerrado" : "abierto",
    requiereAtencion: chat.estado === "pendiente",
    asignadoA: chat.asignado_a,
    ultimaEntradaEn: chat.ultima_entrada_en,
    ventanaAbierta: ventanaAbierta(chat.ultima_entrada_en),
    ultimoMensajeEn: chat.ultimo_mensaje_en,
    cerradoEn: chat.cerrado_en,
    cerradoPor: chat.cerrado_por ?? null,
    noLeido: Boolean(chat.ultima_entrada_en && (!leidoEn.get(chat.id) || chat.ultima_entrada_en > (leidoEn.get(chat.id) ?? ""))),
    telefono: abrir(chat.contacto_cifrado, chat.contacto_iv, chat.contacto_tag),
    extracto: chat.ultimo_mensaje_cifrado
      ? abrir(chat.ultimo_mensaje_cifrado, chat.ultimo_mensaje_iv ?? "", chat.ultimo_mensaje_tag ?? "")
      : "",
  }));
  return { chats, hayMas };
}

export async function listarContactosChat() {
  const filas = await consultarFresco<FilaChat>("seller_chat_conversaciones", {
    order: "ultimo_mensaje_en.desc.nullslast",
    limit: "1000",
  });
  return filas.map((chat) => ({
    id: chat.id,
    sellerId: chat.seller_id,
    telefono: abrir(chat.contacto_cifrado, chat.contacto_iv, chat.contacto_tag),
    creadoEn: chat.created_at,
    ultimoMensajeEn: chat.ultimo_mensaje_en,
    eliminadoEn: chat.eliminado_en ?? null,
  }));
}

export async function listarRespuestasRapidas(incluirInactivas = false): Promise<RespuestaRapida[]> {
  const filtros: Record<string, string> = { order: "atajo.asc", limit: "500" };
  if (!incluirInactivas) filtros.activa = "eq.true";
  const filas = await consultarFresco<FilaRespuestaRapida>("seller_chat_respuestas_rapidas", filtros);
  return filas.map((fila) => ({
    id: fila.id,
    atajo: fila.atajo,
    titulo: fila.titulo,
    contenido: fila.contenido,
    activa: fila.activa,
    creadoPor: fila.creado_por,
    actualizadoPor: fila.actualizado_por,
    creadoEn: fila.created_at,
    actualizadoEn: fila.actualizado_en,
  }));
}

export async function crearRespuestaRapida(
  datos: { atajo: string; titulo: string; contenido: string; activa: boolean },
  email: string,
): Promise<string | null> {
  return insertarFila("seller_chat_respuestas_rapidas", {
    id: randomUUID(),
    atajo: datos.atajo,
    titulo: datos.titulo,
    contenido: datos.contenido,
    activa: datos.activa,
    creado_por: email.toLowerCase(),
    actualizado_por: email.toLowerCase(),
  });
}

export async function actualizarRespuestaRapida(
  id: string,
  datos: { atajo: string; titulo: string; contenido: string; activa: boolean },
  email: string,
): Promise<string | null> {
  return actualizarFila("seller_chat_respuestas_rapidas", id, {
    atajo: datos.atajo,
    titulo: datos.titulo,
    contenido: datos.contenido,
    activa: datos.activa,
    actualizado_por: email.toLowerCase(),
    actualizado_en: new Date().toISOString(),
  });
}

export async function eliminarRespuestaRapida(id: string): Promise<string | null> {
  return borrarFila("seller_chat_respuestas_rapidas", id);
}

export async function asignarContactoChat(conversacionId: string, sellerId: number | null, email: string): Promise<boolean> {
  return ejecutarRpc<boolean>("seller_chat_asignar_contacto", {
    p_conversacion_id: conversacionId,
    p_seller_id: sellerId,
    p_email: email,
  });
}

export async function marcarChatLeido(conversacionId: string, email: string): Promise<boolean> {
  return ejecutarRpc<boolean>("seller_chat_marcar_leido", {
    p_conversacion_id: conversacionId,
    p_email: email,
  });
}

export type ReporteChats = {
  creados: number;
  cerrados: number;
  asignados: number;
  conRespuesta: number;
  sinRespuesta: number;
  primeraRespuestaSegundos: number | null;
  resolucionSegundos: number | null;
  botSegundos: number | null;
  atencionHumanaSegundos: number | null;
  horas: { hora: number; creados: number; cerrados: number; contactos: number }[];
};

export async function reporteChats(desde: string, hasta: string, usuario: string | null): Promise<ReporteChats> {
  return ejecutarRpc<ReporteChats>("seller_chat_reporte", {
    p_desde: desde,
    p_hasta: hasta,
    p_usuario: usuario,
  });
}

export async function leerMensajes(conversacionId: string, limite = 100) {
  const cantidad = Math.min(1000, Math.max(1, Math.trunc(limite)));
  const filas = await consultarFresco<FilaMensaje>("seller_chat_mensajes", {
    conversacion_id: `eq.${conversacionId}`,
    order: "creado_en.desc,id.desc",
    limit: String(cantidad + 1),
  });
  const hayMas = filas.length > cantidad;
  const mensajes = filas.slice(0, cantidad).reverse().map((mensaje) => ({
    id: mensaje.id,
    creadoEn: mensaje.creado_en,
    direccion: mensaje.direccion,
    autorTipo: mensaje.autor_tipo,
    autorEmail: mensaje.autor_email,
    tipoContenido: mensaje.tipo_contenido,
    estadoEnvio: mensaje.estado_envio,
    texto: abrir(mensaje.contenido_cifrado, mensaje.contenido_iv, mensaje.contenido_tag),
  }));
  return { mensajes, hayMas };
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

export async function eliminarChat(conversacionId: string, email: string, esAdmin: boolean): Promise<boolean> {
  return ejecutarRpc<boolean>("seller_chat_eliminar", {
    p_conversacion_id: conversacionId,
    p_email: email,
    p_es_admin: esAdmin,
  });
}

async function enviarMensaje(
  chat: FilaChat,
  texto: string,
  autorTipo: "bot" | "operador",
  autorEmail: string | null,
  estadoEsperado: Exclude<EstadoInternoChat, "cerrado">,
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

  let motivoFalla = "No se pudo conectar con Meta. El mensaje quedó guardado para revisión.";
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
    const cuerpo = await respuesta.json().catch(() => null) as {
      messages?: { id?: string }[];
      error?: ErrorMeta;
    } | null;
    const idMeta = cuerpo?.messages?.[0]?.id ?? "";
    if (!respuesta.ok || !idMeta) {
      motivoFalla = mensajeFallaMeta(respuesta.status, cuerpo?.error);
      throw new Error("meta_send_failed");
    }

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
    return { ok: false, error: motivoFalla };
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
