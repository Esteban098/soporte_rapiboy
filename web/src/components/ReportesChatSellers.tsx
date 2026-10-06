"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReporteChats } from "@/lib/chat-sellers";
import estilos from "./chat-admin.module.css";

function duracion(segundos: number | null): string {
  if (segundos == null || !Number.isFinite(segundos)) return "—";
  if (segundos < 60) return `${Math.round(segundos)} s`;
  if (segundos < 3600) return `${Math.floor(segundos / 60)} min ${Math.round(segundos % 60)} s`;
  const horas = Math.floor(segundos / 3600);
  return `${horas} h ${Math.round((segundos % 3600) / 60)} min`;
}

export function ReportesChatSellers({ reporte }: { reporte: ReporteChats }) {
  const horas = reporte.horas.map((fila) => ({ ...fila, etiqueta: `${String(fila.hora).padStart(2, "0")}:00` }));
  const kpis = [
    ["Chats creados", reporte.creados],
    ["Chats cerrados", reporte.cerrados],
    ["Asignados", reporte.asignados],
    ["Con respuesta", reporte.conRespuesta],
    ["Sin respuesta", reporte.sinRespuesta],
  ] as const;
  const tiempos = [
    ["Primera respuesta", reporte.primeraRespuestaSegundos],
    ["Resolución", reporte.resolucionSegundos],
    ["Respuesta del bot", reporte.botSegundos],
    ["Atención humana", reporte.atencionHumanaSegundos],
  ] as const;
  return <>
    <div className={estilos.reporteAcciones}>
      <button type="button" onClick={() => {
        const filas = ["hora,chats_creados,chats_cerrados,contactos_nuevos", ...horas.map((fila) => `${fila.etiqueta},${fila.creados},${fila.cerrados},${fila.contactos}`)];
        const url = URL.createObjectURL(new Blob([filas.join("\n")], { type: "text/csv;charset=utf-8" }));
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = "reporte-chat-sellers.csv";
        enlace.click();
        URL.revokeObjectURL(url);
      }}>Exportar CSV</button>
    </div>
    <section className={estilos.kpis} aria-label="Resumen del período">
      {kpis.map(([etiqueta, valor]) => <article className={estilos.kpi} key={etiqueta}><span>{etiqueta}</span><strong>{valor.toLocaleString("es-AR")}</strong></article>)}
    </section>
    <section className={estilos.tiempos} aria-label="Tiempos promedio">
      {tiempos.map(([etiqueta, valor]) => <article className={estilos.tiempo} key={etiqueta}><span>{etiqueta}</span><strong>{duracion(valor)}</strong></article>)}
    </section>
    <section className={estilos.graficos}>
      <Grafico titulo="Chats creados y contactos nuevos" datos={horas} lineas={[{ clave: "creados", nombre: "Chats", color: "var(--chart-primary)" }, { clave: "contactos", nombre: "Contactos", color: "var(--chart-secondary)" }]} />
      <Grafico titulo="Chats cerrados" datos={horas} lineas={[{ clave: "cerrados", nombre: "Cerrados", color: "var(--chart-tertiary)" }]} />
    </section>
  </>;
}

function Grafico({ titulo, datos, lineas }: {
  titulo: string;
  datos: (ReporteChats["horas"][number] & { etiqueta: string })[];
  lineas: { clave: "creados" | "cerrados" | "contactos"; nombre: string; color: string }[];
}) {
  return <article className={estilos.grafico}>
    <h2>{titulo}</h2>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={datos} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="etiqueta" interval={3} tick={{ fill: "var(--ink-2)", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "var(--ink-2)", fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 10 }} />
        <Legend />
        {lineas.map((linea) => <Line key={linea.clave} type="monotone" dataKey={linea.clave} name={linea.nombre} stroke={linea.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />)}
      </LineChart>
    </ResponsiveContainer>
  </article>;
}
