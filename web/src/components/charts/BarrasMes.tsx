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
import type { PuntoMes } from "@/lib/metricas";
import { mesCorto, mesLargo, numero, porcentaje } from "@/lib/formato";
import { CajaTooltip } from "./Tooltip";
import estilos from "./chart.module.css";

/** Volumen de casos por mes. Una sola serie, así que no lleva leyenda. */
export function BarrasMes({ datos }: { datos: PuntoMes[] }) {
  return (
    <div className={estilos.wrap}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barCategoryGap="26%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={mesCorto}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => numero(v)}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as PuntoMes;
              return (
                <CajaTooltip
                  titulo={mesLargo(punto.mes)}
                  lineas={[
                    { etiqueta: "Casos", valor: numero(punto.casos) },
                    { etiqueta: "Devoluciones", valor: numero(punto.devoluciones) },
                    { etiqueta: "Tasa", valor: porcentaje(punto.tasaDevolucion) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="casos" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
