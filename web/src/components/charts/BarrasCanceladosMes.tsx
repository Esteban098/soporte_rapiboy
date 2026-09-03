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
import type { FilaMesCancelados } from "@/lib/cancelados";
import { mesCorto, numero } from "@/lib/formato";
import { CajaTooltip, Leyenda } from "./Tooltip";
import estilos from "./chart.module.css";

/**
 * Cancelaciones tempranas por mes, marcando cuántas Meli todavía no reflejó.
 *
 * Las desincronizadas van apiladas dentro del total y no como serie aparte: son
 * un subconjunto, no otra cosa que contar, y dibujarlas al lado haría pensar
 * que se suman a las cancelaciones del mes.
 */
export function BarrasCanceladosMes({ datos }: { datos: FilaMesCancelados[] }) {
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
            width={44}
            tickFormatter={(v: number) => numero(v)}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as FilaMesCancelados;
              return (
                <CajaTooltip
                  titulo={mesCorto(punto.mes)}
                  lineas={[
                    { etiqueta: "Cancelados", valor: numero(punto.casos) },
                    { etiqueta: "Sin reflejar en Meli", valor: numero(punto.desincronizados) },
                    { etiqueta: "sellers distintos", valor: numero(punto.sellers) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey={(fila: FilaMesCancelados) => fila.casos - fila.desincronizados}
            name="alDia"
            stackId="mes"
            fill="var(--serie-2)"
          />
          <Bar
            dataKey="desincronizados"
            stackId="mes"
            fill="var(--warning)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <Leyenda
        series={[
          { nombre: "Reflejados en los dos sistemas", color: "var(--serie-2)" },
          { nombre: "Sin reflejar en Meli", color: "var(--warning)" },
        ]}
      />
    </div>
  );
}
