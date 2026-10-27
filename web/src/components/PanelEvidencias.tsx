"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { actualizarConfiguracionEvidencias, reabrirEvidencia, revisarEvidencia } from "@/app/evidencias";
import type { DecisionEvidencia, EvidenciaPanel, ScoreDriver } from "@/lib/evidencias";
import { ETIQUETA_HORA_PLATAFORMA, ZONA_PLATAFORMA } from "@/lib/zona-horaria";
import { ETIQUETAS_GEOGRAFIA } from "@/lib/evidencias-geografia";
import { enlaceViaje } from "@/lib/enlaces";
import { TablaOrdenable } from "./TablaOrdenable";
import { MapaEvidencia } from "./MapaEvidencia";
import estilos from "./evidencias.module.css";

type ConfigEvidencias = { modo: "OBSERVACION" | "ACTIVO"; minimo_muestra_score: number; maximo_por_corrida: number; radio_geografico_m?: number };
type Vista = "pendientes" | "coordenadas" | "revisadas" | "drivers";
type Filtro = "todos" | "visual" | "geografico" | "ambas";
const problemaVisual = (p: EvidenciaPanel) => p.calidadVisual === "DUDOSA";
const problemaGeo = (p: EvidenciaPanel) => p.estadoGeografico === "FUERA_DEL_RANGO";

export function PanelEvidencias({ pendientesHoy, pendientesAnteriores, revisadasRecientes, geografiaReciente, scores, config, admin }: {
  pendientesHoy: EvidenciaPanel[]; pendientesAnteriores: EvidenciaPanel[]; scores: ScoreDriver[];
  revisadasRecientes: EvidenciaPanel[]; geografiaReciente: EvidenciaPanel[];
  config: ConfigEvidencias; admin: boolean;
}) {
  const [vista, setVista] = useState<Vista>("pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [anteriores, setAnteriores] = useState(false);
  const [limite, setLimite] = useState(10);
  const [detalleMapa, setDetalleMapa] = useState<EvidenciaPanel | null>(null);
  const coincide = (item: EvidenciaPanel) => {
    const texto = busqueda.trim().toLocaleLowerCase("es");
    if (texto && ![item.idViaje, item.driver, item.domicilio, item.estadoEvento, item.motivo].some((v) => String(v ?? "").toLocaleLowerCase("es").includes(texto))) return false;
    return filtro === "todos" || (filtro === "visual" && problemaVisual(item)) ||
      (filtro === "geografico" && problemaGeo(item)) || (filtro === "ambas" && problemaVisual(item) && problemaGeo(item));
  };
  const pendientes = (anteriores ? [...pendientesHoy, ...pendientesAnteriores] : pendientesHoy).filter(coincide);
  const coordenadas = geografiaReciente.filter(coincide);
  const revisadas = revisadasRecientes.filter(coincide);
  const drivers = scores.filter((s) => (s.driver + " " + s.idMotoboy).toLowerCase().includes(busqueda.trim().toLowerCase()));
  const tabs: { id: Vista; nombre: string; cantidad: number }[] = [
    { id: "pendientes", nombre: "Pendientes", cantidad: pendientes.length },
    { id: "coordenadas", nombre: "Coordenadas", cantidad: coordenadas.length },
    { id: "revisadas", nombre: "Revisadas", cantidad: revisadas.length },
    { id: "drivers", nombre: "Drivers", cantidad: drivers.length },
  ];
  return <div className={estilos.stack}>
    <section className={estilos.card}>
      <div className={estilos.head}><div><h2>Centro de revisión</h2><p>Foto y ubicación, juntas para decidir. Una alerta no demuestra una entrega incorrecta.</p></div><span className={config.modo === "OBSERVACION" ? estilos.observacion : estilos.activo}>{config.modo === "OBSERVACION" ? "Observación" : "Activo"} · rango {config.radio_geografico_m ?? 2000} m</span></div>
      <div className={estilos.pestanas} role="tablist" aria-label="Revisión de evidencias">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" id={"tab-" + tab.id} aria-selected={vista === tab.id} aria-controls={"panel-" + tab.id} onClick={() => { setVista(tab.id); setLimite(10); }}>{tab.nombre}<span>{tab.cantidad}</span></button>)}
      </div>
      <div className={estilos.filtros}>
        <label className={estilos.buscador}>Buscar<input type="search" placeholder="ID, driver, domicilio o estado…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label>
        {vista !== "drivers" ? <label>Tipo de alerta<select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}><option value="todos">Todas</option><option value="visual">Calidad de foto</option><option value="geografico">Fuera de rango</option><option value="ambas">Foto y ubicación</option></select></label> : null}
        {vista === "pendientes" ? <label className={estilos.check}><input type="checkbox" checked={anteriores} onChange={(e) => setAnteriores(e.target.checked)} />Incluir anteriores ({pendientesAnteriores.length})</label> : null}
        {busqueda || filtro !== "todos" ? <button type="button" className={estilos.limpiar} onClick={() => { setBusqueda(""); setFiltro("todos"); }}>Limpiar filtros</button> : null}
      </div>
    </section>
    <section className={estilos.card} role="tabpanel" id={"panel-" + vista} aria-labelledby={"tab-" + vista}>
      {vista === "pendientes" ? <>
        <div className={estilos.head}><div><h2>Revisión pendiente · {anteriores ? "hoy y anteriores" : "hoy"}</h2><p>Revisá la foto, el domicilio y la distancia antes de decidir.</p></div><span className={estilos.contador}>{pendientes.length} por revisar</span></div>
        {pendientes.length ? <div className={estilos.grilla}>{pendientes.slice(0, limite).map((item) => <Caso key={item.id} item={item} onMapa={setDetalleMapa} />)}</div> : <Vacio texto="No hay evidencias pendientes con estos filtros." />}
        {pendientes.length > limite ? <button className={estilos.limpiar} onClick={() => setLimite((n) => n + 10)}>Ver 10 más · {limite} de {pendientes.length}</button> : null}
      </> : vista === "coordenadas" ? <>
        <div className={estilos.head}><div><h2>Validación geográfica</h2><p>Últimas 50 procesadas. Entregas y visitas no entregadas; se omiten IDs con datos de tienda.</p></div><span className={estilos.contador}>{coordenadas.length} resultados</span></div>
        <div className={estilos.tablaWrap}><TablaOrdenable filas={coordenadas} claveFila={(item) => item.id} columnas={[
          { clave: "viaje", titulo: "Viaje", valor: (item) => item.idViaje, render: (item) => <LinkViaje id={item.idViaje} /> },
          { clave: "driver", titulo: "Driver", valor: (item) => item.driver },
          { clave: "domicilio", titulo: "Domicilio", valor: (item) => item.domicilio, render: (item) => <span className={estilos.domicilioTabla}>{item.domicilio || "No informado"}{item.domicilioActual ? <small className={estilos.fuenteDomicilio}>Referencia actual del tracker</small> : null}</span> },
          { clave: "estado", titulo: "Estado del evento", valor: (item) => item.estadoEvento, render: (item) => <>{item.estadoEvento || "No informado"}{item.visitadoEvento ? <small> · Visitado</small> : null}</> },
          { clave: "resultado", titulo: "Resultado", valor: (item) => ETIQUETAS_GEOGRAFIA[item.estadoGeografico], render: (item) => puedeMostrarMapa(item) ? <button type="button" className={estilos.verMapa} onClick={() => setDetalleMapa(item)}>{ETIQUETAS_GEOGRAFIA[item.estadoGeografico]} · ver mapa</button> : <span className={problemaGeo(item) ? estilos.observacion : estilos.detalle}>{ETIQUETAS_GEOGRAFIA[item.estadoGeografico]}</span> },
          { clave: "distancia", titulo: "Distancia", valor: (item) => item.distanciaM, render: (item) => metros(item.distanciaM) },
          { clave: "radio", titulo: "Rango", valor: (item) => item.radioM, render: (item) => metros(item.radioM) },
          { clave: "foto", titulo: "Evidencia", valor: (item) => Boolean(item.fotoUrl), render: (item) => item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer">Ver foto ↗</a> : "—" },
        ]} /></div>
        {!coordenadas.length ? <Vacio texto="No hay resultados para esta búsqueda." /> : null}
        <details className={estilos.ayuda}><summary>Cómo se interpreta la ubicación</summary><p>Se usa el GPS del mismo evento de la foto, no la posición actual del driver. Entregado cuenta como visita; las no entregadas requieren VisitadoMotoboy del evento. Sin GPS no se presume una entrega incorrecta. Ubicación o teléfono cargados en Mensual o Histórico omiten la comparación. Las filas antiguas pueden no tener domicilio ni evaluación; no se inventan esos datos.</p></details>
      </> : vista === "revisadas" ? <>
        <div className={estilos.head}><div><h2>Revisadas recientemente</h2><p>Últimas 50 decisiones con retención vigente. Reabrir conserva la auditoría.</p></div><span className={estilos.contador}>{revisadas.length} revisadas</span></div>
        {revisadas.length ? <div className={estilos.grilla}>{revisadas.slice(0, limite).map((item) => <Caso key={item.id} item={item} revisado onMapa={setDetalleMapa} />)}</div> : <Vacio texto="No hay revisiones para mostrar." />}
        {revisadas.length > limite ? <button className={estilos.limpiar} onClick={() => setLimite((n) => n + 10)}>Ver 10 más · {limite} de {revisadas.length}</button> : null}
      </> : <>
        <div className={estilos.head}><div><h2>Calidad por driver</h2><p>Últimos 30 días. Solo problemas confirmados afectan el score; sin sanciones automáticas.</p></div></div>
        <div className={estilos.tablaWrap}><TablaOrdenable filas={drivers} claveFila={(s) => s.idMotoboy} columnas={[
          { clave: "driver", titulo: "Driver", valor: (s) => s.driver },
          { clave: "total", titulo: "Analizadas", valor: (s) => s.total },
          { clave: "confirmadas", titulo: "Confirmadas", valor: (s) => s.confirmadas },
          { clave: "porcentaje", titulo: "% confirmado", valor: (s) => s.proporcionMalas, render: (s) => s.proporcionMalas.toFixed(1) + "%" },
          { clave: "score", titulo: "Score", valor: (s) => s.score, render: (s) => s.muestraSuficiente ? s.score?.toFixed(1) + " / 100" : "Muestra < " + s.minimo },
        ]} /></div>{!drivers.length ? <Vacio texto="Sin muestra activa para estos filtros." /> : null}
      </>}
    </section>
    {admin ? <details className={estilos.anterior}><summary>Configuración de la revisión</summary><Configuracion config={config} /></details> : null}
    {detalleMapa ? <DetalleGeografico item={detalleMapa} cerrar={() => setDetalleMapa(null)} /> : null}
  </div>;
}

function Vacio({ texto }: { texto: string }) { return <div className={estilos.vacio}><span aria-hidden="true">✓</span><p>{texto}</p></div>; }
function LinkViaje({ id }: { id: number }) { return <a className={estilos.linkViaje} href={enlaceViaje(id)} target="_blank" rel="noreferrer">#{id} ↗</a>; }
function fecha(valor: string) { return new Date(valor).toLocaleString("es-AR", { timeZone: ZONA_PLATAFORMA }) + " " + ETIQUETA_HORA_PLATAFORMA; }

function puedeMostrarMapa(item: EvidenciaPanel) { return problemaGeo(item) && Boolean(item.puntoEvento && item.puntoDestino); }

function Caso({ item, revisado = false, onMapa }: { item: EvidenciaPanel; revisado?: boolean; onMapa: (item: EvidenciaPanel) => void }) {
  const [comentario, setComentario] = useState(""); const [mensaje, setMensaje] = useState("");
  const [porConfirmar, setPorConfirmar] = useState<DecisionEvidencia | null>(null);
  const [pendiente, iniciar] = useTransition(); const router = useRouter();
  function decidir(decision: DecisionEvidencia) {
    iniciar(async () => { const r = await revisarEvidencia(item.id, decision, comentario); setMensaje(r.ok ? "Revisión guardada." : r.error); if (r.ok) router.refresh(); });
  }
  return <article className={estilos.caso} id={"revision-" + item.id}>
    <div className={estilos.casoHead}><div><LinkViaje id={item.idViaje} /><span className={estilos.driver}>{item.driver}</span></div><span className={estilos.detalle}>{fecha(item.evidenciaEn)}</span></div>
    <p className={estilos.domicilio}><span>Domicilio de destino{item.domicilioActual ? " · referencia actual del tracker" : ""}</span>{item.domicilio || "No informado en esta evidencia"}</p>
    <div className={estilos.casoContenido}>
      {item.fotoUrl ? <a className={estilos.preview} href={item.fotoUrl} target="_blank" rel="noreferrer"><Image src={item.fotoUrl} alt={"Evidencia del viaje " + item.idViaje} width={500} height={260} unoptimized /><span>Abrir foto ↗</span></a> : <div className={estilos.sinFoto}>Vista previa no disponible</div>}
      <div className={estilos.cuerpo}>
        {item.estadoEvento ? <p className={estilos.estadoEvento}>{item.estadoEvento}{item.visitadoEvento ? " · Visitado" : ""}</p> : null}
        <div className={estilos.senales}>
          <div className={problemaVisual(item) ? estilos.senalAlerta : estilos.senal}><span>Calidad de foto</span><strong>{problemaVisual(item) ? "Revisar foto" : item.calidadVisual === "ACEPTABLE" ? "Utilizable" : "Sin dato"}</strong><small>{item.confianza == null ? "Sin confianza informada" : Math.round(item.confianza * 100) + "% de confianza visual"}</small></div>
          <div className={problemaGeo(item) ? estilos.senalAlerta : estilos.senal}><span>Ubicación de la visita</span><strong>{ETIQUETAS_GEOGRAFIA[item.estadoGeografico]}</strong><small>{item.distanciaM == null ? "Sin distancia aplicable" : metros(item.distanciaM) + " del domicilio · rango " + metros(item.radioM)}</small>{puedeMostrarMapa(item) ? <button type="button" className={estilos.verMapa} onClick={() => onMapa(item)}>Ver mapa y evidencia</button> : null}</div>
        </div>
        <p className={estilos.detalle}>{item.motivo}</p>
        {revisado ? <><p className={estilos.decision}><b>{item.decision ? etiquetaDecision(item.decision) : "Revisada"}</b>{item.comentarioRevision ? " · " + item.comentarioRevision : ""}</p><p className={estilos.detalle}>{item.revisadaEn ? fecha(item.revisadaEn) : ""}{item.revisadaPor ? " · " + item.revisadaPor : ""}</p><div className={estilos.acciones}><button disabled={pendiente} onClick={() => iniciar(async () => { const r = await reabrirEvidencia(item.id); setMensaje(r.ok ? "Devuelta a pendientes." : r.error); if (r.ok) router.refresh(); })}>Volver a pendientes</button></div></> : <>
          <details className={estilos.ayuda}><summary>Agregar comentario</summary><textarea aria-label={"Comentario del viaje " + item.idViaje} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} placeholder="Comentario opcional" /></details>
          <div className={estilos.acciones}><button disabled={pendiente} onClick={() => setPorConfirmar("CONFIRMADA")}>Confirmar problema</button><button disabled={pendiente} onClick={() => setPorConfirmar("DESCARTADA")}>Descartar</button><button disabled={pendiente} onClick={() => setPorConfirmar("INCONCLUSA")}>Inconclusa</button></div>
          {porConfirmar ? <div className={estilos.confirmacion} role="alert"><span>¿Guardar como <strong>{etiquetaDecision(porConfirmar)}</strong>?</span><button disabled={pendiente} onClick={() => decidir(porConfirmar)}>Sí, guardar</button><button disabled={pendiente} onClick={() => setPorConfirmar(null)}>Cancelar</button></div> : null}
        </>}
        {mensaje ? <p className={estilos.mensaje} role="status">{mensaje}</p> : null}
      </div>
    </div>
  </article>;
}

function DetalleGeografico({ item, cerrar }: { item: EvidenciaPanel; cerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar]);
  if (!item.puntoEvento || !item.puntoDestino) return null;
  return <div className={estilos.modalFondo} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
    <section className={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-mapa-evidencia">
      <header className={estilos.modalHead}><div><span className={estilos.observacion}>Fuera del rango</span><h2 id="titulo-mapa-evidencia">Viaje #{item.idViaje}</h2><p>{item.driver} · {metros(item.distanciaM)} del domicilio · rango {metros(item.radioM)}</p></div><button type="button" onClick={cerrar} aria-label="Cerrar detalle">×</button></header>
      <MapaEvidencia evento={item.puntoEvento} destino={item.puntoDestino} />
      <div className={estilos.modalDatos}><div><span>Domicilio esperado</span><strong>{item.domicilio || "No informado"}</strong></div><div><span>Evento histórico</span><strong>{item.estadoEvento || "No informado"}{item.visitadoEvento ? " · Visitado" : ""}</strong></div></div>
      <section className={estilos.evidenciaDetalle}><div><span>Evidencia fotográfica</span><h3>Registro asociado al evento</h3></div>{item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer"><Image src={item.fotoUrl} alt={`Evidencia del viaje ${item.idViaje}`} width={1000} height={760} unoptimized /></a> : <div className={estilos.sinFoto}>Vista previa no disponible</div>}<p>{item.motivo}</p></section>
    </section>
  </div>;
}

function etiquetaDecision(decision: DecisionEvidencia): string {
  return ({ CONFIRMADA: "problema confirmado", DESCARTADA: "descartada", INCONCLUSA: "inconclusa" } as const)[decision];
}
function metros(valor: number | null) { return valor == null ? "—" : valor.toLocaleString("es-MX", { maximumFractionDigits: 1 }) + " m"; }

function Configuracion({ config }: { config: ConfigEvidencias }) {
  const [modo, setModo] = useState(config.modo);
  const [minimo, setMinimo] = useState(config.minimo_muestra_score); const [maximo, setMaximo] = useState(config.maximo_por_corrida);
  const [radio, setRadio] = useState(config.radio_geografico_m ?? 2000);
  const [mensaje, setMensaje] = useState(""); const [pendiente, iniciar] = useTransition();
  return <div className={estilos.configuracion}><p>Solo administradores. Validá falsos positivos antes de activar alertas y score.</p><div className={estilos.form}>
    <label>Modo<select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}><option value="OBSERVACION">Observación</option><option value="ACTIVO">Activo</option></select></label>
    <label>Muestra mínima del score<input type="number" min="1" max="10000" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} /></label>
    <label>Máximo por corrida<input type="number" min="1" max="100" value={maximo} onChange={(e) => setMaximo(Number(e.target.value))} /></label>
    <label>Rango geográfico (metros)<input type="number" min="50" max="5000" value={radio} onChange={(e) => setRadio(Number(e.target.value))} /></label>
    <button disabled={pendiente || config.radio_geografico_m == null} onClick={() => iniciar(async () => { const r = await actualizarConfiguracionEvidencias({ modo, minimo, maximo, radio }); setMensaje(r.ok ? "Configuración guardada." : r.error); })}>Guardar configuración</button>{mensaje ? <span role="status">{mensaje}</span> : null}
  </div></div>;
}
