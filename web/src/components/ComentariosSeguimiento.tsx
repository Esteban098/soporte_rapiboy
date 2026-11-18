"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { agregarComentarioSeguimiento, comentariosSeguimiento } from "@/app/seguimiento";
import { nombreDePersona, type Seguimiento } from "@/lib/seguimiento";
import type { ComentarioSeguimiento } from "@/lib/seguimiento-colaboracion";
import { fechaHoraArgentina } from "@/lib/formato";
import { AreaMenciones } from "./AreaMenciones";
import estilos from "./editor-caso.module.css";
import propio from "./seguimiento-comentarios.module.css";

export function ComentariosSeguimiento({ reporte, alCerrar }: { reporte: Seguimiento; alCerrar: () => void }) {
  const [items, setItems] = useState<ComentarioSeguimiento[]>([]);
  const [antes, setAntes] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, iniciar] = useTransition();
  const panel = useRef<HTMLDivElement>(null);
  const completo = useRef(false);
  const solicitud = useRef({ texto: "", id: "" });
  const router = useRouter();
  const cargar = useCallback(async () => {
    const resultado = await comentariosSeguimiento(reporte.id);
    if (!resultado.ok) { setError(resultado.error); setCargando(false); return; }
    setItems((prev) => [...new Map([...prev, ...resultado.comentarios].map((c) => [c.id, c])).values()].sort((a, b) => a.orden - b.orden));
    if (resultado.anteriores === null) completo.current = true;
    setAntes((prev) => completo.current ? null : Math.min(prev ?? Infinity, resultado.anteriores ?? Infinity));
    setCargando(false);
  }, [reporte.id]);
  useEffect(() => {
    const invocador = document.activeElement as HTMLElement | null;
    let vigente = true;
    const inicio = setTimeout(() => {
      panel.current?.focus();
      void cargar().catch(() => { if (vigente) { setError("No se pudo leer el historial."); setCargando(false); } });
    }, 0);
    const intervalo = setInterval(() => { if (document.visibilityState === "visible") void cargar().catch(() => null); }, 15_000);
    return () => { vigente = false; clearTimeout(inicio); clearInterval(intervalo); if (invocador?.isConnected) invocador.focus(); };
  }, [cargar]);
  function cerrar() { if (!texto.trim() || window.confirm("Hay un comentario sin guardar. ¿Descartarlo?")) alCerrar(); }
  function guardar() {
    const limpio = texto.trim();
    if (solicitud.current.texto !== limpio) solicitud.current = { texto: limpio, id: crypto.randomUUID() };
    iniciar(async () => {
      setError(null); setAviso("");
      try {
        const resultado = await agregarComentarioSeguimiento(reporte.id, limpio, solicitud.current.id);
        if (!resultado.ok) { setError(resultado.error); return; }
        setTexto(""); solicitud.current = { texto: "", id: "" }; setAviso("Comentario guardado.");
        await cargar(); router.refresh();
      } catch { setError("No se pudo confirmar. Podés reintentar sin cambiar el texto para evitar duplicados."); }
    });
  }
  return createPortal(<div className={estilos.fondo} role="dialog" aria-modal="true" aria-label={`Comentarios del caso ${reporte.casoId}`} onKeyDown={(e) => {
    if (e.key === "Escape") { e.preventDefault(); cerrar(); }
    if (e.key === "Tab") {
      const elementos = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href], summary');
      if (!elementos?.length) return;
      const primero = elementos[0], ultimo = elementos[elementos.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
  }}>
    <div className={estilos.panel} ref={panel} tabIndex={-1}>
      <h2 className={estilos.titulo}>Comentarios · #{reporte.casoId}</h2>
      <p className={estilos.nota}>Cada aporte conserva autor y fecha. Comentar no cambia quién tiene tomado el caso.</p>
      {antes !== null ? <button className={estilos.secundario} type="button" disabled={guardando} onClick={() => iniciar(async () => {
        try {
          const resultado = await comentariosSeguimiento(reporte.id, antes);
          if (!resultado.ok) { setError(resultado.error); return; }
          setItems((prev) => [...new Map([...resultado.comentarios, ...prev].map((c) => [c.id, c])).values()].sort((a, b) => a.orden - b.orden));
          if (resultado.anteriores === null) completo.current = true;
          setAntes(resultado.anteriores);
        } catch { setError("No se pudieron leer los comentarios anteriores."); }
      })}>Ver anteriores</button> : null}
      {cargando ? <p className={estilos.nota}>Cargando comentarios…</p> : <ol className={propio.historial}>{items.map((c) => <li key={c.id}>
        <div><strong>{nombreDePersona(c.autor)}</strong><time>{fechaHoraArgentina(new Date(c.creado_en))}</time></div>
        {c.tipo !== "comentario" ? <small>{c.tipo === "legado" ? "Comentario previo al historial" : c.tipo === "creacion" ? "Motivo inicial" : "Motivo corregido"}</small> : null}
        <p>{c.texto}</p>{c.anterior !== null ? <details><summary>Ver texto anterior</summary><p>{c.anterior}</p></details> : null}
      </li>)}</ol>}
      {reporte.estado === "abierto" ? <label className={estilos.campo}><span className={estilos.etiqueta}>Agregar comentario</span>
        <AreaMenciones className={`${estilos.entrada} ${estilos.area}`} value={texto} onValueChange={setTexto} rows={3} maxLength={4000} disabled={guardando} placeholder="Novedades para continuar el caso…" />
        <small className={estilos.nota}>Podés mencionar con @. Los comentarios anteriores no se reemplazan.</small>
      </label> : <p className={estilos.nota}>El caso está cerrado. Reabrilo para agregar una novedad.</p>}
      {error ? <p className={estilos.error} role="alert">{error}</p> : null}{aviso ? <p className={estilos.nota} role="status">{aviso}</p> : null}
      <div className={estilos.acciones}>{reporte.estado === "abierto" ? <button type="button" className={estilos.principal} disabled={guardando || !texto.trim()} onClick={guardar}>{guardando ? "Guardando…" : "Guardar comentario"}</button> : null}
        <button type="button" className={estilos.secundario} onClick={cerrar}>Volver</button>
      </div>
    </div>
  </div>, document.body);
}
