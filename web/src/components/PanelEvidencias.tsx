"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { actualizarConfiguracionEvidencias, reabrirEvidencia, revisarEvidencia } from "@/app/evidencias";
import type { DecisionEvidencia, EvidenciaPanel, ScoreDriver } from "@/lib/evidencias";
import { ETIQUETA_HORA_PLATAFORMA, ZONA_PLATAFORMA } from "@/lib/zona-horaria";
import estilos from "./evidencias.module.css";

export function PanelEvidencias({ pendientesHoy, pendientesAnteriores, revisadasRecientes, scores, config, admin }: {
  pendientesHoy: EvidenciaPanel[]; pendientesAnteriores: EvidenciaPanel[]; scores: ScoreDriver[];
  revisadasRecientes: EvidenciaPanel[];
  config: { modo: "OBSERVACION" | "ACTIVO"; minimo_muestra_score: number; maximo_por_corrida: number };
  admin: boolean;
}) {
  return <div className={estilos.stack}>
    <section className={estilos.card}>
      <div className={estilos.head}><div><h2>Revisión pendiente · hoy</h2><p>Una señal del modelo requiere criterio humano; no implica una entrega incorrecta.</p></div><span className={config.modo === "OBSERVACION" ? estilos.observacion : estilos.activo}>{config.modo}</span></div>
      {pendientesHoy.length === 0 ? <p className={estilos.vacio}>No hay fotografías de hoy pendientes de revisión.</p> : <div className={estilos.grilla}>
        {pendientesHoy.map((item) => <Caso key={item.id} item={item} />)}
      </div>}
    </section>
    {pendientesAnteriores.length ? <details className={estilos.anterior}>
      <summary>{pendientesAnteriores.length} pendiente{pendientesAnteriores.length === 1 ? "" : "s"} de días anteriores</summary>
      <p>Se conservan hasta siete días para completar su revisión. Las imágenes vencidas se eliminan; el historial sin foto se mantiene para auditoría.</p>
      <div className={estilos.grilla}>{pendientesAnteriores.map((item) => <Caso key={item.id} item={item} />)}</div>
    </details> : null}
    <details className={estilos.anterior}>
      <summary>Revisadas recientemente ({revisadasRecientes.length})</summary>
      <p>Se muestran las últimas 50 mientras la copia de la foto siga disponible. Podés devolver cualquiera a pendientes; la decisión anterior y la reapertura quedan auditadas.</p>
      {revisadasRecientes.length ? <div className={estilos.grilla}>{revisadasRecientes.map((item) => <CasoRevisado key={item.id} item={item} />)}</div> : <p className={estilos.vacio}>Todavía no hay revisiones recientes.</p>}
    </details>
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
  const [porConfirmar, setPorConfirmar] = useState<DecisionEvidencia | null>(null);
  const [pendiente, iniciar] = useTransition(); const router = useRouter();
  function decidir(decision: DecisionEvidencia) {
    iniciar(async () => { const r = await revisarEvidencia(item.id, decision, comentario); setMensaje(r.ok ? "Revisión guardada." : r.error); if (r.ok) router.refresh(); });
  }
  return <article className={estilos.caso} id={`revision-${item.id}`}>
    {item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer"><Image src={item.fotoUrl} alt={`Evidencia del viaje ${item.idViaje}`} width={360} height={240} unoptimized /></a> : <div className={estilos.sinFoto}>Vista previa no disponible</div>}
    <div className={estilos.cuerpo}><div className={estilos.meta}><strong>Viaje #{item.idViaje}</strong><span>{item.driver}{item.idMotoboy ? ` · #${item.idMotoboy}` : ""}</span></div>
      <p><b>{item.tipoProblema?.replaceAll("_", " ")}</b> · {item.motivo}</p>
      <p className={estilos.detalle}>Confianza {item.confianza == null ? "—" : `${Math.round(item.confianza * 100)}%`} · {new Date(item.evidenciaEn).toLocaleString("es-AR", { timeZone: ZONA_PLATAFORMA })} {ETIQUETA_HORA_PLATAFORMA}{item.observacion ? " · observación" : ""}</p>
      <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} placeholder="Comentario opcional" />
      <div className={estilos.acciones}><button disabled={pendiente} onClick={() => setPorConfirmar("CONFIRMADA")}>Confirmar problema</button><button disabled={pendiente} onClick={() => setPorConfirmar("DESCARTADA")}>Descartar</button><button disabled={pendiente} onClick={() => setPorConfirmar("INCONCLUSA")}>Inconclusa</button>{item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer">Abrir evidencia</a> : null}</div>
      {porConfirmar ? <div className={estilos.confirmacion} role="alert"><span>¿Guardar como <strong>{etiquetaDecision(porConfirmar)}</strong>?</span><button disabled={pendiente} onClick={() => decidir(porConfirmar)}>Sí, guardar</button><button disabled={pendiente} onClick={() => setPorConfirmar(null)}>Cancelar</button></div> : null}
      {mensaje ? <p className={estilos.mensaje}>{mensaje}</p> : null}
    </div>
  </article>;
}

function CasoRevisado({ item }: { item: EvidenciaPanel }) {
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return <article className={estilos.caso}>
    {item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer"><Image src={item.fotoUrl} alt={`Evidencia del viaje ${item.idViaje}`} width={360} height={240} unoptimized /></a> : <div className={estilos.sinFoto}>Vista previa no disponible</div>}
    <div className={estilos.cuerpo}>
      <div className={estilos.meta}><strong>Viaje #{item.idViaje}</strong><span>{item.driver}{item.idMotoboy ? ` · #${item.idMotoboy}` : ""}</span></div>
      <p><b>{item.decision ? etiquetaDecision(item.decision) : "Revisada"}</b>{item.comentarioRevision ? ` · ${item.comentarioRevision}` : ""}</p>
      <p className={estilos.detalle}>{item.revisadaEn ? new Date(item.revisadaEn).toLocaleString("es-AR", { timeZone: ZONA_PLATAFORMA }) : "—"} {ETIQUETA_HORA_PLATAFORMA}{item.revisadaPor ? ` · ${item.revisadaPor}` : ""}</p>
      <div className={estilos.acciones}><button disabled={pendiente} onClick={() => iniciar(async () => { const r = await reabrirEvidencia(item.id); setMensaje(r.ok ? "Devuelta a pendientes." : r.error); if (r.ok) router.refresh(); })}>Volver a pendientes</button>{item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer">Abrir evidencia</a> : null}</div>
      {mensaje ? <p className={estilos.mensaje}>{mensaje}</p> : null}
    </div>
  </article>;
}

function etiquetaDecision(decision: DecisionEvidencia): string {
  return ({ CONFIRMADA: "problema confirmado", DESCARTADA: "descartada", INCONCLUSA: "inconclusa" } as const)[decision];
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
