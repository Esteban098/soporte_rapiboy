"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PuntoMes } from "@/lib/metricas";
import { mesCorto, mesLargo, numero, porcentaje } from "@/lib/formato";
import { CajaTooltip } from "./Tooltip";
import estilos from "./chart.module.css";

/**
 * Tasa de devolución mes a mes, con el promedio del período como referencia.
 * Va en su propio gráfico y no como segundo eje del de volumen: dos escalas en
 * un mismo plot inventan correlaciones que los datos no tienen.
 */
export function LineaTasa({ datos, promedio }: { datos: PuntoMes[]; promedio: number }) {
  return (
    <div className={estilos.wrap}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={datos} margin={{ top: 12, right: 24, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={mesCorto}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
            /* Sin este respiro, el último punto cae sobre el borde del área de
               dibujo y Recharts recorta el tramo final de la línea. */
            padding={{ left: 10, right: 10 }}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, (max: number) => Math.ceil((max + 3) / 5) * 5]}
          />
          <ReferenceLine
            y={promedio}
            stroke="var(--axis)"
            strokeWidth={1}
            label={{
              value: `promedio ${porcentaje(promedio)}`,
              position: "insideTopRight",
              fill: "var(--muted)",
              fontSize: 10.5,
              fontFamily: "var(--mono)",
            }}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as PuntoMes;
              return (
                <CajaTooltip
                  titulo={mesLargo(punto.mes)}
                  lineas={[
                    { etiqueta: "Tasa de devolución", valor: porcentaje(punto.tasaDevolucion) },
                    { etiqueta: "Devoluciones", valor: numero(punto.devoluciones) },
                    { etiqueta: "Sobre", valor: `${numero(punto.casos)} casos` },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="tasaDevolucion"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3.5, fill: "var(--accent)", strokeWidth: 0 }}
            activeDot={{ r: 5.5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
