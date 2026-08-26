"use client";

import { useMemo, useState } from "react";
import { tonoEstado } from "@/lib/estados";
import { enlaceViaje } from "@/lib/enlaces";
import { numero, porcentaje, decimal } from "@/lib/formato";
import { Chip } from "./Card";
import estilos from "./ui.module.css";
import tabla from "./tabla.module.css";

/**
 * Tabla ordenable y filtrable, común a todo el proyecto.
 *
 * Las filas llegan como objetos planos y las columnas describen cómo mostrar
 * cada valor. Es así, y no con funciones de render, porque las páginas son
 * Server Components y las funciones no cruzan ese límite.
 */
export type TipoColumna =
  | "texto"
  | "viaje"
  | "numero"
  | "decimal"
  | "porcentaje"
  | "estado"
  | "caso"
  | "aviso"
  | "dias";

export type Columna = {
  clave: string;
  titulo: string;
  tipo?: TipoColumna;
};

export type Fila = Record<string, string | number | boolean | null>;

export type Filtro = {
  clave: string;
  etiqueta: string;
  /** Valores ofrecidos. Si se omite, se arman con los que traigan las filas. */
  opciones?: string[];
};

type Orden = { clave: string; asc: boolean } | null;

export function Tabla({
  columnas,
  filas,
  filtros = [],
  ordenInicial,
  vacio = "No hay datos para mostrar.",
  limite,
}: {
  columnas: Columna[];
  filas: Fila[];
  filtros?: Filtro[];
  ordenInicial?: { clave: string; asc: boolean };
  vacio?: string;
  /** Cuántas filas mostrar de entrada. El resto se despliega a pedido. */
  limite?: number;
}) {
  const [orden, setOrden] = useState<Orden>(ordenInicial ?? null);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [expandida, setExpandida] = useState(false);

  const opcionesPorFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    for (const filtro of filtros) {
      mapa[filtro.clave] =
        filtro.opciones ??
        [...new Set(filas.map((f) => String(f[filtro.clave] ?? "")).filter(Boolean))].sort();
    }
    return mapa;
  }, [filtros, filas]);

  const filtradas = useMemo(() => {
    const activos = Object.entries(seleccion).filter(([, v]) => v !== "");
    if (activos.length === 0) return filas;
    return filas.filter((fila) => activos.every(([clave, valor]) => String(fila[clave] ?? "") === valor));
  }, [filas, seleccion]);

  const ordenadas = useMemo(() => {
    if (!orden) return filtradas;
    const copia = [...filtradas];
    copia.sort((a, b) => {
      const x = a[orden.clave];
      const y = b[orden.clave];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const comparacion =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "es-MX", { numeric: true });
      return orden.asc ? comparacion : -comparacion;
    });
    return copia;
  }, [filtradas, orden]);

  const visibles = limite && !expandida ? ordenadas.slice(0, limite) : ordenadas;

  function alternarOrden(clave: string) {
    setOrden((previo) =>
      previo?.clave === clave ? { clave, asc: !previo.asc } : { clave, asc: true },
    );
  }

  return (
    <>
      {filtros.length > 0 ? (
        <div className={tabla.filtros}>
          {filtros.map((filtro) => (
            <label key={filtro.clave} className={tabla.filtro}>
              <span className={tabla.filtroEtiqueta}>{filtro.etiqueta}</span>
              <select
                className={tabla.select}
                value={seleccion[filtro.clave] ?? ""}
                onChange={(e) =>
                  setSeleccion((previo) => ({ ...previo, [filtro.clave]: e.target.value }))
                }
              >
                <option value="">Todos</option>
                {opcionesPorFiltro[filtro.clave]?.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {opcion}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <span className={tabla.conteo}>
            {numero(ordenadas.length)}
            {ordenadas.length === filas.length ? " casos" : ` de ${numero(filas.length)}`}
          </span>
        </div>
      ) : null}

      {ordenadas.length === 0 ? (
        <p className={estilos.empty}>{vacio}</p>
      ) : (
        <div className={estilos.tableWrap}>
          <table className={estilos.table}>
            <thead>
              <tr>
                {columnas.map((columna) => {
                  const activa = orden?.clave === columna.clave;
                  const numerica = esNumerica(columna.tipo);
                  return (
                    <th key={columna.clave} className={numerica ? estilos.num : undefined}>
                      <button
                        type="button"
                        className={`${tabla.encabezado} ${activa ? tabla.encabezadoActivo : ""}`}
                        onClick={() => alternarOrden(columna.clave)}
                        aria-label={`Ordenar por ${columna.titulo}`}
                      >
                        {columna.titulo}
                        <span className={tabla.flecha} aria-hidden="true">
                          {activa ? (orden!.asc ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibles.map((fila, indice) => (
                <tr key={String(fila.id ?? indice)}>
                  {columnas.map((columna) => (
                    <Celda key={columna.clave} columna={columna} valor={fila[columna.clave]} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {limite && ordenadas.length > limite ? (
        <button type="button" className={tabla.masFilas} onClick={() => setExpandida((v) => !v)}>
          {expandida
            ? `Mostrar solo ${numero(limite)}`
            : `Ver las ${numero(ordenadas.length)} filas`}
        </button>
      ) : null}
    </>
  );
}

function esNumerica(tipo?: TipoColumna): boolean {
  return tipo === "numero" || tipo === "decimal" || tipo === "porcentaje" || tipo === "dias";
}

function Celda({ columna, valor }: { columna: Columna; valor: Fila[string] }) {
  // Sin recortes: cada celda muestra su contenido completo y la tabla scrollea
  // en horizontal si no entra.
  const clase = esNumerica(columna.tipo) ? estilos.num : undefined;

  if (valor == null || valor === "") {
    return (
      <td className={clase}>
        —
      </td>
    );
  }

  switch (columna.tipo) {
    case "viaje":
      return (
        <td className={clase}>
          <a
            className={tabla.enlaceViaje}
            href={enlaceViaje(String(valor))}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir el viaje ${valor} en el operador`}
          >
            {String(valor)}
          </a>
        </td>
      );
    case "estado":
      return (
        <td className={clase}>
          <Chip tono={tonoEstado(String(valor))}>{String(valor)}</Chip>
        </td>
      );
    case "caso":
      return (
        <td className={clase}>
          <Chip tono={valor === "Cerrado" ? "good" : "warning"}>{String(valor)}</Chip>
        </td>
      );
    case "aviso":
      return (
        <td className={clase}>
          <Chip tono={String(valor).toUpperCase() === "AVISADO" ? "good" : "critical"}>
            {String(valor)}
          </Chip>
        </td>
      );
    case "dias": {
      const dias = Number(valor);
      const tono = dias > 2 ? "critical" : dias > 1 ? "warning" : "good";
      return (
        <td className={clase}>
          <Chip tono={tono}>{dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : `${dias} d quieto`}</Chip>
        </td>
      );
    }
    case "numero":
      return (
        <td className={clase}>
          {numero(Number(valor))}
        </td>
      );
    case "decimal":
      return (
        <td className={clase}>
          {decimal(Number(valor))}
        </td>
      );
    case "porcentaje":
      return (
        <td className={clase}>
          {porcentaje(Number(valor))}
        </td>
      );
    default:
      return (
        <td className={clase} title={String(valor)}>
          {String(valor)}
        </td>
      );
  }
}
