"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FilaMes } from "@/lib/metricas";
import { mesCorto, numero, porcentaje } from "@/lib/formato";
import { CajaTooltip, Leyenda } from "./Tooltip";
import estilos from "./chart.module.css";

/**
 * Volumen por mes, partido entre los casos donde la tienda aportó algo y los
 * que quedaron sin nada.
 *
 * Apiladas y no lado a lado: la altura total es el volumen del mes, que es lo
 * primero que se mira, y el corte interno responde la segunda pregunta sin
 * pedir otro gráfico. Puestas al lado habría que sumarlas de memoria para
 * saber cuántos casos hubo.
 */
export function BarrasMeses({ datos }: { datos: FilaMes[] }) {
  return (
    <div className={estilos.wrap}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={datos} margin={{ top: 12, right: 8, bottom: 4, left: 4 }} barCategoryGap="26%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={mesCorto}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v: number) => numero(v)}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as FilaMes;
              return (
                <CajaTooltip
                  titulo={mesCorto(punto.mes)}
                  lineas={[
                    { etiqueta: "Casos", valor: numero(punto.casos) },
                    { etiqueta: "Con datos de tienda", valor: numero(punto.conDatos) },
                    { etiqueta: "Sin datos", valor: numero(punto.casos - punto.conDatos) },
                    { etiqueta: "Cerrados", valor: porcentaje(punto.tasaCierre) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="conDatos" stackId="mes" fill="var(--accent)" />
          <Bar
            dataKey={(fila: FilaMes) => fila.casos - fila.conDatos}
            name="sinDatos"
            stackId="mes"
            fill="var(--serie-2)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <Leyenda
        series={[
          { nombre: "Con datos de la tienda", color: "var(--accent)" },
          { nombre: "Sin datos", color: "var(--serie-2)" },
        ]}
      />
    </div>
  );
}
