"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type RespuestaRapida = { id: string; atajo: string; titulo: string; contenido: string };

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

async function cargarChats(limite: number): Promise<{ chats: Chat[]; hayMas: boolean }> {
  const respuesta = await fetch(`/api/whatsapp/chats?limit=${limite}`, { cache: "no-store" });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !datos?.ok) throw new Error("No se pudo actualizar la bandeja.");
  return { chats: datos.chats as Chat[], hayMas: datos.hayMas === true };
}

export function ChatSellers({ usuario, esAdmin, respuestasRapidas }: { usuario: string; esAdmin: boolean; respuestasRapidas: RespuestaRapida[] }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | EstadoChat>("abierto");
  const [alcance, setAlcance] = useState<"todos" | "mios">("todos");
  const [soloNoLeidos, setSoloNoLeidos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [limite, setLimite] = useState(100);
  const [hayMas, setHayMas] = useState(false);

  const actualizar = useCallback(async () => {
    try {
      const siguientes = await cargarChats(limite);
      setChats(siguientes.chats);
      setHayMas(siguientes.hayMas);
      setError("");
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cargar la bandeja.");
    } finally {
      setCargando(false);
    }
  }, [limite]);

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
              <span>{estado === "todos" ? chats.length : conteos[estado]}{hayMas ? "+" : ""}</span>
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
          {hayMas && limite < 1000 ? <button type="button" className={estilos.cargarMas} onClick={() => setLimite((actual) => Math.min(1000, actual + 100))}>Cargar más conversaciones</button> : null}
        </div>
        {error ? <p className={estilos.errorLista} role="alert">{error}</p> : null}
      </aside>
      <div className={estilos.detalleHost}>
        {seleccionadoVisible
          ? <ChatSellerDetalle
              key={seleccionadoVisible}
              usuario={usuario}
              esAdmin={esAdmin}
              chat={chats.find((fila) => fila.id === seleccionadoVisible) ?? null}
              respuestasRapidas={respuestasRapidas}
              onActualizar={actualizar}
              onTomado={() => { setAlcance("mios"); setFiltro("asignado"); }}
            />
          : <div className={estilos.resultado}><h2>Chat de soporte</h2><p>Seleccioná una conversación para ver los mensajes.</p></div>}
      </div>
    </section>
  );
}

export function ChatSellerDetalle({ usuario, esAdmin, chat, respuestasRapidas, onActualizar, onTomado }: { usuario: string; esAdmin: boolean; chat: Chat | null; respuestasRapidas: RespuestaRapida[]; onActualizar: () => Promise<void>; onTomado: () => void }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [eliminado, setEliminado] = useState(false);
  const [limiteMensajes, setLimiteMensajes] = useState(100);
  const [hayMensajesAnteriores, setHayMensajesAnteriores] = useState(false);
  const [respuestaActiva, setRespuestaActiva] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mensajesRef = useRef<HTMLDivElement>(null);
  const conversacionId = chat?.id ?? "";
  const existe = chat !== null;
  const noLeido = chat?.noLeido === true;
  const comando = texto.match(/^\/([^\s]*)$/)?.[1]?.toLocaleLowerCase("es") ?? null;
  const sugerencias = useMemo(() => comando === null ? [] : respuestasRapidas.filter((respuesta) =>
    !comando || `${respuesta.atajo} ${respuesta.titulo} ${respuesta.contenido}`.toLocaleLowerCase("es").includes(comando),
  ).slice(0, 8), [comando, respuestasRapidas]);

  useEffect(() => {
    const contenedor = mensajesRef.current;
    if (contenedor) contenedor.scrollTop = contenedor.scrollHeight;
  }, [mensajes.length]);

  const actualizarMensajes = useCallback(async () => {
    const respuesta = await fetch(`/api/whatsapp/chats/${conversacionId}/mensajes?limit=${limiteMensajes}`, { cache: "no-store" });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !datos?.ok) throw new Error("No se pudo abrir la conversación.");
    setMensajes(datos.mensajes as Mensaje[]);
    setHayMensajesAnteriores(datos.hayMas === true);
  }, [conversacionId, limiteMensajes]);

  useEffect(() => {
    let vigente = true;
    const cargar = async () => {
      try {
        if (existe) {
          await actualizarMensajes();
          if (noLeido) {
            await fetch(`/api/whatsapp/chats/${conversacionId}/leer`, { method: "POST" }).catch(() => null);
          }
        }
        if (vigente) setError(existe ? "" : "La conversación no existe o fue eliminada.");
      } catch (falla) {
        if (vigente) setError(falla instanceof Error ? falla.message : "No se pudo abrir la conversación.");
      } finally {
        if (vigente) setCargando(false);
      }
    };
    void cargar();
    const reloj = window.setInterval(() => void cargar(), 5000);
    return () => { vigente = false; window.clearInterval(reloj); };
  }, [actualizarMensajes, conversacionId, existe, noLeido]);

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
      await onActualizar();
      if (accion === "tomar") onTomado();
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
      await onActualizar();
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
      await Promise.all([onActualizar(), actualizarMensajes()]);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo enviar el mensaje.");
    } finally { setOcupado(false); }
  }

  function elegirRespuesta(respuesta: RespuestaRapida) {
    setTexto(respuesta.contenido);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(respuesta.contenido.length, respuesta.contenido.length);
    });
  }

  function teclado(evento: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.nativeEvent.isComposing) return;
    if (sugerencias.length > 0 && comando !== null) {
      if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
        evento.preventDefault();
        setRespuestaActiva((actual) => evento.key === "ArrowDown"
          ? (actual + 1) % sugerencias.length
          : (actual - 1 + sugerencias.length) % sugerencias.length);
        return;
      }
      if (evento.key === "Enter" && !evento.shiftKey) {
        evento.preventDefault();
        elegirRespuesta(sugerencias[respuestaActiva] ?? sugerencias[0]);
        return;
      }
      if (evento.key === "Escape") {
        evento.preventDefault();
        setTexto("");
        return;
      }
    }
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      evento.currentTarget.form?.requestSubmit();
    }
  }

  if (eliminado) return <section className={estilos.resultado}><h2>Conversación eliminada</h2><p>Seleccioná otra conversación de la bandeja.</p></section>;
  if (cargando) return <section className={estilos.resultado}><p>Cargando conversación…</p></section>;
  if (!chat) return <section className={estilos.resultado}><h2>Conversación no disponible</h2><p>{error}</p></section>;

  const esPropio = chat.estado === "asignado" && chat.asignadoA?.toLowerCase() === usuario.toLowerCase();
  const puedeResponder = esPropio && chat.ventanaAbierta;
  const puedeEliminar = esAdmin || chat.estado !== "asignado" || esPropio;
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
        <span className={estilos.avatar} aria-hidden="true">{nombre(chat).slice(0, 1).toUpperCase()}</span>
        <div>
          <h2>{chat.sellerId ? `Seller ${chat.sellerId}` : "Número sin vincular"}</h2>
          <p>{chat.telefono} · {ESTADO[chat.estado]}{chat.asignadoA ? ` · ${chat.asignadoA}` : ""}{chat.cerradoPor ? ` · cerrado por ${chat.cerradoPor}` : ""}{!chat.ventanaAbierta ? " · ventana de respuesta cerrada" : ""}</p>
        </div>
        <div className={estilos.acciones}>
          {esPropio
            ? <button type="button" disabled={ocupado} onClick={() => void cambiarEstado("cerrar")}>Cerrar</button>
            : chat.estado === "asignado"
              ? <span className={estilos.asignado}>En atención por {chat.asignadoA ?? "otro operador"}</span>
              : chat.estado === "abierto"
                ? <button type="button" disabled={ocupado} onClick={() => void cambiarEstado("tomar")}>Tomar conversación</button>
                : null}
          <button type="button" className={estilos.eliminar} disabled={ocupado || !puedeEliminar} onClick={() => void eliminar()}>Eliminar</button>
        </div>
      </header>
      <div className={estilos.mensajes} ref={mensajesRef}>
        {hayMensajesAnteriores && limiteMensajes < 1000
          ? <button type="button" className={estilos.cargarMensajes} onClick={() => setLimiteMensajes((actual) => Math.min(1000, actual + 100))}>Cargar mensajes anteriores</button>
          : null}
        {mensajes.map((mensaje) => <article key={mensaje.id} className={`${estilos.mensaje} ${mensaje.direccion === "saliente" ? estilos.saliente : estilos.entrante}`}>
          <div>{mensaje.autorTipo === "seller" ? "Seller" : mensaje.autorTipo === "bot" ? "Bot" : mensaje.autorEmail ?? "Operador"}</div>
          <p>{mensaje.texto}</p>
          <time>{fecha(mensaje.creadoEn)}{mensaje.estadoEnvio === "fallido" ? " · No enviado" : mensaje.estadoEnvio === "revision" ? " · Verificar envío" : mensaje.estadoEnvio === "pendiente" ? " · Envío en curso" : ""}</time>
        </article>)}
        {mensajes.length === 0 ? <p className={estilos.vacio}>Sin mensajes en esta conversación.</p> : null}
      </div>
      <form className={estilos.compositor} onSubmit={(evento) => void enviar(evento)}>
        {sugerencias.length > 0 && puedeResponder ? <div className={estilos.respuestas} role="listbox" aria-label="Mensajes rápidos">
          <div className={estilos.respuestasTitulo}><b>Mensajes rápidos</b><span>↑ ↓ para elegir · Enter para insertar</span></div>
          {sugerencias.map((respuesta, indice) => <button key={respuesta.id} type="button" role="option" aria-selected={indice === respuestaActiva} className={indice === respuestaActiva ? estilos.respuestaActiva : ""} onMouseDown={(evento) => evento.preventDefault()} onClick={() => elegirRespuesta(respuesta)}>
            <span><code>/{respuesta.atajo}</code><b>{respuesta.titulo}</b></span><small>{respuesta.contenido}</small>
          </button>)}
        </div> : comando !== null && puedeResponder ? <div className={estilos.sinRespuestas}>No hay mensajes rápidos para “/{comando}”.</div> : null}
        <button type="button" className={estilos.abrirRapidas} disabled={!puedeResponder || ocupado} onClick={() => { setRespuestaActiva(0); setTexto("/"); textareaRef.current?.focus(); }} aria-label="Abrir mensajes rápidos">/</button>
        <textarea ref={textareaRef} value={texto} onChange={(evento) => { setRespuestaActiva(0); setTexto(evento.target.value); }} onKeyDown={teclado} maxLength={4000} disabled={!puedeResponder || ocupado} placeholder={placeholder} aria-label="Mensaje" />
        <button type="submit" className={estilos.enviar} disabled={!puedeResponder || ocupado || !texto.trim()} aria-label="Enviar mensaje"><span aria-hidden="true">➤</span><b>Enviar</b></button>
      </form>
      {error ? <p className={estilos.error} role="alert">{error}</p> : null}
    </section>
  );
}
