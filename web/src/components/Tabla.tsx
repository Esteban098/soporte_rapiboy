"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { colorEstado } from "@/lib/estados";
import { enlaceViaje } from "@/lib/enlaces";
import { CeldaTexto } from "./CeldaTexto";
import {
  guardarPreferencia,
  leerPreferencia,
  parsearColumnasOcultas,
  parsearFiltros,
  sinPreferencias,
  suscribirPreferencias,
} from "@/lib/preferencias";
import { numero, porcentaje, decimal } from "@/lib/formato";
import { ChipCaso, TextoEstado } from "./Card";
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
  id,
  columnas,
  filas,
  filtros = [],
  ordenInicial,
  vacio = "No hay datos para mostrar.",
  limite,
}: {
  /** Identifica la tabla para recordar qué columnas ocultó cada persona. */
  id: string;
  columnas: Columna[];
  filas: Fila[];
  filtros?: Filtro[];
  ordenInicial?: { clave: string; asc: boolean };
  vacio?: string;
  /** Cuántas filas mostrar de entrada. El resto se despliega a pedido. */
  limite?: number;
}) {
  const [orden, setOrden] = useState<Orden>(ordenInicial ?? null);
  const [busqueda, setBusqueda] = useState("");

  const ocultasCrudas = useSyncExternalStore(
    suscribirPreferencias,
    () => leerPreferencia(id, "columnas"),
    sinPreferencias,
  );
  const ocultas = useMemo(() => new Set(parsearColumnasOcultas(ocultasCrudas)), [ocultasCrudas]);

  const filtrosCrudos = useSyncExternalStore(
    suscribirPreferencias,
    () => leerPreferencia(id, "filtros"),
    sinPreferencias,
  );
  const seleccion = useMemo(() => parsearFiltros(filtrosCrudos), [filtrosCrudos]);
  const [expandida, setExpandida] = useState(false);

  const opcionesPorFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    for (const filtro of filtros) {
      const opciones =
        filtro.opciones ??
        [...new Set(filas.map((f) => String(f[filtro.clave] ?? "")).filter(Boolean))].sort();

      // Un filtro guardado puede apuntar a un valor que hoy no está en los
      // datos. Se agrega igual para que se vea qué está filtrando y se pueda
      // sacar, en vez de dejar la tabla vacía sin explicación.
      const guardado = seleccion[filtro.clave];
      mapa[filtro.clave] =
        guardado && !opciones.includes(guardado) ? [...opciones, guardado] : opciones;
    }
    return mapa;
  }, [filtros, filas, seleccion]);

  const filtradas = useMemo(() => {
    const activos = Object.entries(seleccion).filter(([, v]) => v !== "");
    const texto = normalizar(busqueda);

    return filas.filter((fila) => {
      if (!activos.every(([clave, valor]) => String(fila[clave] ?? "") === valor)) return false;
      if (!texto) return true;
      return columnas.some((columna) => normalizar(String(fila[columna.clave] ?? "")).includes(texto));
    });
  }, [filas, seleccion, busqueda, columnas]);

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
  const columnasVisibles = columnas.filter((c) => !ocultas.has(c.clave));

  function cambiarOcultas(proximo: Set<string>) {
    guardarPreferencia(id, "columnas", [...proximo]);
  }

  function cambiarFiltro(clave: string, valor: string) {
    const proximo = { ...seleccion };
    if (valor === "") delete proximo[clave];
    else proximo[clave] = valor;
    guardarPreferencia(id, "filtros", proximo);
  }

  function alternarColumna(clave: string) {
    const proximo = new Set(ocultas);
    if (proximo.has(clave)) proximo.delete(clave);
    else proximo.add(clave);
    cambiarOcultas(proximo);
  }

  function alternarOrden(clave: string) {
    setOrden((previo) =>
      previo?.clave === clave ? { clave, asc: !previo.asc } : { clave, asc: true },
    );
  }

  return (
    <>
      <div className={tabla.filtros}>
        <label className={tabla.filtro}>
          <span className={tabla.filtroEtiqueta}>Buscar</span>
          <input
            type="search"
            className={tabla.buscador}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Viaje, tienda, repartidor, zona…"
          />
        </label>

        {filtros.map((filtro) => (
          <label key={filtro.clave} className={tabla.filtro}>
            <span className={tabla.filtroEtiqueta}>{filtro.etiqueta}</span>
            <select
              className={tabla.select}
              value={seleccion[filtro.clave] ?? ""}
              onChange={(e) => cambiarFiltro(filtro.clave, e.target.value)}
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

        <details className={tabla.columnas}>
          <summary className={tabla.columnasResumen}>
            Columnas
            {ocultas.size > 0 ? <span className={tabla.ocultasBadge}>{ocultas.size}</span> : null}
          </summary>
          <div className={tabla.columnasPanel}>
            {columnas.map((columna) => (
              <label key={columna.clave} className={tabla.columnaOpcion}>
                <input
                  type="checkbox"
                  checked={!ocultas.has(columna.clave)}
                  onChange={() => alternarColumna(columna.clave)}
                />
                {columna.titulo}
              </label>
            ))}
            {ocultas.size > 0 ? (
              <button type="button" className={tabla.mostrarTodas} onClick={() => cambiarOcultas(new Set())}>
                Mostrar todas
              </button>
            ) : null}
          </div>
        </details>

        {Object.keys(seleccion).length > 0 || busqueda ? (
          <button
            type="button"
            className={tabla.limpiar}
            onClick={() => {
              setBusqueda("");
              guardarPreferencia(id, "filtros", {});
            }}
          >
            Limpiar filtros
          </button>
        ) : null}

        <span className={tabla.conteo}>
          {numero(ordenadas.length)}
          {ordenadas.length === filas.length ? " filas" : ` de ${numero(filas.length)}`}
        </span>
      </div>

      {ordenadas.length === 0 ? (
        <p className={estilos.empty}>{vacio}</p>
      ) : (
        <div className={estilos.tableWrap}>
          <table className={estilos.table}>
            <thead>
              <tr>
                {columnasVisibles.map((columna) => {
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
                  {columnasVisibles.map((columna) => (
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

/** Compara sin acentos ni mayúsculas, que es como busca la gente. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
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
          <TextoEstado estado={String(valor)} color={colorEstado(String(valor))} />
        </td>
      );
    case "caso":
      return (
        <td className={clase}>
          <ChipCaso cerrado={valor === "Cerrado"} />
        </td>
      );
    case "aviso": {
      const avisado = String(valor).toUpperCase() === "AVISADO";
      return (
        <td className={clase}>
          <span className={avisado ? estilos.textoBueno : estilos.textoCritico}>
            {String(valor)}
          </span>
        </td>
      );
    }
    case "dias": {
      const dias = Number(valor);
      const tono =
        dias > 2 ? estilos.textoCritico : dias > 1 ? estilos.textoAlerta : estilos.textoBueno;
      return (
        <td className={clase}>
          <span className={tono}>
            {dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : `${dias} d quieto`}
          </span>
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
        <td className={clase}>
          <CeldaTexto valor={String(valor)} />
        </td>
      );
  }
}
