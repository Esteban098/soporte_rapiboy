"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { actualizarConfiguracionEvidencias, revisarEvidencia } from "@/app/evidencias";
import type { DecisionEvidencia, EvidenciaPanel, ScoreDriver } from "@/lib/evidencias";
import estilos from "./evidencias.module.css";

export function PanelEvidencias({ pendientes, scores, config, admin }: {
  pendientes: EvidenciaPanel[]; scores: ScoreDriver[];
  config: { modo: "OBSERVACION" | "ACTIVO"; minimo_muestra_score: number; maximo_por_corrida: number };
  admin: boolean;
}) {
  return <div className={estilos.stack}>
    <section className={estilos.card}>
      <div className={estilos.head}><div><h2>Revisión pendiente</h2><p>Una señal del modelo requiere criterio humano; no implica una entrega incorrecta.</p></div><span className={config.modo === "OBSERVACION" ? estilos.observacion : estilos.activo}>{config.modo}</span></div>
      {pendientes.length === 0 ? <p className={estilos.vacio}>No hay fotografías pendientes de revisión.</p> : <div className={estilos.grilla}>
        {pendientes.map((item) => <Caso key={item.id} item={item} />)}
      </div>}
    </section>
    <section className={estilos.card}>
      <h2>Evidencias confirmadas por driver · últimos 30 días</h2>
      <p>Solo los problemas confirmados cuentan como malos. Sin sanciones automáticas.</p>
      <div className={estilos.tablaWrap}><table><thead><tr><th>Driver</th><th>Revisadas</th><th>Confirmadas</th><th>Proporción mala</th><th>Score</th></tr></thead><tbody>
        {scores.map((s) => <tr key={s.idMotoboy}><td>{s.driver} <small>#{s.idMotoboy}</small></td><td>{s.total}</td><td>{s.confirmadas}</td><td>{s.proporcionMalas.toFixed(1)}%</td><td>{s.muestraSuficiente ? `${s.score?.toFixed(1)} / 100` : `Sin mostrar (< ${s.minimo})`}</td></tr>)}
      </tbody></table></div>
      {scores.length === 0 ? <p className={estilos.vacio}>Todavía no hay muestra activa para calcular scores.</p> : null}
    </section>
    {admin ? <Configuracion config={config} /> : null}
  </div>;
}

function Caso({ item }: { item: EvidenciaPanel }) {
  const [comentario, setComentario] = useState(""); const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition(); const router = useRouter();
  function decidir(decision: DecisionEvidencia) {
    iniciar(async () => { const r = await revisarEvidencia(item.id, decision, comentario); setMensaje(r.ok ? "Revisión guardada." : r.error); if (r.ok) router.refresh(); });
  }
  return <article className={estilos.caso} id={`revision-${item.id}`}>
    {item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer"><Image src={item.fotoUrl} alt={`Evidencia del viaje ${item.idViaje}`} width={360} height={240} unoptimized /></a> : <div className={estilos.sinFoto}>Vista previa no disponible</div>}
    <div className={estilos.cuerpo}><div className={estilos.meta}><strong>Viaje #{item.idViaje}</strong><span>{item.driver}{item.idMotoboy ? ` · #${item.idMotoboy}` : ""}</span></div>
      <p><b>{item.tipoProblema?.replaceAll("_", " ")}</b> · {item.motivo}</p>
      <p className={estilos.detalle}>Confianza {item.confianza == null ? "—" : `${Math.round(item.confianza * 100)}%`} · {new Date(item.evidenciaEn).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}{item.observacion ? " · observación" : ""}</p>
      <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} placeholder="Comentario opcional" />
      <div className={estilos.acciones}><button disabled={pendiente} onClick={() => decidir("CONFIRMADA")}>Confirmar problema</button><button disabled={pendiente} onClick={() => decidir("DESCARTADA")}>Descartar</button><button disabled={pendiente} onClick={() => decidir("INCONCLUSA")}>Inconclusa</button>{item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer">Abrir evidencia</a> : null}</div>
      {mensaje ? <p className={estilos.mensaje}>{mensaje}</p> : null}
    </div>
  </article>;
}

function Configuracion({ config }: { config: { modo: "OBSERVACION" | "ACTIVO"; minimo_muestra_score: number; maximo_por_corrida: number } }) {
  const [modo, setModo] = useState(config.modo);
  const [minimo, setMinimo] = useState(config.minimo_muestra_score); const [maximo, setMaximo] = useState(config.maximo_por_corrida);
  const [mensaje, setMensaje] = useState(""); const [pendiente, iniciar] = useTransition();
  return <section className={estilos.card}><h2>Configuración</h2><p>Activá alertas y score solo después de validar falsos positivos en observación.</p><div className={estilos.form}>
    <label>Modo<select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}><option value="OBSERVACION">Observación</option><option value="ACTIVO">Activo</option></select></label>
    <label>Muestra mínima del score<input type="number" min="1" max="10000" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} /></label>
    <label>Máximo por corrida<input type="number" min="1" max="100" value={maximo} onChange={(e) => setMaximo(Number(e.target.value))} /></label>
    <button disabled={pendiente} onClick={() => iniciar(async () => { const r = await actualizarConfiguracionEvidencias({ modo, minimo, maximo }); setMensaje(r.ok ? "Configuración guardada." : r.error); })}>Guardar configuración</button>{mensaje ? <span>{mensaje}</span> : null}
  </div></section>;
}
