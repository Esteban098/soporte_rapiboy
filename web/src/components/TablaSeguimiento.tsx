"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstado } from "@/app/seguimiento";
import { EditorReporte } from "./EditorReporte";
import { enlaceViaje } from "@/lib/enlaces";
import { numero } from "@/lib/formato";
import {
  ESTADOS,
  ETIQUETA_ESTADO,
  nombreDePersona,
  type EstadoSeguimiento,
  type Seguimiento,
} from "@/lib/seguimiento";
import estilos from "./ui.module.css";
import tabla from "./tabla.module.css";
import propio from "./seguimiento-tabla.module.css";

/**
 * La cola de reportes, con el cambio de estado en la misma fila.
 *
 * No usa `Tabla` a propósito. Esa tabla dibuja celdas a partir de valores
 * planos, que es lo que le permite ser común a todo el proyecto; acá cada fila
 * tiene un selector que escribe en la base, adjuntos que abrir y un comentario
 * que se despliega. Meter eso en `Tabla` la volvería un componente con casos
 * especiales de una sola pantalla.
 */
export function TablaSeguimiento({
  reportes,
  urls,
}: {
  reportes: Seguimiento[];
  /**
   * Ruta del adjunto -> URL firmada. Se firman en el servidor al pintar la
   * página porque el bucket es privado y las firmas vencen; guardarlas en la
   * base habría dejado links muertos.
   */
  urls: Record<string, string>;
}) {
  const [estado, setEstado] = useState<EstadoSeguimiento | "todos">("todos");
  const [persona, setPersona] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Seguimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const router = useRouter();

  const personas = useMemo(() => {
    const correos = new Set<string>();
    for (const reporte of reportes) {
      if (reporte.atendidoPor) correos.add(reporte.atendidoPor);
    }
    return [...correos].sort();
  }, [reportes]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return reportes.filter((reporte) => {
      if (estado !== "todos" && reporte.estado !== estado) return false;
      if (persona !== "todas" && reporte.atendidoPor !== persona) return false;
      if (!texto) return true;
      return (
        reporte.casoId.toLowerCase().includes(texto) ||
        reporte.comentario.toLowerCase().includes(texto) ||
        (reporte.resumen ?? "").toLowerCase().includes(texto) ||
        reporte.creadoPor.toLowerCase().includes(texto)
      );
    });
  }, [reportes, estado, persona, busqueda]);

  function alternar(id: string) {
    setAbiertos((previo) => {
      const proximo = new Set(previo);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function mover(id: string, nuevo: EstadoSeguimiento) {
    setCambiando(id);
    iniciar(async () => {
      setError(null);
      const resultado = await cambiarEstado(id, nuevo);
      setCambiando(null);

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      // El servidor es el que sabe quién quedó como responsable y a qué hora,
      // así que la fila se repinta con lo que devuelve la base y no con lo que
      // supone el navegador.
      router.refresh();
    });
  }

  return (
    <div>
      {editando ? (
        <EditorReporte reporte={editando} alCerrar={() => setEditando(null)} />
      ) : null}

      <div className={tabla.filtros} data-noimprimir>
        <label className={tabla.filtro}>
          <span className={tabla.filtroEtiqueta}>Buscar</span>
          <input
            type="search"
            className={tabla.buscador}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Caso, comentario, quien reportó…"
          />
        </label>

        <div className={propio.segmentado} role="group" aria-label="Filtrar por estado">
          {(["todos", ...ESTADOS] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              className={`${propio.segmento} ${estado === opcion ? propio.segmentoActivo : ""}`}
              onClick={() => setEstado(opcion)}
              aria-pressed={estado === opcion}
            >
              {opcion === "todos" ? "Todos" : ETIQUETA_ESTADO[opcion]}
            </button>
          ))}
        </div>

        {personas.length > 0 ? (
          <label className={tabla.filtro}>
            <span className={tabla.filtroEtiqueta}>Atendido por</span>
            <select
              className={tabla.buscador}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            >
              <option value="todas">Todas</option>
              {personas.map((correo) => (
                <option key={correo} value={correo}>
                  {nombreDePersona(correo)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <span className={tabla.conteo}>
          {numero(visibles.length)}
          {visibles.length === reportes.length ? " reportes" : ` de ${numero(reportes.length)}`}
        </span>
      </div>

      {error ? <p className={propio.error}>{error}</p> : null}

      {visibles.length === 0 ? (
        <p className={estilos.empty}>
          {reportes.length === 0
            ? "Todavía no hay reportes. Se cargan desde la pestaña de abajo a la derecha."
            : "Ningún reporte coincide con el filtro."}
        </p>
      ) : (
        <div className={estilos.tableWrap}>
          <table className={estilos.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Caso</th>
                <th>Resumen</th>
                <th>Adjuntos</th>
                <th>Reportó</th>
                <th>Atiende</th>
                <th>Estado</th>
                <th data-noimprimir aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((reporte) => {
                const desplegado = abiertos.has(reporte.id);
                // El resumen es una comodidad; si falta —sin clave de OpenAI, o
                // porque el comentario era corto— se muestra el original, que
                // es el dato de verdad.
                const texto = reporte.resumen ?? reporte.comentario;
                const hayMas = reporte.resumen !== null;

                return (
                  <tr key={reporte.id}>
                    <td className={propio.fecha}>{cuando(reporte.creado)}</td>

                    <td>
                      <a
                        className={tabla.enlaceViaje}
                        href={enlaceViaje(reporte.casoId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Abrir el viaje ${reporte.casoId} en el operador`}
                      >
                        {reporte.casoId}
                      </a>
                    </td>

                    <td className={propio.celdaTexto}>
                      <p className={propio.resumen}>{desplegado ? reporte.comentario : texto}</p>
                      {hayMas ? (
                        <button
                          type="button"
                          className={propio.masTexto}
                          onClick={() => alternar(reporte.id)}
                        >
                          {desplegado ? "Ver el resumen" : "Ver el comentario completo"}
                        </button>
                      ) : null}
                    </td>

                    <td>
                      {reporte.archivos.length === 0 ? (
                        "—"
                      ) : (
                        <span className={propio.adjuntos}>
                          {reporte.archivos.map((ruta, indice) => {
                            const url = urls[ruta];
                            if (!url) {
                              return (
                                <span key={ruta} className={propio.adjuntoRoto} title={ruta}>
                                  no disponible
                                </span>
                              );
                            }
                            return (
                              <a
                                key={ruta}
                                className={propio.adjunto}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <IconoClip />
                                {indice + 1}
                              </a>
                            );
                          })}
                        </span>
                      )}
                    </td>

                    <td className={propio.persona}>{nombreDePersona(reporte.creadoPor)}</td>
                    <td className={propio.persona}>
                      {reporte.atendidoPor ? nombreDePersona(reporte.atendidoPor) : "—"}
                    </td>

                    <td>
                      <select
                        className={`${propio.estado} ${propio[reporte.estado]}`}
                        value={reporte.estado}
                        disabled={cambiando === reporte.id}
                        onChange={(e) => mover(reporte.id, e.target.value as EstadoSeguimiento)}
                        aria-label={`Estado del reporte del caso ${reporte.casoId}`}
                      >
                        {ESTADOS.map((opcion) => (
                          <option key={opcion} value={opcion}>
                            {ETIQUETA_ESTADO[opcion]}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td data-noimprimir className={tabla.celdaAccion}>
                      <button
                        type="button"
                        className={tabla.editar}
                        onClick={() => setEditando(reporte)}
                        aria-label={`Editar el reporte del caso ${reporte.casoId}`}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Fecha y hora en horario de México, que es donde ocurre la operación. */
function cuando(fecha: Date | null): string {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(fecha);
}

function IconoClip() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M10.5 5.5 6 10a2 2 0 0 0 2.8 2.8l4.7-4.7a3.5 3.5 0 0 0-5-5L3.5 8" strokeLinecap="round" />
    </svg>
  );
}
