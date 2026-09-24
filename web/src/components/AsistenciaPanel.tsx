"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarAsistencia } from "@/app/asistencia";
import type { DriverAsistencia, VotoAsistencia } from "@/lib/asistencia-datos";
import { diaCorto, diaLargo, numero, porcentaje } from "@/lib/formato";
import { Card, Kpi } from "./Card";
import { Tabla, type Columna, type Fila } from "./Tabla";
import { GraficoDinamico } from "./charts/GraficoDinamico";
import estilos from "./ui.module.css";
import tabla from "./tabla.module.css";

const ID_HOY = "asistencia-hoy";
const ID_HISTORIAL = "asistencia-historial";

const COLUMNAS_HOY: Columna[] = [
  { clave: "id", titulo: "IdMotoboy", tipo: "numero" },
  { clave: "driver", titulo: "Repartidor", tipo: "texto" },
  { clave: "respuesta", titulo: "Voto", tipo: "texto" },
  { clave: "origen", titulo: "Origen", tipo: "texto" },
  { clave: "votado", titulo: "Respondió", tipo: "texto" },
];

const COLUMNAS_HISTORIAL: Columna[] = [
  { clave: "fecha", titulo: "Jornada", tipo: "texto" },
  { clave: "driver", titulo: "Repartidor", tipo: "texto" },
  { clave: "respuesta", titulo: "Voto", tipo: "texto" },
  { clave: "origen", titulo: "Origen", tipo: "texto" },
];

function respuestaVisible(respuesta: string | null): string {
  return respuesta === "RUTA_Y_COLECTA" ? "Ruta y colecta" : respuesta === "RUTA" ? "Ruta" : respuesta === "NO_ASISTE" ? "No asiste" : "No votó";
}

/** Vista interactiva: la base y las claves se quedan del lado del servidor. */
export function AsistenciaPanel({
  hoy,
  votos,
  drivers,
}: {
  hoy: string;
  votos: VotoAsistencia[];
  drivers: DriverAsistencia[];
}) {
  const router = useRouter();
  const [desde, setDesde] = useState(restarDias(hoy, 29));
  const [hasta, setHasta] = useState(hoy);
  const [driver, setDriver] = useState("");
  const [respuesta, setRespuesta] = useState<"RUTA_Y_COLECTA" | "RUTA" | "NO_ASISTE">("RUTA_Y_COLECTA");
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const porId = useMemo(() => new Map(drivers.map((d) => [d.idMotoboy, d])), [drivers]);
  const votosHoy = useMemo(() => new Map(votos.filter((v) => v.fechaOperacion === hoy).map((v) => [v.idMotoboy, v])), [votos, hoy]);
  const filasHoy = useMemo<Fila[]>(() => drivers.map((d) => {
    const voto = votosHoy.get(d.idMotoboy);
    return {
      id: d.idMotoboy,
      driver: d.nombre,
      respuesta: respuestaVisible(voto?.respuesta ?? null),
      origen: voto?.origen === "MANUAL" ? "Carga manual" : voto ? "Encuesta" : "—",
      votado: voto?.votadoEn ? new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" }).format(new Date(voto.votadoEn)) : "—",
    };
  }), [drivers, votosHoy]);
  const historiales = useMemo<Fila[]>(() => votos
    .filter((v) => v.fechaOperacion >= desde && v.fechaOperacion <= hasta)
    .map((v) => ({
      id: `${v.fechaOperacion}-${v.idMotoboy}`,
      fecha: diaCorto(v.fechaOperacion),
      driver: porId.get(v.idMotoboy)?.nombre ?? `Motoboy ${v.idMotoboy}`,
      respuesta: respuestaVisible(v.respuesta),
      origen: v.origen === "MANUAL" ? "Carga manual" : "Encuesta",
    })), [votos, desde, hasta, porId]);
  // Incluye una base por repartidor para que el gráfico de menor asistencia
  // también muestre correctamente a quien todavía no confirmó ningún "Sí".
  const filasGrafico = useMemo<Fila[]>(() => [
    ...historiales,
    ...drivers.map((d) => ({
      id: `base-${d.idMotoboy}`,
      fecha: "",
      driver: d.nombre,
      respuesta: "Sin registro",
      origen: "—",
    })),
  ], [historiales, drivers]);
  const rutaYColecta = [...votosHoy.values()].filter((v) => v.respuesta === "RUTA_Y_COLECTA").length;
  const ruta = [...votosHoy.values()].filter((v) => v.respuesta === "RUTA").length;
  const noAsisten = [...votosHoy.values()].filter((v) => v.respuesta === "NO_ASISTE").length;
  const respondieron = rutaYColecta + ruta + noAsisten;

  function registrar() {
    if (!driver) return setMensaje("Elegí un repartidor.");
    iniciar(async () => {
      const resultado = await guardarAsistencia(Number(driver), respuesta, hoy);
      setMensaje(resultado.ok ? "Voto guardado." : resultado.error);
      if (resultado.ok) router.refresh();
    });
  }

  return (
    <section className={estilos.stack} aria-label="Asistencia de repartidores">
      <div className={estilos.kpis}>
        <Kpi etiqueta="Ruta y colecta" valor={numero(rutaYColecta)} nota={`de ${numero(drivers.length)} repartidores activos`} tono="good" />
        <Kpi etiqueta="Solo ruta" valor={numero(ruta)} nota="voto confirmado" />
        <Kpi etiqueta="No asisten" valor={numero(noAsisten)} nota="voto confirmado" tono={noAsisten ? "warning" : "neutral"} />
        <Kpi etiqueta="Respondieron" valor={numero(respondieron)} nota={drivers.length ? porcentaje((respondieron * 100) / drivers.length) : "sin directorio"} />
        <Kpi etiqueta="Sin respuesta" valor={numero(Math.max(0, drivers.length - respondieron))} nota="no equivale a ausencia" tono="warning" />
      </div>

      <Card titulo="Registrar o corregir un voto" nota="La carga manual reemplaza el voto de este repartidor para la jornada, con tu usuario registrado en Supabase.">
        <div className={tabla.filtros}>
          <label className={tabla.filtro}><span className={tabla.filtroEtiqueta}>Repartidor</span>
            <select className={tabla.select} value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">Elegir…</option>
              {drivers.map((d) => <option key={d.idMotoboy} value={d.idMotoboy}>{d.nombre} · {d.idMotoboy}</option>)}
            </select>
          </label>
          <label className={tabla.filtro}><span className={tabla.filtroEtiqueta}>Voto</span>
            <select className={tabla.select} value={respuesta} onChange={(e) => setRespuesta(e.target.value as "RUTA_Y_COLECTA" | "RUTA" | "NO_ASISTE")}>
              <option value="RUTA_Y_COLECTA">Ruta y colecta</option><option value="RUTA">Ruta</option><option value="NO_ASISTE">No asiste</option>
            </select>
          </label>
          <button type="button" className={tabla.masFilas} onClick={registrar} disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar voto"}</button>
          {mensaje ? <span className={tabla.conteo} role="status">{mensaje}</span> : null}
        </div>
      </Card>

      <Card titulo={`Asistencia de hoy · ${diaLargo(hoy)}`} nota="Cada fila es un repartidor activo. La falta de respuesta queda explícita para no convertir silencio en una ausencia.">
        <Tabla id={ID_HOY} titulo="Asistencia de hoy" columnas={COLUMNAS_HOY} filas={filasHoy} filtros={[{ clave: "respuesta", etiqueta: "Voto" }]} ordenInicial={{ clave: "driver", asc: true }} vacio="No hay repartidores activos en el directorio." />
      </Card>

      <Card titulo="Historial y tendencia" nota="Elegí el período para comparar los votos confirmados. Los gráficos cuentan únicamente “Sí, asiste”; no infieren asistencia desde una colecta.">
        <div className={tabla.filtros}>
          <label className={tabla.filtro}><span className={tabla.filtroEtiqueta}>Desde</span><input className={tabla.select} type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className={tabla.filtro}><span className={tabla.filtroEtiqueta}>Hasta</span><input className={tabla.select} type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
        <div className={estilos.stack}>
          <GraficoDinamico id={ID_HISTORIAL} filas={filasGrafico} columnas={COLUMNAS_HISTORIAL} filtros={[{ clave: "respuesta", etiqueta: "Voto" }]} titulo="Historial de asistencia" tope={10} dimensiones={[{ clave: "driver", etiqueta: "Repartidor" }]} medidas={[{ clave: "asistencias", etiqueta: "Veces que trabajó", vale: (fila) => ["Ruta y colecta", "Ruta"].includes(String(fila.respuesta)) ? 1 : 0 }]} />
          <GraficoDinamico id={`${ID_HISTORIAL}-menos`} filas={filasGrafico} columnas={COLUMNAS_HISTORIAL} filtros={[{ clave: "respuesta", etiqueta: "Voto" }]} titulo="Historial de asistencia" tope={10} orden="menor" dimensiones={[{ clave: "driver", etiqueta: "Repartidor" }]} medidas={[{ clave: "asistencias", etiqueta: "Menos jornadas trabajadas", vale: (fila) => ["Ruta y colecta", "Ruta"].includes(String(fila.respuesta)) ? 1 : 0 }]} />
          <Tabla id={ID_HISTORIAL} titulo="Historial de asistencia" columnas={COLUMNAS_HISTORIAL} filas={historiales} filtros={[{ clave: "respuesta", etiqueta: "Voto" }, { clave: "driver", etiqueta: "Repartidor" }]} ordenInicial={{ clave: "fecha", asc: false }} vacio="No hay votos registrados en el período elegido." />
        </div>
      </Card>
    </section>
  );
}

function restarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}
