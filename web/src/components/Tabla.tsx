"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { colorEstado } from "@/lib/estados";
import { enlaceViaje } from "@/lib/enlaces";
import { CeldaTexto } from "./CeldaTexto";
import {
  guardarPreferencia,
  leerPreferencia,
  parsearColumnasOcultas,
  sinPreferencias,
  suscribirPreferencias,
} from "@/lib/preferencias";
import { useVista } from "./useVista";
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
  titulo,
  columnas,
  filas,
  filtros = [],
  ordenInicial,
  vacio = "No hay datos para mostrar.",
  limite,
}: {
  /** Identifica la tabla para recordar qué columnas ocultó cada persona. */
  id: string;
  /** Encabezado que lleva la tabla al imprimirse. */
  titulo?: string;
  columnas: Columna[];
  filas: Fila[];
  filtros?: Filtro[];
  ordenInicial?: { clave: string; asc: boolean };
  vacio?: string;
  /** Cuántas filas mostrar de entrada. El resto se despliega a pedido. */
  limite?: number;
}) {
  const [orden, setOrden] = useState<Orden>(ordenInicial ?? null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [expandida, setExpandida] = useState(false);

  const ocultasCrudas = useSyncExternalStore(
    suscribirPreferencias,
    () => leerPreferencia(id, "columnas"),
    sinPreferencias,
  );
  const ocultas = useMemo(() => new Set(parsearColumnasOcultas(ocultasCrudas)), [ocultasCrudas]);

  const {
    seleccion,
    busqueda,
    setBusqueda,
    opcionesPorFiltro,
    filtradas,
    alternarValor,
    limpiarFiltro,
    limpiarTodo,
    hayFiltros,
  } = useVista({ id, filas, columnas, filtros });

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

  /**
   * Imprime esta tabla y nada más.
   *
   * Se usa la impresión del navegador en lugar de generar el PDF por código:
   * imprime el DOM tal como está, así lo que sale en el papel es exactamente lo
   * que hay en pantalla —mismos filtros, misma búsqueda, mismas columnas— sin
   * tener que reproducir esa lógica en otro lado.
   */
  function imprimir() {
    setImprimiendo(true);

    // El papel no tiene "ver más filas": se despliegan todas antes de imprimir.
    const limitadaAntes = limite != null && !expandida;
    if (limitadaAntes) setExpandida(true);

    // Dos cuadros para que React pinte las filas nuevas antes de abrir el diálogo.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        setImprimiendo(false);
        if (limitadaAntes) setExpandida(false);
      }),
    );
  }

  function cambiarOcultas(proximo: Set<string>) {
    guardarPreferencia(id, "columnas", [...proximo]);
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

  const filtrosActivos = Object.entries(seleccion);

  return (
    <div data-imprimir={imprimiendo ? "si" : undefined}>
      <div className={tabla.filtros} data-noimprimir>
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

        {filtros.map((filtro) => {
          const elegidos = seleccion[filtro.clave] ?? [];
          return (
            <details key={filtro.clave} className={tabla.columnas}>
              <summary className={tabla.columnasResumen}>
                {filtro.etiqueta}
                {elegidos.length > 0 ? (
                  <span className={tabla.ocultasBadge}>{elegidos.length}</span>
                ) : null}
              </summary>
              <div className={tabla.columnasPanel}>
                {opcionesPorFiltro[filtro.clave]?.map((opcion) => (
                  <label key={opcion} className={tabla.columnaOpcion}>
                    <input
                      type="checkbox"
                      checked={elegidos.includes(opcion)}
                      onChange={() => alternarValor(filtro.clave, opcion)}
                    />
                    {opcion}
                  </label>
                ))}
                {elegidos.length > 0 ? (
                  <button
                    type="button"
                    className={tabla.mostrarTodas}
                    onClick={() => limpiarFiltro(filtro.clave)}
                  >
                    Quitar filtro
                  </button>
                ) : null}
              </div>
            </details>
          );
        })}

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

        <button type="button" className={tabla.imprimir} onClick={imprimir}>
          Imprimir
        </button>

        {hayFiltros ? (
          <button type="button" className={tabla.limpiar} onClick={limpiarTodo}>
            Limpiar filtros
          </button>
        ) : null}

        <span className={tabla.conteo}>
          {numero(ordenadas.length)}
          {ordenadas.length === filas.length ? " filas" : ` de ${numero(filas.length)}`}
        </span>
      </div>

      <div className={tabla.encabezadoImpreso}>
        <h2>{titulo ?? "Tabla"}</h2>
        <p>
          {numero(ordenadas.length)}
          {ordenadas.length === filas.length ? " filas" : ` de ${numero(filas.length)} filas`}
          {" · "}
          {new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}
        </p>
        {filtrosActivos.length > 0 || busqueda ? (
          <p>
            {busqueda ? `Búsqueda: "${busqueda}"` : null}
            {busqueda && filtrosActivos.length > 0 ? " · " : null}
            {filtrosActivos
              .map(([clave, valores]) => `${etiquetaDe(filtros, clave)}: ${valores.join(", ")}`)
              .join(" · ")}
          </p>
        ) : null}
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
                    <Celda
                      key={columna.clave}
                      columna={columna}
                      valor={fila[columna.clave]}
                      fila={fila}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {limite && ordenadas.length > limite ? (
        <button type="button" className={tabla.masFilas} onClick={() => setExpandida((v) => !v)} data-noimprimir>
          {expandida
            ? `Mostrar solo ${numero(limite)}`
            : `Ver las ${numero(ordenadas.length)} filas`}
        </button>
      ) : null}
    </div>
  );
}

function etiquetaDe(filtros: Filtro[], clave: string): string {
  return filtros.find((f) => f.clave === clave)?.etiqueta ?? clave;
}

function esNumerica(tipo?: TipoColumna): boolean {
  return tipo === "numero" || tipo === "decimal" || tipo === "porcentaje" || tipo === "dias";
}

function Celda({
  columna,
  valor,
  fila,
}: {
  columna: Columna;
  valor: Fila[string];
  fila: Fila;
}) {
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
    case "estado": {
      const texto = <TextoEstado estado={String(valor)} color={colorEstado(String(valor))} />;
      // La foto la trae la fila, no la columna: las tablas de agregados no
      // tienen un viaje detrás, así que ahí el estado queda como texto.
      const foto = typeof fila.foto === "string" ? fila.foto : "";
      return (
        <td className={clase}>
          {foto ? (
            <a
              className={tabla.enlaceFoto}
              href={foto}
              target="_blank"
              rel="noopener noreferrer"
              title={`Ver la foto de la entrega del viaje ${fila.id}`}
            >
              {texto}
            </a>
          ) : (
            texto
          )}
        </td>
      );
    }
    case "caso":
      return (
        <td className={clase}>
          <ChipCaso cerrado={valor === "Cerrado"} />
        </td>
      );
    case "aviso": {
      const avisado = String(valor).toUpperCase() === "AVISADO";
      const etiqueta = avisado ? "Avisado al repartidor" : "Sin avisar al repartidor";
      return (
        <td className={clase}>
          <span
            className={`${tabla.aviso} ${avisado ? tabla.avisoOk : tabla.avisoPendiente}`}
            title={etiqueta}
          >
            <IconoCelular />
            <span className={tabla.soloLectores}>{etiqueta}</span>
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

/**
 * Celular para la columna de aviso. El color dice el estado y el `title` más el
 * texto para lectores de pantalla lo dicen con palabras: el color solo no puede
 * ser el único portador del dato.
 */
function IconoCelular() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <rect
        x="4.25"
        y="1.75"
        width="7.5"
        height="12.5"
        rx="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <line
        x1="6.9"
        y1="12.1"
        x2="9.1"
        y2="12.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
