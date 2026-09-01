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
import { numero } from "@/lib/formato";
import type { ConteoPersona } from "@/lib/seguimiento";
import { CajaTooltip, Leyenda } from "./Tooltip";
import estilos from "./chart.module.css";

/**
 * Cuántos reportes tomó y cuántos cerró cada persona.
 *
 * Barras agrupadas y no apiladas: la comparación que interesa es tomados contra
 * cerrados dentro de cada persona —muchos tomados y pocos cerrados es trabajo
 * empezado que no termina—, y apilarlas dejaría esa relación adentro de una
 * misma columna, que es donde peor se lee.
 *
 * Es un gráfico fijo y no uno de los configurables (`GraficoDinamico`): esos
 * agrupan una serie por vez y acá el punto es ver las dos juntas.
 */
export function BarrasSeguimiento({ datos }: { datos: ConteoPersona[] }) {
  if (datos.length === 0) {
    return (
      <p className={estilos.vacio}>
        Todavía nadie tomó un reporte. El gráfico aparece cuando haya al menos uno asignado.
      </p>
    );
  }

  return (
    <div className={estilos.wrap}>
      <Leyenda
        series={[
          { nombre: "Tomados", color: "var(--warning)" },
          { nombre: "Cerrados", color: "var(--accent)" },
        ]}
      />
      <ResponsiveContainer width="100%" height={Math.max(220, datos.length * 46 + 60)}>
        <BarChart
          data={datos}
          layout="vertical"
          margin={{ top: 8, right: 28, bottom: 4, left: 4 }}
          barCategoryGap="26%"
        >
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => numero(v)}
          />
          {/* Los nombres van en el eje vertical: en horizontal se pisan apenas
              hay más de cinco personas, y son etiquetas de largo variable. */}
          <YAxis
            type="category"
            dataKey="persona"
            tick={{ fill: "var(--ink-2)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as ConteoPersona;
              return (
                <CajaTooltip
                  titulo={punto.persona}
                  lineas={[
                    { etiqueta: "Tomados", valor: numero(punto.tomados) },
                    { etiqueta: "Cerrados", valor: numero(punto.cerrados) },
                    {
                      etiqueta: "Cerrados sobre el total",
                      valor: punto.total
                        ? `${Math.round((punto.cerrados / punto.total) * 100)}%`
                        : "—",
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="tomados" fill="var(--warning)" radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey="tomados"
              position="right"
              offset={6}
              formatter={(v) => (Number(v) > 0 ? numero(Number(v)) : "")}
              style={{ fill: "var(--ink-2)", fontSize: 10.5, fontFamily: "var(--mono)" }}
            />
          </Bar>
          <Bar dataKey="cerrados" fill="var(--accent)" radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey="cerrados"
              position="right"
              offset={6}
              formatter={(v) => (Number(v) > 0 ? numero(Number(v)) : "")}
              style={{ fill: "var(--ink-2)", fontSize: 10.5, fontFamily: "var(--mono)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
