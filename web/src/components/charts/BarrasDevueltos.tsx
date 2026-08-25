"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FilaDiaSemana } from "@/lib/metricas";
import { numero } from "@/lib/formato";
import { CajaTooltip } from "./Tooltip";
import estilos from "./chart.module.css";

/** Cuántos paquetes volvieron al vendedor en cada día de la semana. */
export function BarrasDevueltos({ datos }: { datos: FilaDiaSemana[] }) {
  return (
    <div className={estilos.wrap}>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={datos} margin={{ top: 20, right: 8, bottom: 4, left: 4 }} barCategoryGap="30%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="dia"
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
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
              const punto = payload[0].payload as FilaDiaSemana;
              return (
                <CajaTooltip
                  titulo={punto.dia}
                  lineas={[{ etiqueta: "Paquetes devueltos", valor: numero(punto.devueltos) }]}
                />
              );
            }}
          />
          <Bar dataKey="devueltos" fill="var(--serie-2)" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="devueltos"
              position="top"
              offset={7}
              formatter={(v) => numero(Number(v))}
              style={{ fill: "var(--ink-2)", fontSize: 11, fontFamily: "var(--mono)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
