"use client";

import type { FilaEstado } from "@/lib/metricas";
import { ArcoDistribucion } from "./ArcoDistribucion";
import { Leyenda } from "./Tooltip";
import estilos from "./chart.module.css";

function colorEstadoResumen(fila: FilaEstado, indice: number): string {
  if (fila.estado === "Otros") return "var(--fuchsia)";
  if (fila.cerrado) return "var(--chart-secondary)";
  return indice % 2 ? "var(--chart-tertiary)" : "var(--chart-primary)";
}

/**
 * Anillo de distribución para las tablas de estados. Repite exactamente los
 * mismos colores de sus barras: cambia la lectura, no el significado.
 */
export function TortaEstados({ filas }: { filas: FilaEstado[] }) {
  const ordenadas = [...filas].filter((fila) => fila.casos > 0).sort((a, b) => b.casos - a.casos);
  const total = ordenadas.reduce((suma, fila) => suma + fila.casos, 0);
  const datos = ordenadas.length > 9 ? [
    ...ordenadas.slice(0, 8),
    { ...ordenadas[0], estado: "Otros", casos: ordenadas.slice(8).reduce((suma, fila) => suma + fila.casos, 0), cerrado: false },
  ] : ordenadas;
  if (!total) return null;

  return (
    <div className={estilos.anillo}>
      <ArcoDistribucion total={total} unidad="casos" datos={datos.map((fila, indice) => ({ nombre: fila.estado, valor: fila.casos, color: colorEstadoResumen(fila, indice) }))} />
      <Leyenda series={datos.map((fila, indice) => ({ nombre: fila.estado, color: colorEstadoResumen(fila, indice) }))} />
    </div>
  );
}
