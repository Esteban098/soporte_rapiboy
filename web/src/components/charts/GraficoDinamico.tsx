"use client";

import { useMemo, useState } from "react";
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
import { colorEstado } from "@/lib/estados";
import { numero, porcentaje } from "@/lib/formato";
import type { Columna, Fila, Filtro } from "../Tabla";
import { useVista } from "../useVista";
import { CajaTooltip } from "./Tooltip";
import estilos from "./chart.module.css";
import tabla from "../tabla.module.css";

export type Dimension = { clave: string; etiqueta: string };

export type Medida = {
  clave: string;
  etiqueta: string;
  /** Cómo cuenta cada fila. Sumar 1 es "cantidad de casos". */
  vale: (fila: Fila) => number;
  /**
   * `suma` acumula, `porcentaje` divide por los casos del grupo y `promedio`
   * saca la media. Por defecto suma.
   */
  modo?: "suma" | "porcentaje" | "promedio";
};

/**
 * Gráfico configurable atado a los filtros de una tabla.
 *
 * Comparte el `id` con su tabla, así que lee exactamente las mismas filas
 * filtradas: al tocar un filtro o escribir en el buscador, el gráfico se
 * recalcula solo. Encima, quien mira elige por qué dimensión agrupar y qué
 * medir, sin que haya que anticipar cada cruce con un gráfico fijo.
 */
export function GraficoDinamico({
  id,
  filas,
  columnas,
  filtros,
  dimensiones,
  medidas,
  tope = 12,
}: {
  id: string;
  filas: Fila[];
  columnas: Columna[];
  filtros: Filtro[];
  dimensiones: Dimension[];
  medidas: Medida[];
  /** Cuántas barras mostrar como máximo, de mayor a menor. */
  tope?: number;
}) {
  const { filtradas, hayFiltros } = useVista({ id, filas, columnas, filtros });
  const [dimension, setDimension] = useState(dimensiones[0]?.clave ?? "");
  const [medida, setMedida] = useState(medidas[0]?.clave ?? "");

  const medidaActiva = medidas.find((m) => m.clave === medida) ?? medidas[0];
  const dimensionActiva = dimensiones.find((d) => d.clave === dimension) ?? dimensiones[0];

  const datos = useMemo(() => {
    if (!medidaActiva || !dimensionActiva) return [];

    const grupos = new Map<string, { valor: number; casos: number }>();
    for (const fila of filtradas) {
      const clave = String(fila[dimensionActiva.clave] ?? "").trim() || "Sin dato";
      const actual = grupos.get(clave) ?? { valor: 0, casos: 0 };
      actual.valor += medidaActiva.vale(fila);
      actual.casos += 1;
      grupos.set(clave, actual);
    }

    return [...grupos.entries()]
      .map(([nombre, { valor, casos }]) => ({
        nombre,
        casos,
        valor: calcular(medidaActiva.modo, valor, casos),
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, tope);
  }, [filtradas, dimensionActiva, medidaActiva, tope]);

  const esEstado = dimensionActiva?.clave === "estado";
  const formatear = (v: number) =>
    medidaActiva?.modo === "porcentaje"
      ? porcentaje(v)
      : medidaActiva?.modo === "promedio"
        ? v.toFixed(2)
        : numero(v);

  return (
    <div className={estilos.wrap}>
      <div className={tabla.filtros} data-noimprimir>
        <label className={tabla.filtro}>
          <span className={tabla.filtroEtiqueta}>Agrupar por</span>
          <select
            className={tabla.select}
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
          >
            {dimensiones.map((d) => (
              <option key={d.clave} value={d.clave}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className={tabla.filtro}>
          <span className={tabla.filtroEtiqueta}>Medir</span>
          <select
            className={tabla.select}
            value={medida}
            onChange={(e) => setMedida(e.target.value)}
          >
            {medidas.map((m) => (
              <option key={m.clave} value={m.clave}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <span className={tabla.conteo}>
          {hayFiltros ? "sobre lo filtrado en la tabla" : "sobre todos los casos"}
        </span>
      </div>

      {datos.length === 0 ? (
        <p className={estilos.vacio}>No hay datos para graficar con estos filtros.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, datos.length * 30 + 40)}>
          <BarChart
            data={datos}
            layout="vertical"
            margin={{ top: 6, right: 56, bottom: 6, left: 6 }}
            barCategoryGap="22%"
          >
            <CartesianGrid stroke="var(--grid)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatear}
            />
            <YAxis
              type="category"
              dataKey="nombre"
              width={170}
              tick={{ fill: "var(--ink-2)", fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--accent-soft)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const punto = payload[0].payload as { nombre: string; valor: number; casos: number };
                return (
                  <CajaTooltip
                    titulo={punto.nombre}
                    lineas={[
                      { etiqueta: medidaActiva?.etiqueta ?? "Valor", valor: formatear(punto.valor) },
                      { etiqueta: "Casos", valor: numero(punto.casos) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
              {datos.map((punto) => (
                <Cell
                  key={punto.nombre}
                  fill={esEstado ? colorDeEstado(punto.nombre) : "var(--accent)"}
                />
              ))}
              <LabelList
                dataKey="valor"
                position="right"
                offset={8}
                formatter={(v) => formatear(Number(v))}
                style={{ fill: "var(--ink-2)", fontSize: 11, fontFamily: "var(--mono)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function calcular(modo: Medida["modo"], valor: number, casos: number): number {
  if (casos === 0) return 0;
  if (modo === "porcentaje") return (valor / casos) * 100;
  if (modo === "promedio") return valor / casos;
  return valor;
}

/** Cuando se agrupa por estado, cada barra lleva el color de ese estado. */
function colorDeEstado(nombre: string): string {
  const color = colorEstado(nombre);
  return color === "neutral" ? "var(--accent)" : `var(--estado-${color})`;
}
