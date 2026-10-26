"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { actualizarConfiguracionEvidencias, reabrirEvidencia, revisarEvidencia } from "@/app/evidencias";
import type { DecisionEvidencia, EvidenciaPanel, ScoreDriver } from "@/lib/evidencias";
import { ETIQUETA_HORA_PLATAFORMA, ZONA_PLATAFORMA } from "@/lib/zona-horaria";
import { ETIQUETAS_GEOGRAFIA } from "@/lib/evidencias-geografia";
import { TablaOrdenable } from "./TablaOrdenable";
import estilos from "./evidencias.module.css";

type ConfigEvidencias = { modo: "OBSERVACION" | "ACTIVO"; minimo_muestra_score: number; maximo_por_corrida: number; radio_geografico_m?: number };

export function PanelEvidencias({ pendientesHoy, pendientesAnteriores, revisadasRecientes, geografiaReciente, scores, config, admin }: {
  pendientesHoy: EvidenciaPanel[]; pendientesAnteriores: EvidenciaPanel[]; scores: ScoreDriver[];
  revisadasRecientes: EvidenciaPanel[];
  geografiaReciente: EvidenciaPanel[];
  config: ConfigEvidencias;
  admin: boolean;
}) {
  return <div className={estilos.stack}>
    <section className={estilos.card}>
      <div className={estilos.head}><div><h2>Revisión pendiente · hoy</h2><p>Una alerta visual o geográfica requiere criterio humano; no implica una entrega incorrecta.</p></div><span className={config.modo === "OBSERVACION" ? estilos.observacion : estilos.activo}>{config.modo}</span></div>
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
    <details className={estilos.anterior}>
      <summary>Validación geográfica · recientes ({geografiaReciente.length})</summary>
      <p>Últimas 50 evidencias procesadas con retención vigente. Solo se compara el evento Entregado, salvo que el ID tenga ubicación o teléfono en Mensual o Histórico. Sin GPS no se presume una entrega incorrecta.</p>
      <div className={estilos.tablaWrap}><TablaOrdenable filas={geografiaReciente} claveFila={(item) => item.id} columnas={[
        { clave: "viaje", titulo: "Viaje", valor: (item) => item.idViaje, render: (item) => `#${item.idViaje}` },
        { clave: "driver", titulo: "Driver", valor: (item) => item.driver },
        { clave: "resultado", titulo: "Resultado", valor: (item) => ETIQUETAS_GEOGRAFIA[item.estadoGeografico] },
        { clave: "distancia", titulo: "Distancia", valor: (item) => item.distanciaM, render: (item) => metros(item.distanciaM) },
        { clave: "radio", titulo: "Rango aplicado", valor: (item) => item.radioM, render: (item) => metros(item.radioM) },
      ]} /></div>
      {!geografiaReciente.length ? <p className={estilos.vacio}>Todavía no hay evaluaciones recientes.</p> : null}
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
      <p><b>Revisión visual: {item.tipoProblema?.replaceAll("_", " ")}</b> · {item.motivo}</p>
      <ResultadoGeografico item={item} />
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
      <ResultadoGeografico item={item} />
      <p className={estilos.detalle}>{item.revisadaEn ? new Date(item.revisadaEn).toLocaleString("es-AR", { timeZone: ZONA_PLATAFORMA }) : "—"} {ETIQUETA_HORA_PLATAFORMA}{item.revisadaPor ? ` · ${item.revisadaPor}` : ""}</p>
      <div className={estilos.acciones}><button disabled={pendiente} onClick={() => iniciar(async () => { const r = await reabrirEvidencia(item.id); setMensaje(r.ok ? "Devuelta a pendientes." : r.error); if (r.ok) router.refresh(); })}>Volver a pendientes</button>{item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer">Abrir evidencia</a> : null}</div>
      {mensaje ? <p className={estilos.mensaje}>{mensaje}</p> : null}
    </div>
  </article>;
}

function etiquetaDecision(decision: DecisionEvidencia): string {
  return ({ CONFIRMADA: "problema confirmado", DESCARTADA: "descartada", INCONCLUSA: "inconclusa" } as const)[decision];
}

function metros(valor: number | null) {
  return valor == null ? "—" : `${valor.toLocaleString("es-MX", { maximumFractionDigits: 1 })} m`;
}

function ResultadoGeografico({ item }: { item: EvidenciaPanel }) {
  return <p className={item.estadoGeografico === "FUERA_DEL_RANGO" ? estilos.geografiaAlerta : estilos.detalle}>
    <b>Ubicación: {ETIQUETAS_GEOGRAFIA[item.estadoGeografico]}</b>
    {item.distanciaM != null ? ` · ${metros(item.distanciaM)} del destino · rango ${metros(item.radioM)}` : ""}
  </p>;
}

function Configuracion({ config }: { config: ConfigEvidencias }) {
  const [modo, setModo] = useState(config.modo);
  const [minimo, setMinimo] = useState(config.minimo_muestra_score); const [maximo, setMaximo] = useState(config.maximo_por_corrida);
  const [radio, setRadio] = useState(config.radio_geografico_m ?? 300);
  const [mensaje, setMensaje] = useState(""); const [pendiente, iniciar] = useTransition();
  return <section className={estilos.card}><h2>Configuración</h2><p>Activá alertas y score solo después de validar falsos positivos en observación.</p><div className={estilos.form}>
    <label>Modo<select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}><option value="OBSERVACION">Observación</option><option value="ACTIVO">Activo</option></select></label>
    <label>Muestra mínima del score<input type="number" min="1" max="10000" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} /></label>
    <label>Máximo por corrida<input type="number" min="1" max="100" value={maximo} onChange={(e) => setMaximo(Number(e.target.value))} /></label>
    <label>Rango geográfico (metros)<input type="number" min="50" max="5000" value={radio} onChange={(e) => setRadio(Number(e.target.value))} /></label>
    <button disabled={pendiente || config.radio_geografico_m == null} onClick={() => iniciar(async () => { const r = await actualizarConfiguracionEvidencias({ modo, minimo, maximo, radio }); setMensaje(r.ok ? "Configuración guardada." : r.error); })}>Guardar configuración</button>{mensaje ? <span>{mensaje}</span> : null}
  </div></section>;
}
