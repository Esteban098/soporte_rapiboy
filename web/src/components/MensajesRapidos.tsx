"use client";

import { useMemo, useState } from "react";
import type { RespuestaRapida } from "@/lib/chat-sellers";
import estilos from "./mensajes-rapidos.module.css";

type Borrador = { id: string | null; atajo: string; titulo: string; contenido: string; activa: boolean };
const VACIO: Borrador = { id: null, atajo: "", titulo: "", contenido: "", activa: true };

export function MensajesRapidos({ iniciales }: { iniciales: RespuestaRapida[] }) {
  const [respuestas, setRespuestas] = useState(iniciales);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const consulta = busqueda.trim().toLocaleLowerCase("es");
  const visibles = useMemo(() => respuestas.filter((respuesta) =>
    !consulta || `${respuesta.atajo} ${respuesta.titulo} ${respuesta.contenido}`.toLocaleLowerCase("es").includes(consulta),
  ), [consulta, respuestas]);

  async function recargar() {
    const respuesta = await fetch("/api/whatsapp/respuestas-rapidas", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !datos?.ok) throw new Error(datos?.error || "No se pudieron actualizar los mensajes rápidos.");
    setRespuestas(datos.respuestas as RespuestaRapida[]);
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!borrador) return;
    setOcupado(true);
    setError("");
    try {
      const url = borrador.id ? `/api/whatsapp/respuestas-rapidas/${borrador.id}` : "/api/whatsapp/respuestas-rapidas";
      const respuesta = await fetch(url, {
        method: borrador.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(borrador),
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new Error(datos?.error || "No se pudo guardar el mensaje rápido.");
      await recargar();
      setBorrador(null);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo guardar el mensaje rápido.");
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(respuestaRapida: RespuestaRapida) {
    if (!window.confirm(`¿Eliminar el mensaje rápido /${respuestaRapida.atajo}?`)) return;
    setOcupado(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/whatsapp/respuestas-rapidas/${respuestaRapida.id}`, { method: "DELETE" });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new Error(datos?.error || "No se pudo eliminar el mensaje rápido.");
      setRespuestas((actuales) => actuales.filter((fila) => fila.id !== respuestaRapida.id));
      if (borrador?.id === respuestaRapida.id) setBorrador(null);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo eliminar el mensaje rápido.");
    } finally {
      setOcupado(false);
    }
  }

  function editar(respuesta: RespuestaRapida) {
    setBorrador({ id: respuesta.id, atajo: respuesta.atajo, titulo: respuesta.titulo, contenido: respuesta.contenido, activa: respuesta.activa });
    setError("");
  }

  return <section className={estilos.panel}>
    <div className={estilos.toolbar}>
      <input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar atajo o mensaje" aria-label="Buscar mensajes rápidos" />
      <div><span>{visibles.length} mensaje{visibles.length === 1 ? "" : "s"}</span><button type="button" onClick={() => { setBorrador({ ...VACIO }); setError(""); }}>Nuevo mensaje</button></div>
    </div>
    {borrador ? <form className={estilos.editor} onSubmit={(evento) => void guardar(evento)}>
      <label><span>Atajo</span><div className={estilos.atajoInput}><b>/</b><input autoFocus value={borrador.atajo} maxLength={40} onChange={(evento) => setBorrador({ ...borrador, atajo: evento.target.value.replace(/^\/+/, "").toLowerCase() })} placeholder="horarios" required /></div></label>
      <label><span>Título</span><input value={borrador.titulo} maxLength={80} onChange={(evento) => setBorrador({ ...borrador, titulo: evento.target.value })} placeholder="Horarios de atención" required /></label>
      <label className={estilos.contenido}><span>Mensaje</span><textarea value={borrador.contenido} maxLength={4000} onChange={(evento) => setBorrador({ ...borrador, contenido: evento.target.value })} placeholder="Hola, nuestro horario de atención es…" required /></label>
      <label className={estilos.check}><input type="checkbox" checked={borrador.activa} onChange={(evento) => setBorrador({ ...borrador, activa: evento.target.checked })} /> Disponible en el chat</label>
      <div className={estilos.editorAcciones}><button type="button" className={estilos.secundario} disabled={ocupado} onClick={() => setBorrador(null)}>Cancelar</button><button type="submit" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</button></div>
    </form> : null}
    {error ? <p className={estilos.error} role="alert">{error}</p> : null}
    <div className={estilos.lista}>
      {visibles.map((respuesta) => <article key={respuesta.id} className={estilos.item}>
        <div className={estilos.itemCabecera}><div><code>/{respuesta.atajo}</code><strong>{respuesta.titulo}</strong>{!respuesta.activa ? <span>Inactivo</span> : null}</div><div><button type="button" disabled={ocupado} onClick={() => editar(respuesta)}>Editar</button><button type="button" className={estilos.eliminar} disabled={ocupado} onClick={() => void eliminar(respuesta)}>Eliminar</button></div></div>
        <p>{respuesta.contenido}</p>
      </article>)}
      {visibles.length === 0 ? <p className={estilos.vacio}>No hay mensajes rápidos que coincidan.</p> : null}
    </div>
  </section>;
}
