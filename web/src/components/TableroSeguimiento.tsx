"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstado, tomarSeguimiento, type Resultado } from "@/app/seguimiento";
import { EditorReporte } from "./EditorReporte";
import { NombreTienda } from "./ColorTiendas";
import { enlaceViaje } from "@/lib/enlaces";
import { duracion, fechaHoraArgentina, numero } from "@/lib/formato";
import { aliasDeCorreo, tramosConMenciones } from "@/lib/menciones";
import {
  ETAPAS,
  ETIQUETA_ETAPA,
  agruparSeguimientos,
  colorDePersona,
  etapaDe,
  inicialesDePersona,
  minutosAbierto,
  nombreDePersona,
  resumirSeguimientos,
  tiempoResolucionMinutos,
  type Agrupacion,
  type EstadoSeguimiento,
  type EtapaSeguimiento,
  type GrupoSeguimiento,
  type Seguimiento,
} from "@/lib/seguimiento";
import tabla from "./tabla.module.css";
import estilos from "./seguimiento-tablero.module.css";

/**
 * La cola de reportes como tablero de tarjetas.
 *
 * Cada semana o mes es un carril con tres columnas —Abierto, Tomado,
 * Cerrado—. Las columnas son la etapa y no se arrastra entre ellas: tomar es
 * un checkbox y cerrar un botón, porque cada cambio escribe en la base y deja
 * firmado quién lo hizo, y un arrastre accidental no debería poder hacer eso.
 */

const UN_DIA = 24 * 60;

export function TableroSeguimiento({
  reportes,
  urls,
  yo,
  admin,
  foco = null,
}: {
  reportes: Seguimiento[];
  /**
   * Ruta del adjunto -> URL firmada. Se firman en el servidor al pintar la
   * página porque el bucket es privado y las firmas vencen.
   */
  urls: Record<string, string>;
  /** Correo de quien mira, para marcar lo suyo. */
  yo: string | null;
  admin: boolean;
  /** Id del reporte a mostrar abierto y resaltado, al llegar desde una notificación. */
  foco?: string | null;
}) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>("semana");
  const [busqueda, setBusqueda] = useState("");
  const [responsable, setResponsable] = useState("todos");
  const [plegados, setPlegados] = useState<Record<string, boolean>>({});
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [editando, setEditando] = useState<Seguimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);
  const [, iniciar] = useTransition();
  const router = useRouter();

  // La antigüedad se calcula recién en el navegador y se refresca cada minuto:
  // calcularla también en el servidor haría que los textos no coincidan al hidratar.
  useEffect(() => {
    const primero = setTimeout(() => setAhora(Date.now()), 0);
    const intervalo = setInterval(() => setAhora(Date.now()), 60_000);
    return () => {
      clearTimeout(primero);
      clearInterval(intervalo);
    };
  }, []);

  const resumen = useMemo(() => resumirSeguimientos(reportes), [reportes]);
  const mios = useMemo(
    () => reportes.filter((r) => yo && etapaDe(r) === "tomado" && r.tomadoPor === yo).length,
    [reportes, yo],
  );

  const personas = useMemo(() => {
    const correos = new Set<string>();
    for (const reporte of reportes) {
      if (reporte.tomadoPor) correos.add(reporte.tomadoPor);
      if (reporte.atendidoPor) correos.add(reporte.atendidoPor);
    }
    return [...correos].sort();
  }, [reportes]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return reportes.filter((reporte) => {
      if (responsable === "mios") {
        if (!yo || (reporte.tomadoPor !== yo && reporte.atendidoPor !== yo)) return false;
      } else if (responsable === "sin-tomar") {
        if (etapaDe(reporte) !== "abierto") return false;
      } else if (responsable !== "todos") {
        if (reporte.tomadoPor !== responsable && reporte.atendidoPor !== responsable) return false;
      }
      if (!texto) return true;
      return [
        reporte.casoId,
        reporte.driver,
        reporte.seller,
        reporte.comentario,
        reporte.resumen,
        reporte.creadoPor,
        reporte.tomadoPor,
      ].some((valor) => (valor ?? "").toLowerCase().includes(texto));
    });
  }, [reportes, responsable, busqueda, yo]);

  const grupos = useMemo(() => agruparSeguimientos(visibles, agrupacion), [visibles, agrupacion]);

  function ejecutar(id: string, accion: () => Promise<Resultado>) {
    setPendiente(id);
    iniciar(async () => {
      setError(null);
      const resultado = await accion();
      setPendiente(null);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      // Quién tomó o cerró y a qué hora lo sabe el servidor: la tarjeta se
      // repinta con lo que devuelve la base, no con lo que supone el navegador.
      router.refresh();
    });
  }

  return (
    <div className={estilos.tablero}>
      {editando ? <EditorReporte reporte={editando} alCerrar={() => setEditando(null)} /> : null}

      <Resumen resumen={resumen} mios={yo ? mios : null} />

      <div className={estilos.herramientas} data-noimprimir>
        <input
          type="search"
          className={`${tabla.buscador} ${estilos.buscar}`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar caso, driver, seller, comentario…"
          aria-label="Buscar reportes"
        />

        <div className={estilos.segmentado} role="group" aria-label="Agrupar por">
          {(
            [
              ["semana", "Semana"],
              ["mes", "Mes"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              className={`${estilos.segmento} ${agrupacion === valor ? estilos.segmentoActivo : ""}`}
              onClick={() => setAgrupacion(valor)}
              aria-pressed={agrupacion === valor}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <select
          className={`${tabla.buscador} ${estilos.selector}`}
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
          aria-label="Filtrar por responsable"
        >
          <option value="todos">Todos</option>
          {yo ? <option value="mios">Míos</option> : null}
          <option value="sin-tomar">Sin tomar</option>
          {personas.length > 0 ? (
            <optgroup label="Tomado o cerrado por">
              {personas.map((correo) => (
                <option key={correo} value={correo}>
                  {nombreDePersona(correo)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>

        <span className={estilos.total}>
          {numero(visibles.length)}
          {visibles.length === reportes.length ? " reportes" : ` de ${numero(reportes.length)}`}
        </span>
      </div>

      {error ? (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      ) : null}

      {visibles.length === 0 ? (
        <p className={estilos.vacio}>
          {reportes.length === 0
            ? "Todavía no hay reportes. Se cargan desde la pestaña de abajo a la derecha."
            : "Ningún reporte coincide con el filtro."}
        </p>
      ) : (
        <div className={estilos.carriles}>
          {grupos.map((grupo, indice) => (
            <Carril
              key={grupo.clave}
              grupo={grupo}
              plegado={plegados[grupo.clave] ?? !abrePorDefecto(grupo, indice, foco)}
              alternar={(plegado) => setPlegados((previo) => ({ ...previo, [grupo.clave]: plegado }))}
            >
              {(reporte) => (
                <Tarjeta
                  // Cambiar la clave al enfocarla la vuelve a montar desplegada,
                  // aunque la notificación llegue con la pantalla ya abierta.
                  key={foco === reporte.id ? `${reporte.id}:foco` : reporte.id}
                  enfocada={foco === reporte.id}
                  reporte={reporte}
                  urls={urls}
                  yo={yo}
                  admin={admin}
                  ahora={ahora}
                  ocupado={pendiente === reporte.id}
                  alTomar={(tomar) => ejecutar(reporte.id, () => tomarSeguimiento(reporte.id, tomar))}
                  alCambiarEstado={(estado: EstadoSeguimiento) =>
                    ejecutar(reporte.id, () => cambiarEstado(reporte.id, estado))
                  }
                  alEditar={() => setEditando(reporte)}
                />
              )}
            </Carril>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * El período más reciente, cualquiera con algo pendiente y el que tiene el
 * reporte enfocado arrancan abiertos.
 */
function abrePorDefecto(grupo: GrupoSeguimiento, indice: number, foco: string | null): boolean {
  return (
    indice === 0 ||
    grupo.reportes.some((reporte) => reporte.estado === "abierto" || reporte.id === foco)
  );
}

function Resumen({
  resumen,
  mios,
}: {
  resumen: ReturnType<typeof resumirSeguimientos>;
  mios: number | null;
}) {
  return (
    <section className={estilos.resumen} aria-label="Resumen de reportes">
      <dl className={estilos.cifras}>
        <div className={`${estilos.cifra} ${estilos.abierto}`}>
          <dt>
            <i className={estilos.punto} />
            Abiertos
          </dt>
          <dd>{numero(resumen.abiertos)}</dd>
          <dd className={estilos.cifraNota}>
            {numero(resumen.sinTomar)} sin tomar · {numero(resumen.tomados)}{" "}
            {resumen.tomados === 1 ? "tomado" : "tomados"}
          </dd>
        </div>
        {mios !== null ? (
          <div className={`${estilos.cifra} ${estilos.tomado}`}>
            <dt>
              <i className={estilos.punto} />
              Tomados por vos
            </dt>
            <dd>{numero(mios)}</dd>
            <dd className={estilos.cifraNota}>en curso</dd>
          </div>
        ) : null}
        <div className={`${estilos.cifra} ${estilos.cerrado}`}>
          <dt>
            <i className={estilos.punto} />
            Cerrados
          </dt>
          <dd>{numero(resumen.cerrados)}</dd>
          <dd className={estilos.cifraNota}>de {numero(resumen.total)} reportes</dd>
        </div>
        <div className={estilos.cifra}>
          <dt>Resolución promedio</dt>
          <dd>{duracion(resumen.resolucionPromedioMinutos)}</dd>
          <dd className={estilos.cifraNota}>desde la última apertura</dd>
        </div>
      </dl>
      <Proporcion
        conteos={{ abierto: resumen.sinTomar, tomado: resumen.tomados, cerrado: resumen.cerrados }}
      />
    </section>
  );
}

/** Barra de proporción por etapa. Cada tramo lleva su conteo en el `title`. */
function Proporcion({
  conteos,
  className = "",
}: {
  conteos: Record<EtapaSeguimiento, number>;
  className?: string;
}) {
  const total = ETAPAS.reduce((suma, etapa) => suma + conteos[etapa], 0);
  if (total === 0) return null;
  return (
    <div className={`${estilos.proporcion} ${className}`} aria-hidden="true">
      {ETAPAS.map((etapa) =>
        conteos[etapa] > 0 ? (
          <span
            key={etapa}
            className={`${estilos.tramo} ${estilos[etapa]}`}
            style={{ flexGrow: conteos[etapa] }}
            title={`${ETIQUETA_ETAPA[etapa]}: ${conteos[etapa]}`}
          />
        ) : null,
      )}
    </div>
  );
}

function Carril({
  grupo,
  plegado,
  alternar,
  children,
}: {
  grupo: GrupoSeguimiento;
  plegado: boolean;
  alternar: (plegado: boolean) => void;
  children: (reporte: Seguimiento) => React.ReactNode;
}) {
  const columnas = ETAPAS.map((etapa) => ({
    etapa,
    reportes: ordenarColumna(
      grupo.reportes.filter((reporte) => etapaDe(reporte) === etapa),
      etapa,
    ),
  }));
  const conteos = Object.fromEntries(
    columnas.map(({ etapa, reportes }) => [etapa, reportes.length]),
  ) as Record<EtapaSeguimiento, number>;

  return (
    <section className={estilos.carril}>
      <button
        type="button"
        className={estilos.carrilCabeza}
        onClick={() => alternar(!plegado)}
        aria-expanded={!plegado}
      >
        <IconoChevron className={`${estilos.chevron} ${plegado ? estilos.chevronPlegado : ""}`} />
        <span className={estilos.carrilTitulo}>{grupo.etiqueta}</span>
        <span className={estilos.carrilConteos}>
          {ETAPAS.map((etapa) =>
            conteos[etapa] > 0 ? (
              <span
                key={etapa}
                className={`${estilos.carrilConteo} ${estilos[etapa]}`}
                title={ETIQUETA_ETAPA[etapa]}
              >
                <i className={estilos.punto} />
                {numero(conteos[etapa])}
                <span className={estilos.oculto}> {ETIQUETA_ETAPA[etapa]}</span>
              </span>
            ) : null,
          )}
        </span>
        <Proporcion conteos={conteos} className={estilos.carrilProporcion} />
      </button>

      {plegado ? null : (
        <div className={estilos.columnas}>
          {columnas.map(({ etapa, reportes }) => (
            <div key={etapa} className={`${estilos.columna} ${estilos[etapa]}`}>
              <h3 className={estilos.columnaCabeza}>
                <i className={estilos.punto} />
                {ETIQUETA_ETAPA[etapa]}
                <span className={estilos.columnaConteo}>{numero(reportes.length)}</span>
              </h3>
              {reportes.length === 0 ? (
                <p className={estilos.columnaVacia}>Sin reportes</p>
              ) : (
                <div className={estilos.tarjetas}>{reportes.map(children)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Lo pendiente, del más viejo al más nuevo: lo que lleva más tiempo esperando
 * va arriba. Lo cerrado, del último cierre para atrás.
 */
function ordenarColumna(reportes: Seguimiento[], etapa: EtapaSeguimiento): Seguimiento[] {
  const tiempo = (fecha: Date | null) => fecha?.getTime() ?? 0;
  return [...reportes].sort((a, b) =>
    etapa === "cerrado"
      ? tiempo(b.atendidoEn) - tiempo(a.atendidoEn)
      : tiempo(a.abiertoEn) - tiempo(b.abiertoEn),
  );
}

function Tarjeta({
  enfocada,
  reporte,
  urls,
  yo,
  admin,
  ahora,
  ocupado,
  alTomar,
  alCambiarEstado,
  alEditar,
}: {
  enfocada: boolean;
  reporte: Seguimiento;
  urls: Record<string, string>;
  yo: string | null;
  admin: boolean;
  ahora: number | null;
  ocupado: boolean;
  alTomar: (tomar: boolean) => void;
  alCambiarEstado: (estado: EstadoSeguimiento) => void;
  alEditar: () => void;
}) {
  const [desplegada, setDesplegada] = useState(enfocada);
  const articulo = useRef<HTMLElement>(null);
  const etapa = etapaDe(reporte);

  useEffect(() => {
    if (enfocada) articulo.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [enfocada]);
  const tomado = etapa === "tomado";
  const mio = Boolean(yo) && reporte.tomadoPor === yo;
  const puedeSoltar = mio || admin;
  const minutos = ahora === null ? null : minutosAbierto(reporte, ahora);
  // El resumen es una comodidad; si falta se muestra el original, que es el dato.
  const texto = desplegada ? reporte.comentario : (reporte.resumen ?? reporte.comentario);

  return (
    <article
      ref={articulo}
      className={`${estilos.tarjeta} ${estilos[etapa]} ${enfocada ? estilos.enfocada : ""}`}
      aria-busy={ocupado}
    >
      <div className={estilos.tarjetaCabeza}>
        <a
          className={estilos.caso}
          href={enlaceViaje(reporte.casoId)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Abrir el viaje ${reporte.casoId} en el operador`}
        >
          #{reporte.casoId}
        </a>
        {etapa === "cerrado" ? (
          <span className={estilos.edad} title="Tiempo de resolución">
            {duracion(tiempoResolucionMinutos(reporte))}
          </span>
        ) : minutos !== null ? (
          <span
            className={`${estilos.edad} ${
              minutos >= 3 * UN_DIA ? estilos.edadVencida : minutos >= UN_DIA ? estilos.edadDemorada : ""
            }`}
            title="Tiempo abierto desde la última apertura"
          >
            {compacto(minutos)}
          </span>
        ) : null}
      </div>

      <p className={`${estilos.texto} ${desplegada ? "" : estilos.textoRecortado}`}>
        <TextoConMenciones texto={texto} yo={yo} />
      </p>

      {reporte.driver || reporte.seller ? (
        <p className={estilos.responsables}>
          {reporte.driver ? (
            <span>
              <span className={estilos.rotulo}>Driver</span> {reporte.driver}
            </span>
          ) : null}
          {reporte.seller ? (
            <span>
              <span className={estilos.rotulo}>Seller</span> <NombreTienda nombre={reporte.seller} />
            </span>
          ) : null}
        </p>
      ) : null}

      {desplegada ? <Detalle reporte={reporte} urls={urls} /> : null}

      <div className={estilos.pie}>
        {etapa === "cerrado" ? (
          <span className={estilos.firma}>
            {reporte.atendidoPor ? <Avatar correo={reporte.atendidoPor} /> : null}
            <span className={estilos.nombre}>
              Cerró {reporte.atendidoPor ? nombreDePersona(reporte.atendidoPor) : "—"}
            </span>
          </span>
        ) : (
          <label
            className={`${estilos.tomar} ${tomado ? estilos.tomarActivo : ""}`}
            title={
              tomado && !puedeSoltar
                ? `Solo ${nombreDePersona(reporte.tomadoPor)} o un admin puede soltarlo`
                : tomado
                  ? "Desmarcar para soltar el caso"
                  : "Marcar para tomar el caso"
            }
          >
            <input
              type="checkbox"
              checked={tomado}
              disabled={ocupado || (tomado && !puedeSoltar)}
              onChange={(e) => alTomar(e.target.checked)}
            />
            {tomado && reporte.tomadoPor ? <Avatar correo={reporte.tomadoPor} /> : null}
            <span className={estilos.nombre}>
              {tomado ? (mio ? "Tomado por vos" : nombreDePersona(reporte.tomadoPor)) : "Tomar"}
            </span>
          </label>
        )}

        <div className={estilos.acciones} data-noimprimir>
          {reporte.archivos.length > 0 && !desplegada ? (
            <span className={estilos.clips} title="Adjuntos">
              <IconoClip />
              {reporte.archivos.length}
            </span>
          ) : null}
          <BotonIcono
            etiqueta={desplegada ? "Ocultar detalle" : "Ver detalle"}
            onClick={() => setDesplegada((valor) => !valor)}
          >
            <IconoChevron className={desplegada ? estilos.girado : ""} />
          </BotonIcono>
          <BotonIcono etiqueta="Editar reporte" onClick={alEditar}>
            <IconoLapiz />
          </BotonIcono>
          {etapa === "cerrado" ? (
            <BotonIcono
              etiqueta="Reabrir"
              onClick={() => alCambiarEstado("abierto")}
              disabled={ocupado}
            >
              <IconoReabrir />
            </BotonIcono>
          ) : (
            <BotonIcono
              etiqueta="Cerrar reporte"
              className={estilos.iconoCerrar}
              onClick={() => alCambiarEstado("cerrado")}
              disabled={ocupado}
            >
              <IconoCheck />
            </BotonIcono>
          )}
        </div>
      </div>
    </article>
  );
}

function Detalle({ reporte, urls }: { reporte: Seguimiento; urls: Record<string, string> }) {
  return (
    <dl className={estilos.detalle}>
      <div>
        <dt>Reportó</dt>
        <dd>
          {nombreDePersona(reporte.creadoPor)} · {cuando(reporte.creado)}
        </dd>
      </div>
      {reporte.tomadoPor ? (
        <div>
          <dt>Tomó</dt>
          <dd>
            {nombreDePersona(reporte.tomadoPor)} · {cuando(reporte.tomadoEn)}
          </dd>
        </div>
      ) : null}
      {reporte.estado === "cerrado" ? (
        <div>
          <dt>Cerró</dt>
          <dd>
            {nombreDePersona(reporte.atendidoPor)} · {cuando(reporte.atendidoEn)}
          </dd>
        </div>
      ) : null}
      {reporte.archivos.length > 0 ? (
        <div>
          <dt>Adjuntos</dt>
          <dd className={estilos.adjuntos}>
            {reporte.archivos.map((ruta, indice) => {
              const url = urls[ruta];
              // Un adjunto que no se pudo firmar se muestra igual: que exista y
              // no abra es información, y esconderlo la pierde.
              return url ? (
                <a
                  key={ruta}
                  className={estilos.adjunto}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconoClip />
                  {indice + 1}
                </a>
              ) : (
                <span key={ruta} className={estilos.adjuntoRoto} title={ruta}>
                  no disponible
                </span>
              );
            })}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Resalta cada `@alias`; la mención a quien mira va más marcada. */
function TextoConMenciones({ texto, yo }: { texto: string; yo: string | null }) {
  const miAlias = yo ? aliasDeCorreo(yo) : null;
  return (
    <>
      {tramosConMenciones(texto).map((tramo, indice) =>
        tramo.alias ? (
          <mark
            key={indice}
            className={`${estilos.mencion} ${tramo.alias === miAlias ? estilos.mencionMia : ""}`}
          >
            {tramo.texto}
          </mark>
        ) : (
          tramo.texto
        ),
      )}
    </>
  );
}

function Avatar({ correo }: { correo: string }) {
  return (
    <span
      className={estilos.avatar}
      style={{ background: colorDePersona(correo) }}
      title={nombreDePersona(correo)}
      aria-hidden="true"
    >
      {inicialesDePersona(correo)}
    </span>
  );
}

function BotonIcono({
  etiqueta,
  onClick,
  disabled,
  className = "",
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${estilos.icono} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
    >
      {children}
    </button>
  );
}

/** «12 m», «5 h», «3 d»: en una tarjeta alcanza con el orden de magnitud. */
function compacto(minutos: number): string {
  if (minutos < 60) return `${minutos} m`;
  if (minutos < UN_DIA) return `${Math.floor(minutos / 60)} h`;
  return `${Math.floor(minutos / UN_DIA)} d`;
}

/** Fecha y hora visible en Argentina. */
function cuando(fecha: Date | null): string {
  return fechaHoraArgentina(fecha);
}

function IconoChevron({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoClip() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M10.5 5.5 6 10a2 2 0 0 0 2.8 2.8l4.7-4.7a3.5 3.5 0 0 0-5-5L3.5 8" strokeLinecap="round" />
    </svg>
  );
}

function IconoLapiz() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M11 2.5 13.5 5 6 12.5H3.5V10Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m3 8.5 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoReabrir() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5v2.5h2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
