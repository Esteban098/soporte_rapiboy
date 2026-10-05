"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import estilos from "./chat-sellers.module.css";

type Chat = {
  id: string;
  canal: "directo" | "grupo";
  sellerId: number | null;
  estado: "bot" | "pendiente" | "humano";
  asignadoA: string | null;
  ventanaAbierta: boolean;
  ultimoMensajeEn: string | null;
  telefono: string;
  extracto: string;
};
type Mensaje = {
  id: string;
  creadoEn: string;
  direccion: "entrante" | "saliente";
  autorTipo: "seller" | "bot" | "operador";
  autorEmail: string | null;
  texto: string;
  estadoEnvio: "pendiente" | "enviado" | "fallido" | "revision" | null;
};

function fecha(valor: string | null): string {
  if (!valor) return "";
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(instante);
}

const ESTADO: Record<Chat["estado"], string> = {
  bot: "Bot activo",
  pendiente: "Necesita atención",
  humano: "Atención humana",
};

export function ChatSellers({ usuario }: { usuario: string }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<{ conversacionId: string; items: Mensaje[] } | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const chat = useMemo(() => chats.find((fila) => fila.id === seleccionado) ?? null, [chats, seleccionado]);

  const actualizarChats = useCallback(async () => {
    const respuesta = await fetch("/api/whatsapp/chats", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !datos?.ok) throw new Error("No se pudo actualizar la bandeja.");
    setChats(datos.chats as Chat[]);
    setSeleccionado((actual) => actual && datos.chats.some((fila: Chat) => fila.id === actual)
      ? actual
      : datos.chats[0]?.id ?? null);
  }, []);

  const actualizarMensajes = useCallback(async (id: string) => {
    const respuesta = await fetch(`/api/whatsapp/chats/${id}/mensajes`, { cache: "no-store" });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !datos?.ok) throw new Error("No se pudo abrir la conversación.");
    setMensajes({ conversacionId: id, items: datos.mensajes as Mensaje[] });
  }, []);

  useEffect(() => {
    let vigente = true;
    const cargar = async () => {
      try {
        await actualizarChats();
        if (vigente) setError("");
      } catch (falla) {
        if (vigente) setError(falla instanceof Error ? falla.message : "No se pudo cargar la bandeja.");
      } finally {
        if (vigente) setCargando(false);
      }
    };
    void cargar();
    const reloj = window.setInterval(() => void cargar(), 8000);
    return () => { vigente = false; window.clearInterval(reloj); };
  }, [actualizarChats]);

  useEffect(() => {
    if (!seleccionado) return;
    let vigente = true;
    const cargar = async () => {
      try {
        await actualizarMensajes(seleccionado);
        if (vigente) setError("");
      } catch (falla) {
        if (vigente) setError(falla instanceof Error ? falla.message : "No se pudo abrir la conversación.");
      }
    };
    void cargar();
    const reloj = window.setInterval(() => void cargar(), 5000);
    return () => { vigente = false; window.clearInterval(reloj); };
  }, [seleccionado, actualizarMensajes]);

  async function cambiarEstado(accion: "tomar" | "cerrar") {
    if (!chat) return;
    setOcupado(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/whatsapp/chats/${chat.id}/estado`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion }),
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new Error("El estado cambió. Actualizá la bandeja e intentá otra vez.");
      await actualizarChats();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cambiar el estado.");
    } finally { setOcupado(false); }
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!chat || !texto.trim()) return;
    setOcupado(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/whatsapp/chats/${chat.id}/mensajes`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto }),
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new Error(datos?.error || "No se pudo enviar el mensaje.");
      setTexto("");
      await Promise.all([actualizarChats(), actualizarMensajes(chat.id)]);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo enviar el mensaje.");
    } finally { setOcupado(false); }
  }

  const puedeResponder = chat?.estado === "humano" &&
    chat.asignadoA?.toLowerCase() === usuario.toLowerCase() && chat.ventanaAbierta;
  const mensajesVisibles = mensajes?.conversacionId === seleccionado ? mensajes.items : [];
  const placeholderCompositor = chat?.estado !== "humano"
    ? "Tomá la conversación para responder."
    : !chat.ventanaAbierta
      ? "La ventana cerró. Esperá a que el seller vuelva a escribir."
      : chat.asignadoA?.toLowerCase() === usuario.toLowerCase()
        ? "Escribí una respuesta…"
        : `En atención por ${chat.asignadoA ?? "otro operador"}.`;

  return (
    <section className={estilos.bandeja} aria-label="Chat de soporte para sellers">
      <aside className={estilos.lista}>
        <div className={estilos.listaCabecera}>
          <h2>Conversaciones</h2><span>{chats.length}</span>
        </div>
        {cargando ? <p className={estilos.vacio}>Cargando…</p> : null}
        {!cargando && chats.length === 0 ? <p className={estilos.vacio}>Todavía no hay mensajes.</p> : null}
        {chats.map((fila) => (
          <button key={fila.id} type="button" className={`${estilos.item} ${seleccionado === fila.id ? estilos.itemActivo : ""}`} onClick={() => setSeleccionado(fila.id)}>
            <span className={estilos.itemArriba}><b>{fila.sellerId ? `Seller ${fila.sellerId}` : fila.telefono}</b><time>{fecha(fila.ultimoMensajeEn)}</time></span>
            <span className={estilos.estado}><i className={`${estilos.punto} ${estilos[`punto_${fila.estado}`]}`} />{ESTADO[fila.estado]}</span>
            <span className={estilos.extracto}>{fila.extracto}</span>
          </button>
        ))}
      </aside>

      <div className={estilos.detalle}>
        {chat ? <>
          <header className={estilos.cabecera}>
            <div><h2>{chat.sellerId ? `Seller ${chat.sellerId}` : "Número sin vincular"}</h2><p>{chat.telefono} · {ESTADO[chat.estado]}{chat.asignadoA ? ` · ${chat.asignadoA}` : ""}{!chat.ventanaAbierta ? " · Ventana de respuesta cerrada" : ""}</p></div>
            {chat.estado === "humano" && puedeResponder ? <button type="button" disabled={ocupado} onClick={() => void cambiarEstado("cerrar")}>Cerrar y devolver al bot</button>
              : chat.estado === "humano" ? <span className={estilos.asignado}>En atención por {chat.asignadoA ?? "otro operador"}</span>
              : <button type="button" disabled={ocupado || chat.estado === "pendiente" && Boolean(chat.asignadoA)} onClick={() => void cambiarEstado("tomar")}>Tomar conversación</button>}
          </header>
          <div className={estilos.mensajes}>
            {mensajesVisibles.map((mensaje) => <article key={mensaje.id} className={`${estilos.mensaje} ${mensaje.direccion === "saliente" ? estilos.saliente : estilos.entrante}`}>
              <div>{mensaje.autorTipo === "seller" ? "Seller" : mensaje.autorTipo === "bot" ? "Bot" : mensaje.autorEmail ?? "Operador"}</div>
              <p>{mensaje.texto}</p>
              <time>{fecha(mensaje.creadoEn)}{mensaje.estadoEnvio === "fallido" ? " · No enviado" : mensaje.estadoEnvio === "revision" ? " · Verificar envío" : mensaje.estadoEnvio === "pendiente" ? " · Envío en curso" : ""}</time>
            </article>)}
            {mensajesVisibles.length === 0 ? <p className={estilos.vacio}>Sin mensajes en esta conversación.</p> : null}
          </div>
          <form className={estilos.compositor} onSubmit={(evento) => void enviar(evento)}>
            <textarea value={texto} onChange={(evento) => setTexto(evento.target.value)} maxLength={4000} disabled={!puedeResponder || ocupado} placeholder={placeholderCompositor} />
            <button type="submit" disabled={!puedeResponder || ocupado || !texto.trim()}>Enviar</button>
          </form>
        </> : <div className={estilos.sinSeleccion}><h2>Chat de soporte</h2><p>Seleccioná una conversación para ver los mensajes.</p></div>}
        {error ? <p className={estilos.error} role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
