"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FilaDia } from "@/lib/colectas";
import { abrirDetalle, type Detalle } from "@/lib/detalle";
import { diaCorto, diaLargo, numero } from "@/lib/formato";
import { CajaTooltip, Pista } from "./Tooltip";
import { datoTocado } from "./tocar";
import estilos from "./chart.module.css";

/**
 * Colectas de cada día, con el día elegido en otro color.
 *
 * Destacar el día seleccionado es el punto: sin eso el gráfico y la tabla de
 * abajo son dos cosas sueltas, y con eso se ve de un vistazo si el día que se
 * está mirando fue flojo o normal para la serie.
 */
export function BarrasColectas({
  datos,
  destacado,
  detalle,
}: {
  datos: FilaDia[];
  /** Día que está mostrando la pantalla, como `2026-09-02`. */
  destacado: string;
  detalle?: Detalle;
}) {
  function abrir(punto: FilaDia) {
    if (!detalle) return;
    abrirDetalle({
      titulo: detalle.titulo,
      contexto: `Colectas del ${diaLargo(punto.dia)}`,
      columnas: detalle.columnas,
      filas: detalle.filas.filter((fila) => fila.fecha === punto.dia),
      totalUniverso: detalle.filas.length,
    });
  }

  return (
    <div className={`${estilos.wrap} ${detalle ? estilos.tocable : ""}`}>
      {detalle ? <Pista /> : null}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={datos} margin={{ top: 12, right: 8, bottom: 4, left: 4 }} barCategoryGap="18%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="dia"
            tickFormatter={diaCorto}
            tick={{ fill: "var(--muted)", fontSize: 10, fontFamily: "var(--sans)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--sans)" }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => numero(v)}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as FilaDia;
              return (
                <CajaTooltip
                  titulo={diaLargo(punto.dia)}
                  lineas={[
                    { etiqueta: "Colectas", valor: numero(punto.colectas) },
                    { etiqueta: "Retiradas", valor: numero(punto.colectadas) },
                    { etiqueta: "Canceladas", valor: numero(punto.canceladas) },
                    { etiqueta: "Paquetes", valor: numero(punto.paquetes) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="colectas"
            radius={[3, 3, 0, 0]}
            onClick={(entrada: unknown) => {
              const punto = datoTocado<FilaDia>(entrada);
              if (punto) abrir(punto);
            }}
          >
            {datos.map((fila) => (
              <Cell
                key={fila.dia}
                fill={fila.dia === destacado ? "var(--accent)" : "var(--serie-2)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
