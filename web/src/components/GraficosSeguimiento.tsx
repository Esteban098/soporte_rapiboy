"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { etapaDe, nombreDePersona, type Seguimiento } from "@/lib/seguimiento";
import { numero } from "@/lib/formato";
import { CajaTooltip } from "./charts/Tooltip";
import estilos from "./seguimiento-graficos.module.css";

const COLORES_ETAPA = {
  abierto: "var(--critical)",
  tomado: "var(--chart-primary)",
  cerrado: "var(--chart-secondary)",
} as const;

type Grupo = { nombre: string; casos: number };

function agruparCierres(reportes: Seguimiento[], campo: "seller" | "driver" | "atendidoPor"): Grupo[] {
  const conteo = new Map<string, number>();
  for (const reporte of reportes) {
    if (reporte.estado !== "cerrado") continue;
    const valor = campo === "atendidoPor"
      ? nombreDePersona(reporte.atendidoPor)
      : campo === "seller"
        ? reporte.seller?.trim() || "Sin tienda"
        : reporte.driver?.trim() || "Sin driver";
    conteo.set(valor, (conteo.get(valor) ?? 0) + 1);
  }
  return [...conteo].map(([nombre, casos]) => ({ nombre, casos }))
    .sort((a, b) => b.casos - a.casos || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 6);
}

/** Resumen visual de la cola visible: los cierres se miden por su responsable real. */
export function GraficosSeguimiento({ reportes }: { reportes: Seguimiento[] }) {
  const etapas = ["abierto", "tomado", "cerrado"] as const;
  const distribucion = etapas.map((etapa) => ({
    etapa,
    etiqueta: etapa === "abierto" ? "Sin tomar" : etapa[0].toUpperCase() + etapa.slice(1),
    casos: reportes.filter((reporte) => etapaDe(reporte) === etapa).length,
  })).filter((item) => item.casos > 0);
  const cerrados = reportes.filter((reporte) => reporte.estado === "cerrado").length;
  const porTienda = agruparCierres(reportes, "seller");
  const porUsuario = agruparCierres(reportes, "atendidoPor");
  const porDriver = agruparCierres(reportes, "driver");

  return (
    <section className={estilos.panel} aria-label="Estadísticas de seguimiento">
      <div className={estilos.encabezado}>
        <div>
          <h2>Estadísticas de seguimiento</h2>
          <p>La distribución y los cierres responden a los filtros activos.</p>
        </div>
        <strong>{numero(cerrados)} cerrados</strong>
      </div>
      <div className={estilos.grilla}>
        <article className={estilos.grafico}>
          <h3>Estado de los casos</h3>
          {distribucion.length ? (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const dato = payload[0].payload as { etiqueta: string; casos: number };
                  return <CajaTooltip titulo={dato.etiqueta} lineas={[{ etiqueta: "Casos", valor: numero(dato.casos) }]} />;
                }} />
                <Pie data={distribucion} dataKey="casos" nameKey="etiqueta" cx="50%" cy="50%" innerRadius={60} outerRadius={83} paddingAngle={4} cornerRadius={9} stroke="none">
                  {distribucion.map((dato) => <Cell key={dato.etapa} fill={COLORES_ETAPA[dato.etapa]} />)}
                </Pie>
                <text x="50%" y="47%" textAnchor="middle" className={estilos.anilloValor}>{numero(reportes.length)}</text>
                <text x="50%" y="59%" textAnchor="middle" className={estilos.anilloEtiqueta}>casos</text>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className={estilos.vacio}>No hay casos con este filtro.</p>}
        </article>
        <GraficoBarras titulo="Cerrados por tienda" datos={porTienda} color="var(--chart-secondary)" />
        <GraficoBarras titulo="Cerrados por usuario" datos={porUsuario} color="var(--chart-primary)" />
        <GraficoBarras titulo="Cerrados por driver" datos={porDriver} color="var(--chart-tertiary)" />
      </div>
    </section>
  );
}

function GraficoBarras({ titulo, datos, color }: { titulo: string; datos: Grupo[]; color: string }) {
  return (
    <article className={estilos.grafico}>
      <h3>{titulo}</h3>
      {datos.length ? (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={datos} layout="vertical" margin={{ top: 3, right: 14, bottom: 3, left: 4 }} barCategoryGap="30%">
            <CartesianGrid stroke="var(--grid)" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="nombre" width={105} tick={{ fill: "var(--muted)", fontSize: 10.5, fontFamily: "var(--sans)" }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--accent-soft)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const dato = payload[0].payload as Grupo;
              return <CajaTooltip titulo={dato.nombre} lineas={[{ etiqueta: "Cerrados", valor: numero(dato.casos) }]} />;
            }} />
            <Bar dataKey="casos" fill={color} radius={[0, 9, 9, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : <p className={estilos.vacio}>Todavía no hay cierres para agrupar.</p>}
    </article>
  );
}
