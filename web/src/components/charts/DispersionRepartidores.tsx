"use client";

import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { decimal, numero, porcentaje } from "@/lib/formato";
import { CajaTooltip, Leyenda } from "./Tooltip";
import estilos from "./chart.module.css";

export type PuntoRepartidor = {
  nombre: string;
  casos: number;
  tasaDevolucion: number;
  visitasPromedio: number;
};

/**
 * Cada punto es un repartidor: visitas promedio contra tasa de devolución. La
 * nube baja de izquierda a derecha, que es la relación que importa mostrar.
 */
export function DispersionRepartidores({
  datos,
  umbralCritico,
  mediana,
}: {
  datos: PuntoRepartidor[];
  umbralCritico: number;
  mediana: number;
}) {
  return (
    <div className={estilos.wrap}>
      <Leyenda
        series={[
          { nombre: `En revisión (más de ${umbralCritico}%)`, color: "var(--critical)" },
          { nombre: "Resto del equipo", color: "var(--accent)" },
        ]}
      />
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 26, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis
            type="number"
            dataKey="visitasPromedio"
            name="Visitas promedio"
            domain={([min, max]: readonly [number, number]) =>
              [Math.floor((min - 0.1) * 10) / 10, Math.ceil((max + 0.1) * 10) / 10] as const
            }
            tickCount={7}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            tickFormatter={(v: number) => decimal(v)}
            label={{
              value: "Visitas promedio por caso",
              position: "insideBottom",
              offset: -16,
              fill: "var(--muted)",
              fontSize: 11,
              fontFamily: "var(--mono)",
            }}
          />
          <YAxis
            type="number"
            dataKey="tasaDevolucion"
            name="Tasa de devolución"
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ZAxis type="number" dataKey="casos" range={[40, 420]} name="Casos" />
          <ReferenceLine
            y={mediana}
            stroke="var(--axis)"
            label={{
              value: `mediana ${porcentaje(mediana)}`,
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
              const punto = payload[0].payload as PuntoRepartidor;
              return (
                <CajaTooltip
                  titulo={punto.nombre}
                  lineas={[
                    { etiqueta: "Tasa de devolución", valor: porcentaje(punto.tasaDevolucion) },
                    { etiqueta: "Visitas promedio", valor: decimal(punto.visitasPromedio) },
                    { etiqueta: "Casos", valor: numero(punto.casos) },
                  ]}
                />
              );
            }}
          />
          <Scatter data={datos} fillOpacity={0.75}>
            {datos.map((punto) => (
              <Cell
                key={punto.nombre}
                fill={punto.tasaDevolucion > umbralCritico ? "var(--critical)" : "var(--accent)"}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
