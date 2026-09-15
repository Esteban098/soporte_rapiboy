"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { guardarTienda } from "@/app/responsables";
import {
  RESPONSABLES,
  SECCIONES,
  claveTienda,
  responsablePorEmail,
  type FilaResponsable,
} from "@/lib/responsables";
import { numero } from "@/lib/formato";
import estilos from "./ui.module.css";
import tabla from "./tabla.module.css";
import editor from "./editor-caso.module.css";
import propio from "./color-tiendas.module.css";

type Edicion = { fila: FilaResponsable | null };

const ETIQUETA_SECCION = Object.fromEntries(SECCIONES.map((s) => [s.valor, s.etiqueta]));

/**
 * La distribución de tiendas: de quién es cada una, con alta y edición.
 *
 * Lee la tabla fresca y no el índice cacheado del layout, porque es la
 * pantalla donde se acaba de guardar el cambio y hay que verlo al instante.
 * El color de cada fila sale de su propio responsable por lo mismo.
 */
export function PanelResponsables({ filas }: { filas: FilaResponsable[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [seccion, setSeccion] = useState("");
  const [edicion, setEdicion] = useState<Edicion | null>(null);

  const visibles = useMemo(() => {
    const texto = claveTienda(busqueda);
    return filas.filter(
      (f) =>
        (!seccion || f.seccion === seccion) &&
        (!texto ||
          [f.nombre, ...(f.alias ?? [])].some((n) => claveTienda(n).includes(texto))),
    );
  }, [filas, busqueda, seccion]);

  return (
    <section className={estilos.card}>
      {edicion ? <EditorTienda fila={edicion.fila} alCerrar={() => setEdicion(null)} /> : null}

      <div className={estilos.cardHead}>
        <h2 className={estilos.cardTitle}>Distribución de tiendas</h2>
      </div>
      <p className={estilos.cardNote}>
        De quién es cada comercio. El color se usa en todo el tablero:{" "}
        {RESPONSABLES.map((r, i) => (
          <span key={r.email}>
            {i > 0 ? " y " : null}
            <MarcaResponsable email={r.email}>
              Grupo {r.grupo} · {r.nombre} ({numero(filas.filter((f) => f.responsable === r.email).length)})
            </MarcaResponsable>
          </span>
        ))}
        . Los alias son las otras formas en que la misma tienda aparece escrita en los pedidos o
        en colectas; sin ellos, esa fila queda sin color.
      </p>

      <div className={tabla.filtros}>
        <label className={tabla.filtro}>
          <span className={tabla.filtroEtiqueta}>Buscar</span>
          <input
            className={tabla.select}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre o alias"
            type="search"
          />
        </label>
        <label className={tabla.filtro}>
          <span className={tabla.filtroEtiqueta}>Sección</span>
          <select className={tabla.select} value={seccion} onChange={(e) => setSeccion(e.target.value)}>
            <option value="">Todas</option>
            {SECCIONES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={editor.principal}
          onClick={() => setEdicion({ fila: null })}
        >
          Agregar tienda
        </button>
      </div>

      {/*
       * Una columna por dueño, lado a lado, como la lista original: así se ve
       * de un vistazo qué le toca a cada uno. En pantallas angostas se apilan.
       */}
      <div className={propio.columnas}>
        {RESPONSABLES.map((r) => {
          const suyas = visibles.filter((f) => f.responsable === r.email);
          const total = filas.filter((f) => f.responsable === r.email).length;
          return (
            <div key={r.email} className={propio.columna}>
              <h3 className={propio.columnaTitulo}>
                <MarcaResponsable email={r.email}>
                  Grupo {r.grupo} · {r.nombre}
                </MarcaResponsable>
                <span className={propio.cuenta}>
                  {suyas.length === total
                    ? `${numero(total)} tiendas`
                    : `${numero(suyas.length)} de ${numero(total)}`}
                </span>
              </h3>

              {suyas.length === 0 ? (
                <p className={estilos.empty}>Ninguna tienda coincide con el filtro.</p>
              ) : (
                <div className={estilos.tableWrap}>
                  <table className={estilos.table}>
                    <thead>
                      <tr>
                        <th>Tienda</th>
                        <th>Sección</th>
                        <th aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {suyas.map((fila) => (
                        <tr key={fila.id}>
                          <td>
                            <MarcaResponsable email={fila.responsable}>
                              {fila.nombre}
                            </MarcaResponsable>
                            {fila.alias?.length ? (
                              <span className={propio.alias}>
                                También: {fila.alias.join(" · ")}
                              </span>
                            ) : null}
                          </td>
                          <td>{ETIQUETA_SECCION[fila.seccion] ?? fila.seccion}</td>
                          <td className={tabla.celdaAccion}>
                            <button
                              type="button"
                              className={tabla.editar}
                              onClick={() => setEdicion({ fila })}
                              aria-label={`Editar ${fila.nombre}`}
                              title={
                                fila.editado_por ? `Última edición: ${fila.editado_por}` : undefined
                              }
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Un texto con el color de un responsable, sin pasar por el índice cacheado. */
function MarcaResponsable({ email, children }: { email: string; children: React.ReactNode }) {
  const duena = responsablePorEmail(email);
  if (!duena) return <>{children}</>;
  return (
    <span
      className={propio.tienda}
      style={{ "--color-tienda": duena.color } as React.CSSProperties}
    >
      <span className={propio.punto} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** Alta o edición de una tienda, en el mismo diálogo que los otros editores. */
function EditorTienda({ fila, alCerrar }: { fila: FilaResponsable | null; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(fila?.nombre ?? "");
  const [alias, setAlias] = useState((fila?.alias ?? []).join("\n"));
  const [responsable, setResponsable] = useState<string>(fila?.responsable ?? RESPONSABLES[0].email);
  const [seccion, setSeccion] = useState<string>(fila?.seccion ?? "NUEVA");
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const router = useRouter();

  function guardar() {
    iniciar(async () => {
      setError(null);
      const resultado = await guardarTienda(fila?.id ?? null, {
        nombre,
        alias: alias.split("\n"),
        responsable,
        seccion,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      alCerrar();
    });
  }

  return createPortal(
    <div
      className={editor.fondo}
      role="dialog"
      aria-modal="true"
      aria-label={fila ? `Editar ${fila.nombre}` : "Agregar tienda"}
    >
      <div className={editor.panel}>
        <h2 className={editor.titulo}>{fila ? fila.nombre : "Agregar tienda"}</h2>
        <p className={editor.nota}>
          Escribí el nombre tal como figura en los pedidos. Si la tienda aparece escrita de otra
          forma —en colectas, en el mapa—, sumá esa forma como alias para que también tome el color.
        </p>

        <label className={editor.campo}>
          <span className={editor.etiqueta}>Nombre</span>
          <input
            className={editor.entrada}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
          />
        </label>

        <label className={editor.campo}>
          <span className={editor.etiqueta}>Alias (uno por renglón)</span>
          <textarea
            className={`${editor.entrada} ${editor.area}`}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            rows={3}
            disabled={guardando}
          />
        </label>

        <label className={editor.campo}>
          <span className={editor.etiqueta}>Responsable</span>
          <select
            className={editor.entrada}
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            disabled={guardando}
          >
            {RESPONSABLES.map((r) => (
              <option key={r.email} value={r.email}>
                Grupo {r.grupo} · {r.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className={editor.campo}>
          <span className={editor.etiqueta}>Sección</span>
          <select
            className={editor.entrada}
            value={seccion}
            onChange={(e) => setSeccion(e.target.value)}
            disabled={guardando}
          >
            {SECCIONES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className={editor.error}>{error}</p> : null}

        <div className={editor.acciones}>
          <button type="button" className={editor.principal} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" className={editor.secundario} onClick={alCerrar} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
