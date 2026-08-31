"use client";

import type { Columna, Fila, Filtro } from "../Tabla";
import { GraficoDinamico, type Dimension, type Medida } from "./GraficoDinamico";

/** Por qué se puede agrupar un listado de casos. */
const DIMENSIONES: Dimension[] = [
  { clave: "estado", etiqueta: "Estado" },
  { clave: "caso", etiqueta: "Caso" },
  { clave: "repartidor", etiqueta: "Repartidor" },
  { clave: "tienda", etiqueta: "Comercio" },
  { clave: "zona", etiqueta: "Zona" },
  { clave: "demora", etiqueta: "Demora" },
  { clave: "aviso", etiqueta: "Aviso" },
];

const esAbierto = (fila: Fila) => (fila.caso === "Abierto" ? 1 : 0);
const esEstado = (nombre: string) => (fila: Fila) =>
  String(fila.estado ?? "").toLowerCase() === nombre ? 1 : 0;

/** Qué se puede medir sobre esos casos. */
const MEDIDAS: Medida[] = [
  { clave: "casos", etiqueta: "Cantidad de casos", vale: () => 1 },
  { clave: "abiertos", etiqueta: "Casos abiertos", vale: esAbierto },
  { clave: "pct-abiertos", etiqueta: "% sin resolver", vale: esAbierto, modo: "porcentaje" },
  { clave: "devueltos", etiqueta: "Devueltos", vale: esEstado("devuelto") },
  { clave: "entregados", etiqueta: "Entregados", vale: esEstado("entregado") },
  {
    clave: "pct-entregados",
    etiqueta: "% entregados",
    vale: esEstado("entregado"),
    modo: "porcentaje",
  },
  {
    clave: "visitas",
    etiqueta: "Visitas promedio",
    vale: (fila) => Number(fila.visitas ?? 0) || 0,
    modo: "promedio",
  },
  {
    clave: "quieto",
    etiqueta: "Días sin moverse (promedio)",
    vale: (fila) => Number(fila.quieto ?? 0) || 0,
    modo: "promedio",
  },
];

/**
 * Gráfico configurable para un listado de casos. Las dimensiones que la tabla
 * no tiene —`Ayer` no trae aviso ni demora— se descartan solas.
 */
export function GraficoCasos({
  id,
  filas,
  columnas,
  filtros,
}: {
  id: string;
  filas: Fila[];
  columnas: Columna[];
  filtros: Filtro[];
}) {
  const disponibles = new Set(columnas.map((c) => c.clave));
  const dimensiones = DIMENSIONES.filter((d) => disponibles.has(d.clave));

  return (
    <GraficoDinamico
      id={id}
      filas={filas}
      columnas={columnas}
      filtros={filtros}
      dimensiones={dimensiones}
      medidas={MEDIDAS}
    />
  );
}
