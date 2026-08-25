"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Tramo } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { CajaTooltip } from "./Tooltip";
import estilos from "./chart.module.css";

/**
 * Tasa de devolución por tramo (visitas, lead time, día de la semana). Son
 * pocas barras, así que el valor va etiquetado directamente y el tooltip solo
 * agrega el volumen que hay detrás.
 */
export function BarrasTramo({
  datos,
  etiquetaTramo,
  destacarSobre,
}: {
  datos: Tramo[];
  etiquetaTramo: string;
  /** Por encima de este porcentaje la barra se pinta como crítica. */
  destacarSobre?: number;
}) {
  const maximo = Math.max(...datos.map((d) => d.tasaDevolucion), 1);

  return (
    <div className={estilos.wrap}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={datos} margin={{ top: 20, right: 8, bottom: 4, left: 4 }} barCategoryGap="30%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="tramo"
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, Math.min(100, Math.ceil((maximo + 8) / 10) * 10)]}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as Tramo;
              return (
                <CajaTooltip
                  titulo={`${etiquetaTramo}: ${punto.tramo}`}
                  lineas={[
                    { etiqueta: "Tasa de devolución", valor: porcentaje(punto.tasaDevolucion) },
                    { etiqueta: "Casos", valor: numero(punto.casos) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="tasaDevolucion" radius={[4, 4, 0, 0]}>
            {datos.map((punto) => (
              <Cell
                key={punto.tramo}
                fill={
                  destacarSobre != null && punto.tasaDevolucion >= destacarSobre
                    ? "var(--critical)"
                    : "var(--accent)"
                }
              />
            ))}
            <LabelList
              dataKey="tasaDevolucion"
              position="top"
              offset={7}
              formatter={(valor) => porcentaje(Number(valor))}
              style={{ fill: "var(--ink-2)", fontSize: 11, fontFamily: "var(--mono)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
