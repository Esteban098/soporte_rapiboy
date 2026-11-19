"use client";
import { useEffect, useState } from "react";
import { comentariosSeguimiento, domicilioSeguimiento } from "@/app/seguimiento";
import type { ComentarioSeguimiento } from "@/lib/seguimiento-colaboracion";
import { nombreDePersona, responsablesSeguimiento, type Seguimiento } from "@/lib/seguimiento";
import { fechaHoraArgentina } from "@/lib/formato";
import estilos from "./seguimiento-tablero.module.css";

export function EventosDetalleSeguimiento({ reporte, admin, alRetirar }: { reporte: Seguimiento; admin: boolean; alRetirar: (correo: string) => void }) {
  const [comentarios, setComentarios] = useState<ComentarioSeguimiento[]>([]);
  const [antes, setAntes] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reintento, setReintento] = useState(0);
  const [domicilio, setDomicilio] = useState<string | null>(null);
  const [errorDomicilio, setErrorDomicilio] = useState<string | null>(null);
  const [cargandoDomicilio, setCargandoDomicilio] = useState(true);
  const [reintentoDomicilio, setReintentoDomicilio] = useState(0);
  useEffect(() => {
    let vigente = true;
    comentariosSeguimiento(reporte.id).then((r) => {
      if (!vigente) return;
      if (r.ok) { setComentarios(r.comentarios); setAntes(r.anteriores); setError(null); }
      else setError(r.error);
    }).catch(() => { if (vigente) setError("No se pudo leer el historial."); }).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [reporte.id, reporte.revision, reintento]);
  useEffect(() => {
    let vigente = true;
    domicilioSeguimiento(reporte.id).then((r) => {
      if (!vigente) return;
      if (r.ok) { setDomicilio(r.domicilio); setErrorDomicilio(null); } else setErrorDomicilio(r.error);
    }).catch(() => { if (vigente) setErrorDomicilio("No se pudo consultar el domicilio."); }).finally(() => { if (vigente) setCargandoDomicilio(false); });
    return () => { vigente = false; };
  }, [reporte.id, reintentoDomicilio]);
  const eventos: { clave: string; etiqueta: string; autor: string | null; fecha: Date | null; texto?: string; anterior?: string | null; retirar?: string }[] = [
    { clave: "alta", etiqueta: "Reportó", autor: reporte.creadoPor, fecha: reporte.creado },
    ...responsablesSeguimiento(reporte).map((correo) => ({ clave: `toma:${correo}`, etiqueta: "Tomó", autor: correo, fecha: correo === reporte.tomadoPor?.trim().toLowerCase() ? reporte.tomadoEn : reporte.tomadoEn2 ?? null, retirar: correo })),
    ...comentarios.map((c) => ({ clave: c.id, etiqueta: c.tipo === "comentario" ? "Comentó" : c.tipo === "correccion" ? "Corrigió" : c.tipo === "creacion" ? "Motivo inicial" : "Texto previo", autor: c.autor, fecha: new Date(c.creado_en), texto: c.texto, anterior: c.anterior })),
    ...(reporte.estado === "cerrado" ? [{ clave: "cierre", etiqueta: "Cerró", autor: reporte.atendidoPor, fecha: reporte.atendidoEn }] : []),
  ];
  eventos.sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0) || a.clave.localeCompare(b.clave));
  async function anteriores() {
    if (antes === null) return;
    setCargando(true);
    try { const r = await comentariosSeguimiento(reporte.id, antes);
      if (r.ok) { setComentarios((prev) => [...new Map([...r.comentarios, ...prev].map((c) => [c.id, c])).values()]); setAntes(r.anteriores); setError(null); }
      else setError(r.error);
    } catch { setError("No se pudieron leer los comentarios anteriores."); } finally { setCargando(false); }
  }
  return <>
    <div className={estilos.domicilioDetalle}><dt>Domicilio</dt><dd>{cargandoDomicilio ? "Consultando…" : errorDomicilio ? <>{errorDomicilio} <button type="button" onClick={() => { setCargandoDomicilio(true); setReintentoDomicilio((n) => n + 1); }}>Reintentar</button></> : domicilio ?? "No informado en RapiboyData"}</dd></div>
    {antes !== null ? <div><dt>Historial</dt><dd><button type="button" disabled={cargando} onClick={() => void anteriores()}>Ver comentarios anteriores</button></dd></div> : null}
    {eventos.map((e) => <div key={e.clave}><dt>{e.etiqueta}</dt><dd><strong>{nombreDePersona(e.autor)}</strong><time dateTime={e.fecha?.toISOString()}>{fechaHoraArgentina(e.fecha)}</time>
      {e.texto ? <p className={estilos.comentarioEvento}>{e.texto}</p> : null}
      {e.anterior != null ? <details><summary>Texto anterior</summary><p className={estilos.comentarioEvento}>{e.anterior}</p></details> : null}
      {admin && e.retirar ? <button type="button" className={estilos.retirarResponsable} onClick={() => alRetirar(e.retirar!)}>Retirar</button> : null}
    </dd></div>)}
    {cargando ? <div><dt>Historial</dt><dd role="status">Cargando comentarios…</dd></div> : null}
    {error ? <div><dt>Historial</dt><dd role="status">{error} <button type="button" onClick={() => { setCargando(true); setReintento((n) => n + 1); }}>Reintentar</button></dd></div> : null}
  </>;
}
