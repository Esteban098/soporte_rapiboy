"use client";

import { useMemo, useState } from "react";
import tabla from "./tabla.module.css";

export type ColumnaOrdenable<T> = {
  clave: string;
  titulo: string;
  valor: (fila: T) => unknown;
  render?: (fila: T) => React.ReactNode;
  className?: string;
  ordenable?: boolean;
};

type Orden = { clave: string; asc: boolean };

/** Tabla liviana para bloques que no usan el modelo de datos de Tabla.tsx. */
export function TablaOrdenable<T>({
  filas,
  columnas,
  claveFila,
  className,
  ordenInicial,
  limite,
  mostrarTodas,
}: {
  filas: T[];
  columnas: ColumnaOrdenable<T>[];
  claveFila: (fila: T, indice: number) => string | number;
  className?: string;
  ordenInicial?: { clave: string; asc: boolean };
  limite?: number;
  /** Permite que una pantalla controle el despliegue sin perder el tope general de diez. */
  mostrarTodas?: boolean;
}) {
  const [orden, setOrden] = useState<Orden | null>(ordenInicial ?? null);
  const [expandida, setExpandida] = useState(false);

  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const columna = columnas.find((c) => c.clave === orden.clave);
    if (!columna) return filas;
    return [...filas].sort((a, b) => {
      const comparacion = comparar(columna.valor(a), columna.valor(b));
      return orden.asc ? comparacion : -comparacion;
    });
  }, [filas, columnas, orden]);

  function cambiarOrden(clave: string) {
    setOrden((previo) =>
      previo?.clave === clave ? { clave, asc: !previo.asc } : { clave, asc: true },
    );
  }

  const limiteInicial = Math.min(limite ?? 10, 10);
  const mostrarTodo = mostrarTodas ?? expandida;
  const visibles = mostrarTodo ? ordenadas : ordenadas.slice(0, limiteInicial);

  return (
    <>
    <table className={className}>
      <thead>
        <tr>
          {columnas.map((columna) => {
            const activa = orden?.clave === columna.clave;
            return (
              <th key={columna.clave} className={columna.className} aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"}>
                {columna.ordenable === false ? (
                  columna.titulo
                ) : (
                  <button
                    type="button"
                    className={tabla.encabezado}
                    onClick={() => cambiarOrden(columna.clave)}
                    aria-label={`Ordenar por ${columna.titulo}`}
                  >
                    {columna.titulo}
                    <span className={tabla.flecha} aria-hidden="true">
                      {activa ? (orden.asc ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {visibles.map((fila, indice) => (
          <tr key={String(claveFila(fila, indice))}>
            {columnas.map((columna) => (
              <td key={columna.clave} className={columna.className}>
                {columna.render ? columna.render(fila) : String(columna.valor(fila) ?? "—")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    {mostrarTodas == null && ordenadas.length > limiteInicial ? (
      <button type="button" className={tabla.masFilas} onClick={() => setExpandida((v) => !v)}>
        {expandida ? `Mostrar solo ${limiteInicial} filas` : `Ver las ${ordenadas.length} filas`}
      </button>
    ) : null}
    </>
  );
}

function comparar(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "es-MX", { numeric: true, sensitivity: "base" });
}
