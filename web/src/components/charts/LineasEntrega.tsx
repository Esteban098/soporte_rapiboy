"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FilaMes } from "@/lib/metricas";
import { abrirDetalle, type Detalle } from "@/lib/detalle";
import { mesCorto, numero, porcentaje } from "@/lib/formato";
import { CajaTooltip, Leyenda, Pista } from "./Tooltip";
import estilos from "./chart.module.css";

/**
 * Qué parte de los casos terminó entregada, mes a mes, separando los que
 * tenían datos de la tienda de los que no.
 *
 * Es la única lectura que dice si pedirle datos a la tienda sirve. Un mes
 * suelto no alcanza —la diferencia puede ser el azar de pocos casos— y por eso
 * va como serie: lo que convence es que la distancia se sostenga.
 *
 * El eje llega hasta 100 siempre, aunque ninguna serie se acerque. Con el eje
 * ajustado a los datos, dos meses parecidos se ven como un abismo según dónde
 * haya quedado el techo.
 */
export function LineasEntrega({ datos, detalle }: { datos: FilaMes[]; detalle?: Detalle }) {
  /*
   * Acá el clic va sobre el mes entero y no sobre una de las dos líneas.
   *
   * Cada punto es una tasa —qué parte de ese grupo terminó entregada—, así que
   * el recorte útil son los casos del mes con las dos poblaciones juntas y la
   * columna que las separa: es lo que deja comparar, que es la pregunta del
   * gráfico. Además, un punto de línea es un blanco de tres píxeles; el mes
   * entero se acierta siempre.
   */
  function abrir(mes: string) {
    if (!detalle) return;
    abrirDetalle({
      titulo: detalle.titulo,
      contexto: `${mesCorto(mes)} · con datos contra sin datos`,
      columnas: detalle.columnas,
      filas: detalle.filas.filter((fila) => fila.mesClave === mes),
      totalUniverso: detalle.filas.length,
    });
  }

  return (
    <div className={`${estilos.wrap} ${detalle ? estilos.tocableTodo : ""}`}>
      {detalle ? <Pista que="un mes" /> : null}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={datos}
          margin={{ top: 12, right: 8, bottom: 4, left: 4 }}
          onClick={(estado: { activeLabel?: string | number }) => {
            const mes = estado?.activeLabel;
            if (typeof mes === "string") abrir(mes);
          }}
        >
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={mesCorto}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--sans)" }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            padding={{ left: 10, right: 10 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--sans)" }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const punto = payload[0].payload as FilaMes;
              return (
                <CajaTooltip
                  titulo={mesCorto(punto.mes)}
                  lineas={[
                    {
                      etiqueta: `Con datos (${numero(punto.conDatos)})`,
                      valor: porcentaje(punto.tasaEntregaConDatos),
                    },
                    {
                      etiqueta: `Sin datos (${numero(punto.casos - punto.conDatos)})`,
                      valor: porcentaje(punto.tasaEntregaSinDatos),
                    },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="tasaEntregaConDatos"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--accent)" }}
          />
          <Line
            type="monotone"
            dataKey="tasaEntregaSinDatos"
            stroke="var(--serie-2)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3, fill: "var(--serie-2)" }}
          />
        </LineChart>
      </ResponsiveContainer>
      <Leyenda
        series={[
          { nombre: "Entregados · con datos de la tienda", color: "var(--accent)" },
          { nombre: "Entregados · sin datos", color: "var(--serie-2)" },
        ]}
      />
    </div>
  );
}
