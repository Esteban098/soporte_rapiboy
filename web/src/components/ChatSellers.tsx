"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import estilos from "./chat-sellers.module.css";

type EstadoChat = "abierto" | "asignado" | "cerrado";
type Chat = {
  id: string;
  canal: "directo" | "grupo";
  sellerId: number | null;
  estado: EstadoChat;
  requiereAtencion: boolean;
  asignadoA: string | null;
  cerradoPor: string | null;
  noLeido: boolean;
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

const ESTADO: Record<EstadoChat, string> = {
  abierto: "Abierto",
  asignado: "Asignado",
  cerrado: "Cerrado",
};

function nombre(chat: Chat): string {
  return chat.sellerId ? `Seller ${chat.sellerId}` : chat.telefono;
}

async function cargarChats(): Promise<Chat[]> {
  const respuesta = await fetch("/api/whatsapp/chats", { cache: "no-store" });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !datos?.ok) throw new Error("No se pudo actualizar la bandeja.");
  return datos.chats as Chat[];
}

export function ChatSellers({ usuario }: { usuario: string }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | EstadoChat>("abierto");
  const [alcance, setAlcance] = useState<"todos" | "mios">("todos");
  const [soloNoLeidos, setSoloNoLeidos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const actualizar = useCallback(async () => {
    try {
      const siguientes = await cargarChats();
      setChats(siguientes);
      setError("");
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cargar la bandeja.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const inicial = window.setTimeout(() => void actualizar(), 0);
    const reloj = window.setInterval(() => void actualizar(), 8000);
    return () => { window.clearTimeout(inicial); window.clearInterval(reloj); };
  }, [actualizar]);

  const conteos = useMemo(() => ({
    abierto: chats.filter((chat) => chat.estado === "abierto").length,
    asignado: chats.filter((chat) => chat.estado === "asignado").length,
    cerrado: chats.filter((chat) => chat.estado === "cerrado").length,
  }), [chats]);
  const consulta = busqueda.trim().toLocaleLowerCase("es");
  const visibles = chats.filter((chat) =>
    (filtro === "todos" || chat.estado === filtro) &&
    (alcance === "todos" || chat.asignadoA?.toLowerCase() === usuario.toLowerCase()) &&
    (!soloNoLeidos || chat.noLeido) &&
    (!consulta || `${nombre(chat)} ${chat.telefono} ${chat.extracto}`.toLocaleLowerCase("es").includes(consulta)),
  );
  const seleccionadoVisible = seleccionado && chats.some((chat) => chat.id === seleccionado)
    ? seleccionado
    : visibles[0]?.id ?? null;

  return (
    <section className={estilos.inbox} aria-label="Chat de soporte para sellers">
      <aside className={estilos.lista}>
        <div className={estilos.herramientas}>
          <div className={estilos.alcance}>
            <button type="button" className={alcance === "mios" ? estilos.filtroActivo : ""} onClick={() => { setAlcance("mios"); setSeleccionado(null); }}>Míos</button>
            <button type="button" className={alcance === "todos" ? estilos.filtroActivo : ""} onClick={() => { setAlcance("todos"); setSeleccionado(null); }}>Todos</button>
            <button type="button" className={soloNoLeidos ? estilos.filtroActivo : ""} onClick={() => { setSoloNoLeidos((valor) => !valor); setSeleccionado(null); }}>No leídos</button>
          </div>
          <input value={busqueda} onChange={(evento) => { setBusqueda(evento.target.value); setSeleccionado(null); }} placeholder="Nombre, número o mensaje" aria-label="Buscar conversaciones" />
        </div>
        <nav className={estilos.filtros} aria-label="Estados de las conversaciones">
          {(["abierto", "asignado", "cerrado", "todos"] as const).map((estado) => (
            <button key={estado} type="button" className={filtro === estado ? estilos.filtroActivo : ""} onClick={() => { setFiltro(estado); setSeleccionado(null); }}>
              {estado === "todos" ? "Todos" : ESTADO[estado]}
              <span>{estado === "todos" ? chats.length : conteos[estado]}</span>
            </button>
          ))}
        </nav>
        <div className={estilos.listaCabecera}>
          <div><h2>Conversaciones</h2><p>Seleccioná un chat para atenderlo.</p></div>
          <span>{visibles.length}</span>
        </div>
        <div className={estilos.listaCompleta}>
          {cargando ? <p className={estilos.vacio}>Cargando…</p> : null}
          {!cargando && visibles.length === 0 ? <p className={estilos.vacio}>No hay conversaciones en este estado.</p> : null}
          {visibles.map((chat) => (
            <button key={chat.id} type="button" onClick={() => setSeleccionado(chat.id)} className={`${estilos.item} ${seleccionadoVisible === chat.id ? estilos.itemActivo : ""}`}>
              <span className={estilos.itemArriba}><b>{nombre(chat)}</b><time>{fecha(chat.ultimoMensajeEn)}</time></span>
              <span className={estilos.estado}>
                {chat.noLeido ? <strong className={estilos.noLeido}>Nuevo</strong> : null}
                <i className={`${estilos.punto} ${estilos[`punto_${chat.estado}`]}`} />
                {ESTADO[chat.estado]}{chat.requiereAtencion ? " · necesita atención" : ""}
                {chat.asignadoA ? ` · ${chat.asignadoA}` : ""}
              </span>
              <span className={estilos.extracto}>{chat.extracto}</span>
            </button>
          ))}
        </div>
        {error ? <p className={estilos.errorLista} role="alert">{error}</p> : null}
      </aside>
      <div className={estilos.detalleHost}>
        {seleccionadoVisible
          ? <ChatSellerDetalle key={seleccionadoVisible} usuario={usuario} conversacionId={seleccionadoVisible} onEliminado={() => void actualizar()} />
          : <div className={estilos.resultado}><h2>Chat de soporte</h2><p>Seleccioná una conversación para ver los mensajes.</p></div>}
      </div>
    </section>
  );
}

export function ChatSellerDetalle({ usuario, conversacionId, onEliminado }: { usuario: string; conversacionId: string; onEliminado?: () => void }) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [eliminado, setEliminado] = useState(false);

  const actualizarChat = useCallback(async () => {
    const chats = await cargarChats();
    const actual = chats.find((fila) => fila.id === conversacionId) ?? null;
    setChat(actual);
    return actual;
  }, [conversacionId]);

  const actualizarMensajes = useCallback(async () => {
    const respuesta = await fetch(`/api/whatsapp/chats/${conversacionId}/mensajes`, { cache: "no-store" });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !datos?.ok) throw new Error("No se pudo abrir la conversación.");
    setMensajes(datos.mensajes as Mensaje[]);
  }, [conversacionId]);

  useEffect(() => {
    let vigente = true;
    const cargar = async () => {
      try {
        const actual = await actualizarChat();
        if (actual) {
          await actualizarMensajes();
          if (actual.noLeido) {
            await fetch(`/api/whatsapp/chats/${conversacionId}/leer`, { method: "POST" }).catch(() => null);
          }
        }
        if (vigente) setError(actual ? "" : "La conversación no existe o fue eliminada.");
      } catch (falla) {
        if (vigente) setError(falla instanceof Error ? falla.message : "No se pudo abrir la conversación.");
      } finally {
        if (vigente) setCargando(false);
      }
    };
    void cargar();
    const reloj = window.setInterval(() => void cargar(), 5000);
    return () => { vigente = false; window.clearInterval(reloj); };
  }, [actualizarChat, actualizarMensajes, conversacionId]);

  async function cambiarEstado(accion: "tomar" | "cerrar") {
    if (!chat) return;
    setOcupado(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/whatsapp/chats/${chat.id}/estado`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion }),
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new Error("El estado cambió. Actualizá la conversación e intentá otra vez.");
      await actualizarChat();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cambiar el estado.");
    } finally { setOcupado(false); }
  }

  async function eliminar() {
    if (!chat || !window.confirm("¿Eliminar esta conversación y todos sus mensajes? Esta acción no se puede deshacer.")) return;
    setOcupado(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/whatsapp/chats/${chat.id}/estado`, { method: "DELETE" });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new Error(datos?.error || "No se pudo eliminar la conversación.");
      setEliminado(true);
      onEliminado?.();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo eliminar la conversación.");
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
      await Promise.all([actualizarChat(), actualizarMensajes()]);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo enviar el mensaje.");
    } finally { setOcupado(false); }
  }

  if (eliminado) return <section className={estilos.resultado}><h2>Conversación eliminada</h2><p>Seleccioná otra conversación de la bandeja.</p></section>;
  if (cargando) return <section className={estilos.resultado}><p>Cargando conversación…</p></section>;
  if (!chat) return <section className={estilos.resultado}><h2>Conversación no disponible</h2><p>{error}</p></section>;

  const puedeResponder = chat.estado === "asignado" && chat.asignadoA?.toLowerCase() === usuario.toLowerCase() && chat.ventanaAbierta;
  const placeholder = chat.estado !== "asignado"
    ? chat.estado === "cerrado" ? "La conversación está cerrada." : "Tomá la conversación para responder."
    : !chat.ventanaAbierta
      ? "La ventana cerró. Esperá a que el seller vuelva a escribir."
      : chat.asignadoA?.toLowerCase() === usuario.toLowerCase()
        ? "Escribí una respuesta…"
        : `En atención por ${chat.asignadoA ?? "otro operador"}.`;

  return (
    <section className={estilos.detalleSolo} aria-label={`Conversación con ${nombre(chat)}`}>
      <header className={estilos.cabecera}>
        <div>
          <h2>{chat.sellerId ? `Seller ${chat.sellerId}` : "Número sin vincular"}</h2>
          <p>{chat.telefono} · {ESTADO[chat.estado]}{chat.asignadoA ? ` · ${chat.asignadoA}` : ""}{chat.cerradoPor ? ` · cerrado por ${chat.cerradoPor}` : ""}{!chat.ventanaAbierta ? " · ventana de respuesta cerrada" : ""}</p>
        </div>
        <div className={estilos.acciones}>
          {chat.estado === "asignado" && puedeResponder
            ? <button type="button" disabled={ocupado} onClick={() => void cambiarEstado("cerrar")}>Cerrar</button>
            : chat.estado === "asignado"
              ? <span className={estilos.asignado}>En atención por {chat.asignadoA ?? "otro operador"}</span>
              : chat.estado === "abierto"
                ? <button type="button" disabled={ocupado} onClick={() => void cambiarEstado("tomar")}>Tomar conversación</button>
                : null}
          <button type="button" className={estilos.eliminar} disabled={ocupado} onClick={() => void eliminar()}>Eliminar</button>
        </div>
      </header>
      <div className={estilos.mensajes}>
        {mensajes.map((mensaje) => <article key={mensaje.id} className={`${estilos.mensaje} ${mensaje.direccion === "saliente" ? estilos.saliente : estilos.entrante}`}>
          <div>{mensaje.autorTipo === "seller" ? "Seller" : mensaje.autorTipo === "bot" ? "Bot" : mensaje.autorEmail ?? "Operador"}</div>
          <p>{mensaje.texto}</p>
          <time>{fecha(mensaje.creadoEn)}{mensaje.estadoEnvio === "fallido" ? " · No enviado" : mensaje.estadoEnvio === "revision" ? " · Verificar envío" : mensaje.estadoEnvio === "pendiente" ? " · Envío en curso" : ""}</time>
        </article>)}
        {mensajes.length === 0 ? <p className={estilos.vacio}>Sin mensajes en esta conversación.</p> : null}
      </div>
      <form className={estilos.compositor} onSubmit={(evento) => void enviar(evento)}>
        <textarea value={texto} onChange={(evento) => setTexto(evento.target.value)} maxLength={4000} disabled={!puedeResponder || ocupado} placeholder={placeholder} />
        <button type="submit" disabled={!puedeResponder || ocupado || !texto.trim()}>Enviar</button>
      </form>
      {error ? <p className={estilos.error} role="alert">{error}</p> : null}
    </section>
  );
}
