"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { agruparDevoluciones, duracionDevolucion, resumenDevoluciones, devolucionesPorDia } from "@/lib/devoluciones-metricas";
import { numero, porcentaje } from "@/lib/formato";
import { Card, Kpi } from "./Card";
import { Tabla, type Columna, type Fila, type Filtro } from "./Tabla";
import { useVista } from "./useVista";
import { CajaTooltip, Leyenda } from "./charts/Tooltip";
import { ArcoDistribucion } from "./charts/ArcoDistribucion";
import estilos from "./ui.module.css";
import controles from "./tabla.module.css";
import grafico from "./charts/chart.module.css";

const colores = ["var(--chart-primary)", "var(--chart-secondary)", "var(--chart-tertiary)"];
const dimensiones = [
  { clave: "estado", etiqueta: "Estado" },
  { clave: "repartidor", etiqueta: "Repartidor" },
  { clave: "tienda", etiqueta: "Seller" },
  { clave: "poligono", etiqueta: "Polígono" },
  { clave: "mes", etiqueta: "Mes" },
];

export function MetricasDevoluciones({ filas, columnas, filtros }: { filas: Fila[]; columnas: Columna[]; filtros: Filtro[] }) {
  const id = "devoluciones-mensuales";
  const { filtradas } = useVista({ id, filas, columnas, filtros });
  const [dimension, setDimension] = useState("estado");
  const [medida, setMedida] = useState("tiempo");
  const resumen = resumenDevoluciones(filtradas);
  const porDia = devolucionesPorDia(filtradas);
  const grupos = agruparDevoluciones(filtradas, dimension);
  const colorGrupo = (nombre: string) => colores[Math.max(0, grupos.findIndex((grupo) => grupo.nombre === nombre)) % colores.length];
  const torta = grupos.length <= 7 ? grupos.map((grupo) => ({ nombre: grupo.nombre, valor: grupo.registros })) : [
    ...grupos.slice(0, 6).map((grupo) => ({ nombre: grupo.nombre, valor: grupo.registros })),
    { nombre: "Otros", valor: grupos.slice(6).reduce((total, grupo) => total + grupo.registros, 0) },
  ];
  const barras = grupos.map((grupo) => ({
    ...grupo,
    valor: medida === "tiempo" ? grupo.promedio : medida === "pendientes" ? grupo.pendientes : grupo.registros,
  })).filter((grupo) => grupo.valor != null)
    .sort((a, b) => b.valor! - a.valor!).slice(0, 10);

  return <>
    <div className={estilos.kpis}>
      <Kpi etiqueta="Paquetes únicos" valor={numero(resumen.paquetes)} nota={`${numero(resumen.registros)} registros mensuales`} />
      <Kpi etiqueta="Devueltos actuales" valor={numero(resumen.devueltos)} tono="good" nota="Registros del período" />
      <Kpi etiqueta="Pendientes" valor={numero(resumen.pendientes)} tono="warning" nota={`${numero(resumen.demoradas)} con más de 3 días laborales · excluye Entregados`} />
      <Kpi etiqueta="Tiempo promedio" valor={duracionDevolucion(resumen.promedio)} nota={`Sin domingos · ${numero(resumen.cerradas)} registros con fecha`} />
      <Kpi etiqueta="Devueltos en 72 h" valor={resumen.cerradas ? porcentaje(resumen.dentro72 / resumen.cerradas * 100) : "—"} nota="3 días laborales · excluye domingos" />
    </div>
    {resumen.devueltosSinFecha > 0 ? <p className={estilos.cardNote}>
      {numero(resumen.devueltosSinFecha)} paquetes figuran Devuelto sin fecha de cierre. Actualizá el período después de habilitar la migración 40; no se incluyen como cero en los tiempos.
    </p> : null}
    <Card titulo="Distribución y tiempos" nota="Primera entrada del mes → primer Devuelto posterior, descontando domingos de México. Responde a los filtros de la tabla.">
      <div className={controles.filtros}>
        <label className={controles.filtro}><span className={controles.filtroEtiqueta}>Agrupar por</span>
          <select className={controles.select} value={dimension} onChange={(evento) => setDimension(evento.target.value)}>
            {dimensiones.map((opcion) => <option key={opcion.clave} value={opcion.clave}>{opcion.etiqueta}</option>)}
          </select>
        </label>
        <label className={controles.filtro}><span className={controles.filtroEtiqueta}>Barras</span>
          <select className={controles.select} value={medida} onChange={(evento) => setMedida(evento.target.value)}>
            <option value="cantidad">Cantidad de paquetes</option>
            <option value="pendientes">Pendientes</option>
            <option value="tiempo">Tiempo promedio (horas laborales)</option>
          </select>
        </label>
      </div>
      <div className={estilos.dashboardDos}>
        <div>
          {torta.length ? <>
            <ArcoDistribucion total={resumen.registros} unidad="registros" etiquetaCantidad="Registros" datos={torta.map((grupo) => ({ ...grupo, color: colorGrupo(grupo.nombre) }))} />
            <Leyenda series={torta.map((grupo) => ({ nombre: grupo.nombre, color: colorGrupo(grupo.nombre) }))} />
          </> : <p className={grafico.vacio}>No hay datos con estos filtros.</p>}
        </div>
        <div>
          {barras.length ? <ResponsiveContainer width="100%" height={Math.max(245, barras.length * 32 + 35)}>
            <BarChart data={barras} layout="vertical" margin={{ top: 8, right: 18, bottom: 5, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--grid)" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickFormatter={(valor) => medida === "tiempo" ? `${valor} h` : String(valor)} />
              <YAxis type="category" dataKey="nombre" width={135} axisLine={false} tickLine={false} tick={{ fill: "var(--ink-2)", fontSize: 11 }} />
              <Bar dataKey="valor" radius={[0, 9, 9, 0]} maxBarSize={23}>
                {barras.map((grupo) => <Cell key={grupo.nombre} fill={colorGrupo(grupo.nombre)} />)}
              </Bar>
              <Tooltip cursor={{ fill: "var(--accent-soft)" }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const grupo = payload[0].payload;
                return <CajaTooltip titulo={grupo.nombre} lineas={[
                  { etiqueta: medida === "tiempo" ? "Promedio" : "Cantidad", valor: medida === "tiempo" ? duracionDevolucion(grupo.valor) : numero(grupo.valor) },
                  { etiqueta: "Con tiempo medido", valor: numero(grupo.cerradas) },
                ]} />;
              }} />
            </BarChart>
          </ResponsiveContainer> : <p className={grafico.vacio}>No hay fechas suficientes para medir este tiempo.</p>}
          <p className={estilos.cardNote}>Hasta 10 grupos. Los tiempos excluyen fechas faltantes o anteriores al procesamiento.</p>
        </div>
      </div>
    </Card>
    <div className={estilos.dashboardDos}>
      <Card titulo="Devueltos por día de la semana" nota="Lunes a sábado, según la fecha real de Devuelto en México. Cada paquete se cuenta una vez por fecha.">
        {porDia.fechas.length ? <ResponsiveContainer width="100%" height={245}>
          <BarChart data={porDia.semana} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="nombre" tickFormatter={(nombre) => String(nombre).slice(0, 3)} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <Bar dataKey="cantidad" radius={[9, 9, 0, 0]} maxBarSize={32}>
              {porDia.semana.map((dia, indice) => <Cell key={dia.nombre} fill={colores[indice % colores.length]} />)}
            </Bar>
            <Tooltip cursor={{ fill: "var(--accent-soft)" }} content={({ active, payload }) => active && payload?.length ? <CajaTooltip titulo={payload[0].payload.nombre}
              lineas={[{ etiqueta: "Paquetes devueltos", valor: numero(payload[0].payload.cantidad) }]} /> : null} />
          </BarChart>
        </ResponsiveContainer> : <p className={grafico.vacio}>No hay cierres laborales con fecha registrada.</p>}
        {porDia.domingos > 0 ? <p className={estilos.cardNote}>{numero(porDia.domingos)} cierres en domingo excluidos de esta gráfica.</p> : null}
      </Card>
      <Card titulo="Fechas con más devoluciones" nota="Ranking de días laborales con más cierres, sobre los paquetes del período y los filtros actuales.">
        <Tabla id="devoluciones-ranking-fechas" columnas={[
          { clave: "dia", titulo: "Fecha (México)" }, { clave: "cantidad", titulo: "Devueltos", tipo: "numero" },
        ]} filas={porDia.fechas} ordenInicial={{ clave: "cantidad", asc: false }} vacio="No hay cierres laborales registrados." />
      </Card>
    </div>
    <Card titulo="Paquetes" nota="El mes corresponde al movimiento de devolución. Cada paquete aparece una vez por mes.">
      <Tabla id={id} columnas={columnas} filtros={filtros} filas={filas} ordenInicial={{ clave: "id", asc: false }}
        vacio="No hay devoluciones cargadas para este período." />
    </Card>
  </>;
}
