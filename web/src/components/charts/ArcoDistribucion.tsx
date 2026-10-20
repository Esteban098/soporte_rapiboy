"use client";

import { useId } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { numero, porcentaje } from "@/lib/formato";
import { ValorMetrica } from "../ValorMetrica";
import { CajaTooltip } from "./Tooltip";
import estilos from "./arco-distribucion.module.css";

type Tramo = { nombre: string; valor: number; color: string };

/** Semicírculo de distribución: grosor de cada tramo = proporción real. */
export function ArcoDistribucion({ datos, total, unidad, etiquetaCantidad = "Casos" }: {
  datos: Tramo[];
  total: number;
  unidad: string;
  etiquetaCantidad?: string;
}) {
  const patron = useId().replace(/:/g, "");
  const suma = datos.reduce((acumulado, dato) => acumulado + dato.valor, 0);
  if (!suma) return null;

  return (
    <div className={estilos.marco} role="img" aria-label={`${numero(total)} ${unidad}. ${datos.map((dato) => `${dato.nombre}: ${numero(dato.valor)}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height={255}>
        <PieChart>
          <defs>
            <pattern id={patron} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(42)">
              <rect width="6" height="6" fill="var(--surface-2)" />
              <rect width="2" height="6" fill="var(--surface-3)" />
            </pattern>
          </defs>
          <Pie data={[{ valor: suma }]} dataKey="valor" cx="50%" cy="72%" startAngle={180} endAngle={0}
            innerRadius="57%" outerRadius="94%" fill={`url(#${patron})`} stroke="none" isAnimationActive={false}
            style={{ pointerEvents: "none" }} />
          <Pie data={datos} dataKey="valor" nameKey="nombre" cx="50%" cy="72%" startAngle={180} endAngle={0}
            innerRadius="66%" outerRadius="87%" paddingAngle={datos.length > 1 ? 2 : 0} cornerRadius={15} stroke="none" isAnimationActive={false}>
            {datos.map((dato) => <Cell key={dato.nombre} fill={dato.color} />)}
          </Pie>
          <Pie data={datos} dataKey="valor" nameKey="nombre" cx="50%" cy="72%" startAngle={180} endAngle={0}
            innerRadius="98%" outerRadius="100%" paddingAngle={datos.length > 1 ? 1 : 0} stroke="none" isAnimationActive={false}
            style={{ pointerEvents: "none" }}>
            {datos.map((dato) => <Cell key={dato.nombre} fill={dato.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const dato = payload[0].payload as Tramo;
            if (!dato.nombre) return null;
            return <CajaTooltip titulo={dato.nombre} lineas={[
              { etiqueta: etiquetaCantidad, valor: numero(dato.valor) },
              { etiqueta: "Del total", valor: porcentaje(dato.valor / suma * 100) },
            ]} />;
          }} />
        </PieChart>
      </ResponsiveContainer>
      <div className={estilos.centro} aria-hidden="true">
        <strong><ValorMetrica valor={numero(total)} /></strong>
        <span>{unidad}</span>
      </div>
    </div>
  );
}
