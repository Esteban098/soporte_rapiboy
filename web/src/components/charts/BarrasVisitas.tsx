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
import type { FilaVisitas } from "@/lib/metricas";
import { numero } from "@/lib/formato";
import { CajaTooltip, Leyenda } from "./Tooltip";
import estilos from "./chart.module.css";

/**
 * Cuántas visitas al domicilio hubo antes de cerrar el caso, separando los que
 * terminaron entregados de los que terminaron devueltos.
 */
export function BarrasVisitas({ datos }: { datos: FilaVisitas[] }) {
  return (
    <div className={estilos.wrap}>
      <Leyenda
        series={[
          { nombre: "Entregados", color: "var(--accent)" },
          { nombre: "Devueltos", color: "var(--serie-2)" },
        ]}
      />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={datos} margin={{ top: 20, right: 8, bottom: 4, left: 4 }} barCategoryGap="24%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="visitas"
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            label={{
              value: "Visitas al domicilio",
              position: "insideBottom",
              offset: -2,
              fill: "var(--muted)",
              fontSize: 10.5,
              fontFamily: "var(--mono)",
            }}
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
              const punto = payload[0].payload as FilaVisitas;
              const total = punto.entregados + punto.devueltos;
              return (
                <CajaTooltip
                  titulo={`${punto.visitas} ${punto.visitas === "1" ? "visita" : "visitas"}`}
                  lineas={[
                    { etiqueta: "Entregados", valor: numero(punto.entregados) },
                    { etiqueta: "Devueltos", valor: numero(punto.devueltos) },
                    {
                      etiqueta: "Terminan entregados",
                      valor: total ? `${Math.round((punto.entregados / total) * 100)}%` : "—",
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="entregados" fill="var(--accent)" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="entregados"
              position="top"
              offset={6}
              formatter={(v) => numero(Number(v))}
              style={{ fill: "var(--ink-2)", fontSize: 10.5, fontFamily: "var(--mono)" }}
            />
          </Bar>
          <Bar dataKey="devueltos" fill="var(--serie-2)" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="devueltos"
              position="top"
              offset={6}
              formatter={(v) => numero(Number(v))}
              style={{ fill: "var(--ink-2)", fontSize: 10.5, fontFamily: "var(--mono)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
