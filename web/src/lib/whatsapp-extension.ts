import "server-only";

import { TABLA_DRIVERS_ACTIVOS, TABLA_SELLERS_ACTIVOS } from "./config";
import { consultarTodo } from "./supabase";

export type EtiquetaWhatsapp = {
  id: string;
  nombre: string;
  color: string | null;
};

export type ChatWhatsappExtension = {
  id: string;
  nombre: string;
  foto: string | null;
  extracto: string;
  ultimoMensajeEn: string | null;
  noLeidos: number;
  sellerId: number | null;
  tipo: "seller" | "driver" | "otro";
};

type DirectorioFila = {
  id_usuario?: number | string | null;
  id_motoboy?: number | string | null;
  nombre?: string | null;
  grupo_jid?: string | null;
  grupo_nombre?: string | null;
  labels_waha?: unknown;
};

type Vinculo = {
  nombre: string;
  sellerId: number | null;
  tipo: "seller" | "driver";
  etiquetas: EtiquetaWhatsapp[];
};

export class WahaNoConfigurado extends Error {}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : valor == null ? "" : String(valor).trim();
}

function etiquetas(valor: unknown): EtiquetaWhatsapp[] {
  const lista = Array.isArray(valor)
    ? valor
    : valor && typeof valor === "object" && Array.isArray((valor as { labels?: unknown }).labels)
      ? (valor as { labels: unknown[] }).labels
      : [];
  return lista.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const fila = item as Record<string, unknown>;
    const id = texto(fila.id);
    const nombre = texto(fila.name ?? fila.nombre ?? fila.label);
    if (!id || !nombre) return [];
    return [{ id, nombre, color: texto(fila.colorHex ?? fila.color) || null }];
  });
}

async function directorio(): Promise<Map<string, Vinculo>> {
  const [sellers, drivers] = await Promise.all([
    consultarTodo<DirectorioFila>(TABLA_SELLERS_ACTIVOS, {
      select: "id_usuario,nombre,grupo_jid,grupo_nombre,labels_waha",
      activo: "eq.true",
    }, "nombre.asc"),
    consultarTodo<DirectorioFila>(TABLA_DRIVERS_ACTIVOS, {
      select: "id_motoboy,nombre,grupo_jid,grupo_nombre,labels_waha",
      activo: "eq.true",
    }, "nombre.asc"),
  ]);
  const mapa = new Map<string, Vinculo>();
  for (const fila of sellers) {
    const jid = texto(fila.grupo_jid);
    const id = Number(fila.id_usuario);
    if (!jid) continue;
    mapa.set(jid, {
      nombre: texto(fila.grupo_nombre) || texto(fila.nombre) || jid,
      sellerId: Number.isSafeInteger(id) && id > 0 ? id : null,
      tipo: "seller",
      etiquetas: etiquetas(fila.labels_waha),
    });
  }
  for (const fila of drivers) {
    const jid = texto(fila.grupo_jid);
    if (!jid || mapa.has(jid)) continue;
    mapa.set(jid, {
      nombre: texto(fila.grupo_nombre) || texto(fila.nombre) || jid,
      sellerId: null,
      tipo: "driver",
      etiquetas: etiquetas(fila.labels_waha),
    });
  }
  return mapa;
}

function configuracionWaha(): { base: string; clave: string; sesion: string } {
  const base = process.env.WAHA_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const clave = process.env.WAHA_API_KEY?.trim() ?? "";
  const sesion = process.env.WAHA_SESSION_EXTENSION?.trim() || process.env.WAHA_SESSION?.trim() || "";
  if (!base || !clave || !sesion) throw new WahaNoConfigurado("WAHA no está configurado.");
  const url = new URL(base);
  const privado = /^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && privado)) {
    throw new WahaNoConfigurado("WAHA debe usar HTTPS o una red privada.");
  }
  return { base: url.href.replace(/\/$/, ""), clave, sesion };
}

function configuracionProxyN8n(): { url: string; secreto: string } | null {
  const secreto = process.env.N8N_WEBHOOK_WHATSAPP_SECRET?.trim() ?? "";
  const explicita = process.env.N8N_WEBHOOK_EXTENSION_WHATSAPP?.trim() ?? "";
  const base = process.env.N8N_URL?.trim() ?? "";
  if (!secreto || (!explicita && !base)) return null;
  try {
    const url = new URL(explicita || base);
    if (!explicita) url.pathname = "/webhook/extension-whatsapp";
    if (url.protocol !== "https:") return null;
    return { url: url.href, secreto };
  } catch {
    return null;
  }
}

async function pedirProxyN8n(ruta: string, opciones?: RequestInit): Promise<unknown> {
  const config = configuracionProxyN8n();
  if (!config) throw new WahaNoConfigurado("El proxy WAHA no está configurado.");
  let cuerpo: Record<string, unknown>;
  if (ruta === "/labels") cuerpo = { accion: "labels" };
  else {
    const chats = /^\/labels\/([A-Za-z0-9_.%:-]{1,300})\/chats$/.exec(ruta);
    if (chats) cuerpo = { accion: "chats", etiquetaId: decodeURIComponent(chats[1]) };
    else if (ruta === "/chats/overview" && opciones?.method === "POST") {
      const original = typeof opciones.body === "string" ? JSON.parse(opciones.body) as { filter?: { ids?: unknown } } : {};
      cuerpo = { accion: "overview", ids: Array.isArray(original.filter?.ids) ? original.filter.ids : [] };
    } else throw new Error("Operación WAHA no permitida.");
  }
  const respuesta = await fetch(config.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.secreto}` },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const datos = await respuesta.json().catch(() => null) as { ok?: boolean; data?: unknown } | null;
  if (!respuesta.ok || datos?.ok !== true || !Array.isArray(datos.data)) throw new Error(`El proxy WAHA respondió ${respuesta.status}.`);
  return datos.data;
}

async function pedirWaha(ruta: string, opciones?: RequestInit): Promise<unknown> {
  if (configuracionProxyN8n()) return pedirProxyN8n(ruta, opciones);
  const config = configuracionWaha();
  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), 12_000);
  try {
    const respuesta = await fetch(`${config.base}/api/${encodeURIComponent(config.sesion)}${ruta}`, {
      ...opciones,
      cache: "no-store",
      signal: controlador.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": config.clave,
        ...(opciones?.headers ?? {}),
      },
    });
    if (!respuesta.ok) throw new Error(`WAHA respondió ${respuesta.status}.`);
    return respuesta.json();
  } finally {
    clearTimeout(reloj);
  }
}

function chatId(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (!valor || typeof valor !== "object") return "";
  const fila = valor as Record<string, unknown>;
  const directo = texto(fila.id ?? fila.chatId ?? fila.chat_id);
  if (directo) return directo;
  const crudo = fila._chat && typeof fila._chat === "object" ? fila._chat as Record<string, unknown> : {};
  const idCrudo = crudo.id && typeof crudo.id === "object" ? crudo.id as Record<string, unknown> : {};
  return texto(idCrudo._serialized ?? crudo.id);
}

function fechaMensaje(valor: unknown): string | null {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const fecha = new Date(numero < 10_000_000_000 ? numero * 1000 : numero);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function fotoSegura(valor: unknown): string | null {
  const crudo = texto(valor);
  if (!crudo) return null;
  try {
    const url = new URL(crudo);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host.endsWith(".whatsapp.net") || host.endsWith(".fbcdn.net"))
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function normalizarChat(valor: unknown, vinculos: Map<string, Vinculo>): ChatWhatsappExtension | null {
  if (!valor || typeof valor !== "object") return null;
  const fila = valor as Record<string, unknown>;
  const id = chatId(fila);
  if (!id) return null;
  const vinculo = vinculos.get(id);
  const ultimo = fila.lastMessage && typeof fila.lastMessage === "object"
    ? fila.lastMessage as Record<string, unknown>
    : {};
  const crudo = fila._chat && typeof fila._chat === "object" ? fila._chat as Record<string, unknown> : {};
  const noLeidos = Math.max(0, Number(crudo.unreadCount ?? fila.unreadCount ?? 0) || 0);
  return {
    id,
    nombre: texto(fila.name ?? crudo.name) || vinculo?.nombre || id.replace(/@(c|g)\.us$/, ""),
    foto: fotoSegura(fila.picture),
    extracto: texto(ultimo.body ?? ultimo.caption ?? crudo.lastMessage?.toString()).slice(0, 240),
    ultimoMensajeEn: fechaMensaje(ultimo.timestamp ?? crudo.timestamp ?? fila.timestamp),
    noLeidos,
    sellerId: vinculo?.sellerId ?? null,
    tipo: vinculo?.tipo ?? "otro",
  };
}

export async function listarEtiquetasWhatsapp(): Promise<{ etiquetas: EtiquetaWhatsapp[]; fuente: "waha" | "directorio" }> {
  try {
    const respuesta = await pedirWaha("/labels");
    const lista = Array.isArray(respuesta) ? respuesta : [];
    const resultado = lista.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const fila = item as Record<string, unknown>;
      const id = texto(fila.id);
      const nombre = texto(fila.name);
      const activa = fila.isActive !== false;
      const tipo = Number(fila.type ?? 5);
      return id && nombre && activa && [0, 4, 5].includes(tipo)
        ? [{ id, nombre, color: texto(fila.colorHex) || null }]
        : [];
    });
    return { etiquetas: resultado, fuente: "waha" };
  } catch (error) {
    if (!(error instanceof WahaNoConfigurado)) console.error("[extension-whatsapp] No se pudieron leer labels WAHA:", error);
    const vinculos = await directorio();
    const unicas = new Map<string, EtiquetaWhatsapp>();
    for (const vinculo of vinculos.values()) for (const etiqueta of vinculo.etiquetas) unicas.set(etiqueta.id, etiqueta);
    return { etiquetas: [...unicas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), fuente: "directorio" };
  }
}

export async function listarChatsEtiquetaWhatsapp(etiquetaId: string): Promise<{ chats: ChatWhatsappExtension[]; fuente: "waha" | "directorio" }> {
  const vinculos = await directorio();
  try {
    const respuesta = await pedirWaha(`/labels/${encodeURIComponent(etiquetaId)}/chats`);
    const filas = (Array.isArray(respuesta) ? respuesta : []).slice(0, 200);
    const directos = filas
      .map((fila) => normalizarChat(fila, vinculos))
      .filter((fila): fila is ChatWhatsappExtension => fila !== null);
    // WPP/NOWEB devuelven chats completos desde el endpoint del label. Usarlos
    // evita repetir una consulta pesada de overview para una bandeja entera.
    if (directos.length >= Math.ceil(filas.length / 2)) {
      return {
        chats: directos.sort((a, b) => (b.ultimoMensajeEn ?? "").localeCompare(a.ultimoMensajeEn ?? "")),
        fuente: "waha",
      };
    }

    const ids = [...new Set(filas.map(chatId).filter(Boolean))].slice(0, 100);
    if (ids.length === 0) return { chats: [], fuente: "waha" };
    // Respaldo para motores que solo devuelven JID en el endpoint del label.
    // Es secuencial a propósito: varias consultas paralelas saturan WAHA.
    const lotes: string[][] = [];
    for (let inicio = 0; inicio < ids.length; inicio += 10) lotes.push(ids.slice(inicio, inicio + 10));
    const overview: unknown[] = [];
    for (const lote of lotes) {
      const detalle = await pedirWaha("/chats/overview", {
        method: "POST",
        body: JSON.stringify({ pagination: { limit: lote.length, offset: 0 }, filter: { ids: lote } }),
      });
      if (Array.isArray(detalle)) overview.push(...detalle);
    }
    const chats = overview
      .map((fila) => normalizarChat(fila, vinculos))
      .filter((fila): fila is ChatWhatsappExtension => fila !== null)
      .sort((a, b) => (b.ultimoMensajeEn ?? "").localeCompare(a.ultimoMensajeEn ?? ""));
    return { chats, fuente: "waha" };
  } catch (error) {
    if (!(error instanceof WahaNoConfigurado)) console.error("[extension-whatsapp] No se pudieron leer chats WAHA:", error);
    const chats = [...vinculos.entries()].flatMap(([id, vinculo]) =>
      vinculo.etiquetas.some((etiqueta) => etiqueta.id === etiquetaId)
        ? [{ id, nombre: vinculo.nombre, foto: null, extracto: "", ultimoMensajeEn: null, noLeidos: 0, sellerId: vinculo.sellerId, tipo: vinculo.tipo }]
        : [],
    );
    return { chats, fuente: "directorio" };
  }
}
