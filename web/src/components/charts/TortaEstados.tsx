"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { FilaEstado } from "@/lib/metricas";
import { numero } from "@/lib/formato";
import { CajaTooltip } from "./Tooltip";
import estilos from "./chart.module.css";

function colorEstadoResumen(fila: FilaEstado, indice: number): string {
  if (fila.cerrado) return "var(--chart-secondary)";
  return indice % 2 ? "var(--chart-tertiary)" : "var(--chart-primary)";
}

/**
 * Anillo de distribución para las tablas de estados. Repite exactamente los
 * mismos colores de sus barras: cambia la lectura, no el significado.
 */
export function TortaEstados({ filas }: { filas: FilaEstado[] }) {
  const datos = [...filas].sort((a, b) => b.casos - a.casos).slice(0, 7);
  const total = datos.reduce((suma, fila) => suma + fila.casos, 0);
  if (!total) return null;

  return (
    <div className={estilos.anillo}>
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const fila = payload[0].payload as FilaEstado;
              return (
                <CajaTooltip
                  titulo={fila.estado}
                  lineas={[
                    { etiqueta: "Casos", valor: numero(fila.casos) },
                    { etiqueta: "Del total", valor: `${fila.porcentaje.toFixed(1)}%` },
                  ]}
                />
              );
            }}
          />
          <Pie
            data={datos}
            dataKey="casos"
            nameKey="estado"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={78}
            paddingAngle={4}
            cornerRadius={9}
            stroke="none"
          >
            {datos.map((fila, indice) => (
              <Cell key={fila.estado} fill={colorEstadoResumen(fila, indice)} />
            ))}
          </Pie>
          <text x="50%" y="47%" textAnchor="middle" className={estilos.anilloValor}>
            {numero(total)}
          </text>
          <text x="50%" y="59%" textAnchor="middle" className={estilos.anilloEtiqueta}>
            casos
          </text>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
