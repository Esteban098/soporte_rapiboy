import { createHmac, timingSafeEqual } from "node:crypto";
import { consultarFresco, ejecutarRpc } from "@/lib/supabase";
import { cifrarTexto, claveContacto } from "@/lib/chat-cifrado";
import { telefonoAsistencia } from "@/lib/asistencia";
import { sellerIdDeTelefonoPrueba } from "@/lib/chat-sellers-prueba";
import { TABLA_SELLERS_ACTIVOS } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

type MensajeMeta = {
  id?: unknown;
  from?: unknown;
  timestamp?: unknown;
  type?: unknown;
  text?: { body?: unknown };
  button?: { text?: unknown };
  interactive?: {
    button_reply?: { title?: unknown };
    list_reply?: { title?: unknown };
  };
};

type ContactoMeta = { wa_id?: unknown; profile?: { name?: unknown } };
type CambioMeta = { value?: {
  messaging_product?: unknown;
  metadata?: { phone_number_id?: unknown };
  contacts?: ContactoMeta[];
  messages?: MensajeMeta[];
} };
type WebhookMeta = { object?: unknown; entry?: { changes?: CambioMeta[] }[] };
type MensajeConDestino = {
  mensaje: MensajeMeta;
  producto: unknown;
  phoneNumberId: unknown;
  contactos?: ContactoMeta[];
};

function nombrePerfil(contactos: ContactoMeta[] | undefined, telefono: string): string | null {
  const contacto = contactos?.find((fila) => telefonoAsistencia(fila.wa_id) === telefono) ??
    (contactos?.length === 1 ? contactos[0] : undefined);
  const valor = contacto?.profile?.name;
  if (typeof valor !== "string") return null;
  const nombre = valor.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160);
  return nombre || null;
}

function firmaValida(raw: Buffer, firma: string | null): boolean {
  const secreto = process.env.META_APP_SECRET?.trim();
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const provista = Buffer.from(firma.slice(7), "hex");
  const esperada = createHmac("sha256", secreto).update(raw).digest();
  return provista.length === esperada.length && timingSafeEqual(provista, esperada);
}

function textoDelMensaje(mensaje: MensajeMeta): { texto: string; tipo: string } {
  const tipo = typeof mensaje.type === "string" ? mensaje.type : "unknown";
  const texto = mensaje.text?.body ?? mensaje.button?.text ??
    mensaje.interactive?.button_reply?.title ?? mensaje.interactive?.list_reply?.title;
  if (typeof texto === "string" && texto.trim()) return { texto: texto.trim(), tipo };
  // No se descartan imágenes, audios ni documentos: quedan cifrados y pasan a
  // revisión humana, sin pedirle al LLM que interprete contenido no extraído.
  return { texto: `[Mensaje ${tipo} recibido; requiere revisión humana.]`, tipo };
}

function mensajesEntrantes(cuerpo: WebhookMeta): MensajeConDestino[] {
  return (cuerpo.entry ?? []).flatMap((entrada) =>
    (entrada.changes ?? []).flatMap((cambio) => {
      const value = cambio.value;
      return (value?.messages ?? []).map((mensaje) => ({
        mensaje,
        producto: value?.messaging_product,
        phoneNumberId: value?.metadata?.phone_number_id,
        contactos: value?.contacts,
      }));
    }),
  );
}

async function leerCuerpoLimitado(request: Request, maximo: number): Promise<Buffer | null> {
  const longitud = Number(request.headers.get("content-length"));
  if (Number.isFinite(longitud) && longitud > maximo) return null;
  if (!request.body) return Buffer.alloc(0);
  const lector = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await lector.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

async function dispararProcesamiento(eventId: string, conversacionId: string): Promise<void> {
  const url = process.env.N8N_WEBHOOK_WHATSAPP?.trim();
  const secreto = process.env.N8N_WEBHOOK_WHATSAPP_SECRET?.trim();
  if (!url || !secreto) return;

  // El cuerpo solo lleva identificadores opacos. El evento cifrado permanece
  // en Supabase y se recupera desde un endpoint interno autenticado.
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secreto}` },
      body: JSON.stringify({ eventId, conversacionId }),
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Meta ya puede recibir 200: el evento quedó persistido como pendiente y
    // el workflow de recuperación de n8n debe volver a recogerlo.
  }
}

/** Verificación inicial que Meta ejecuta al registrar la URL del webhook. */
export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge");
  const esperado = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  const a = Buffer.from(esperado ?? "");
  const b = Buffer.from(token ?? "");
  const tokenValido = a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  if (modo !== "subscribe" || !desafio || !tokenValido) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(desafio, { status: 200, headers: { "content-type": "text/plain" } });
}

/** Recibe eventos de Meta, valida su firma y persiste los mensajes de forma cifrada. */
export async function POST(pedido: Request) {
  const raw = await leerCuerpoLimitado(pedido, 1_000_000);
  if (!raw) return Response.json({ ok: false }, { status: 413 });
  if (!firmaValida(raw, pedido.headers.get("x-hub-signature-256"))) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let cuerpo: WebhookMeta;
  try {
    cuerpo = JSON.parse(raw.toString("utf8")) as WebhookMeta;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  if (cuerpo.object !== "whatsapp_business_account") {
    return Response.json({ ok: true, omitido: true });
  }

  const entrantes = mensajesEntrantes(cuerpo);
  const phoneNumberIdEsperado = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  // No aceptar mensajes si la cuenta de destino no está configurada: así un
  // despliegue incompleto no guarda conversaciones de otro número en Supabase.
  if (entrantes.length > 0 && !phoneNumberIdEsperado) {
    return Response.json({ ok: false }, { status: 503 });
  }

  try {
    for (const evento of entrantes) {
      if (evento.producto !== "whatsapp" || evento.phoneNumberId !== phoneNumberIdEsperado) continue;
      const mensaje = evento.mensaje;
      const eventId = typeof mensaje.id === "string" ? mensaje.id : "";
      const telefono = telefonoAsistencia(mensaje.from);
      if (!eventId || !telefono) continue;

      const sellerPruebaId = sellerIdDeTelefonoPrueba(telefono);
      let sellerId: number | string | null;
      if (sellerPruebaId !== null) {
        // La excepción nunca activa un seller inexistente o inactivo y solo
        // aplica al número configurado; no cambia el directorio operativo.
        const sellers = await consultarFresco<{ id_usuario: number; activo: boolean }>(
          TABLA_SELLERS_ACTIVOS,
          { id_usuario: `eq.${sellerPruebaId}`, activo: "eq.true", limit: "1" },
        );
        sellerId = sellers[0]?.id_usuario ?? null;
      } else {
        sellerId = await ejecutarRpc<number | string | null>("seller_chat_buscar_seller", {
          p_telefono: telefono,
        });
      }
      const contacto = cifrarTexto(telefono);
      const contenido = cifrarTexto(textoDelMensaje(mensaje).texto);
      const nombre = nombrePerfil(evento.contactos, telefono);
      const canal = "directo" as const;
      const recibido = await ejecutarRpc<{
        conversacion_id: string;
        mensaje_id: string;
        nuevo: boolean;
        evento_estado?: string;
      }>("seller_chat_recibir_mensaje", {
        p_proveedor_id: eventId,
        p_canal: canal,
        p_clave_contacto: claveContacto(canal, telefono),
        p_contacto_cifrado: contacto.cifrado,
        p_contacto_iv: contacto.iv,
        p_contacto_tag: contacto.tag,
        p_seller_id: sellerId == null ? null : Number(sellerId),
        p_contenido_cifrado: contenido.cifrado,
        p_contenido_iv: contenido.iv,
        p_contenido_tag: contenido.tag,
        p_tipo_contenido: typeof mensaje.type === "string" ? mensaje.type : "unknown",
        p_creado_en: typeof mensaje.timestamp === "string" && /^\d+$/.test(mensaje.timestamp)
          ? new Date(Number(mensaje.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      });
      if (nombre) {
        const perfil = cifrarTexto(nombre);
        await ejecutarRpc<boolean>("seller_chat_guardar_nombre_contacto", {
          p_proveedor_id: eventId,
          p_nombre_cifrado: perfil.cifrado,
          p_nombre_iv: perfil.iv,
          p_nombre_tag: perfil.tag,
        });
      }
      if (recibido.nuevo || recibido.evento_estado === "pendiente" || recibido.evento_estado === "fallido") {
        await dispararProcesamiento(eventId, recibido.conversacion_id);
      }
    }
  } catch {
    // No se escriben cuerpos, números ni secretos en logs. Un error de base
    // devuelve 500 para que Meta reintente; la unicidad hace seguro el reenvío.
    return Response.json({ ok: false }, { status: 500 });
  }

  return Response.json({ ok: true });
}
