"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  colorDeDriver,
  entregadosPorHora,
  enlaceAlOperador,
  estadoDemoraDriver,
  estadosDelSistemaSinCategoria,
  normalizarBusqueda,
  paqueteCoincideConBusqueda,
  paqueteUnicoDeBusqueda,
  porcentajeEntregado,
  type Sincronizacion,
  type EstadoDemora,
  type Ventana,
} from "@/lib/tracker";
import type {
  DatosDelTracker,
  DriverDelTracker,
  PaqueteDelTracker,
} from "@/lib/tracker-datos";
import { etiquetaPaquete, MapaTracker } from "./MapaTracker";
import { ControlLluvia, useLluvia } from "./Lluvia";
import estilos from "./live-tracker.module.css";

/**
 * La pantalla del live tracker: panel de repartidores a la izquierda, mapa a la
 * derecha.
 *
 * Todo el estado de trabajo —la selección, el buscador, el filtro, el encuadre—
 * vive acá adentro y no en la URL ni en el servidor. Es lo que hace que
 * actualizar no lo pierda: los botones traen datos nuevos por `fetch` y
 * reemplazan solamente `datos`, así que el resto de la pantalla ni se entera.
 *
 * Arranca sin nadie seleccionado a propósito. Con veinte repartidores y sus
 * paradas encima, el mapa completo no dice nada; la pantalla es útil desde que
 * alguien elige a quién quiere mirar.
 */

type Sync = "posiciones" | "paquetes";

type Aviso = { tono: "ok" | "error"; texto: string };
type OrdenLista = "porcentaje" | "total" | "entregados" | "actualizacion" | "demora";
type DireccionOrden = "desc" | "asc";

export function LiveTracker({
  inicial,
  ventana,
  hayFlujoPosiciones,
  hayFlujoPaquetes,
  children,
}: {
  inicial: DatosDelTracker;
  ventana: Ventana;
  hayFlujoPosiciones: boolean;
  hayFlujoPaquetes: boolean;
  /** Los polígonos de cobertura, dibujados en el servidor. */
  children: React.ReactNode;
}) {
  const [datos, setDatos] = useState(inicial);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenLista>("porcentaje");
  const [direccionOrden, setDireccionOrden] = useState<DireccionOrden>("desc");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  /*
   * La ruta propuesta arranca apagada, y no es una preferencia de estilo.
   *
   * El orden que manda es el del sistema —el que el repartidor tiene en su
   * app— y la propuesta es un cálculo de este tablero. Encendida por defecto,
   * alguien la leería como la ruta asignada y le diría a un repartidor que va
   * en el orden equivocado. Prendida a mano, se sabe lo que se está mirando.
   */
  const [mostrarPropuesta, setMostrarPropuesta] = useState(false);
  const lluvia = useLluvia(ventana);
  const [paqueteActivo, setPaqueteActivo] = useState<number | null>(null);
  const [paqueteBuscado, setPaqueteBuscado] = useState<number | null>(null);
  const [poligonoActivo, setPoligonoActivo] = useState<{ nombre: string; zona: string } | null>(null);
  const [corriendo, setCorriendo] = useState<Sync | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [recordatorios, setRecordatorios] = useState<Record<number, number>>({});

  /*
   * El candado del doble clic.
   *
   * `corriendo` deshabilita los botones, pero el estado de React se aplica en
   * el siguiente render: dos clics muy seguidos entran los dos antes de que el
   * botón se apague. La ref cambia en el acto y corta el segundo.
   */
  const enVuelo = useRef(false);

  const demoras = useMemo(
    () =>
      new Map(
        datos.drivers.map((driver) => [
          driver.id,
          estadoDemoraDriver(driver, new Date(ahora)),
        ]),
      ),
    [datos.drivers, ahora],
  );

  const filtrados = useMemo(() => {
    const texto = normalizarBusqueda(busqueda);
    const coinciden = texto
      ? datos.drivers.filter(
          (d) =>
            normalizarBusqueda(d.nombre).includes(texto) ||
            String(d.id).includes(texto) ||
            d.paquetes.some((p) => paqueteCoincideConBusqueda(p, texto)),
        )
      : datos.drivers;
    return [...coinciden].sort((a, b) =>
      compararDrivers(a, b, orden, direccionOrden, ahora),
    );
  }, [datos.drivers, busqueda, orden, direccionOrden, ahora]);

  const elegidos = useMemo(
    () =>
      datos.drivers
        .filter((d) => seleccion.includes(d.id))
        .sort((a, b) => compararDrivers(a, b, orden, direccionOrden, ahora)),
    [datos.drivers, seleccion, orden, direccionOrden, ahora],
  );

  const demoraParaNotificar = useMemo(
    () =>
      datos.drivers
        .map((driver) => ({ driver, estado: demoras.get(driver.id) }))
        .filter(
          (item): item is { driver: DriverDelTracker; estado: EstadoDemora } =>
            item.estado?.notificar === true && (recordatorios[item.driver.id] ?? 0) <= ahora,
        )
        .sort(
          (a, b) =>
            b.estado.minutosSinMovimiento - a.estado.minutosSinMovimiento ||
            a.driver.nombre.localeCompare(b.driver.nombre, "es"),
        )[0] ?? null,
    [datos.drivers, demoras, recordatorios, ahora],
  );

  const paqueteSeleccionado = useMemo(
    () =>
      paqueteActivo == null
        ? null
        : datos.drivers
            .flatMap((driver) => driver.paquetes.map((paquete) => ({ paquete, driver })))
            .find(({ paquete }) => paquete.id_viaje === paqueteActivo) ?? null,
    [datos.drivers, paqueteActivo],
  );

  const paqueteEnMapa = paqueteActivo ?? paqueteBuscado;

  const seleccionarPaquete = useCallback((id: number | null) => {
    setPaqueteBuscado(null);
    setPaqueteActivo(id);
  }, []);

  const horas = useMemo(
    () => entregadosPorHora((elegidos.length > 0 ? elegidos : datos.drivers).flatMap((d) => d.paquetes)),
    [datos.drivers, elegidos],
  );

  const releer = useCallback(async () => {
    const respuesta = await fetch("/api/live-tracker/datos", { cache: "no-store" });
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !cuerpo?.ok) {
      throw new Error(cuerpo?.error ?? "No se pudo releer la jornada.");
    }
    /*
     * Se reemplazan los datos y nada más. La selección se conserva por id, así
     * que un repartidor que dejó de operar desaparece de la lista pero no
     * arrastra a los demás; y si vuelve, vuelve seleccionado.
     */
    setDatos(cuerpo.datos as DatosDelTracker);
  }, []);

  // La pantalla abierta envejece con el reloj y relee la base cada diez
  // minutos. n8n actualiza la foto cada treinta; este pulso hace que la alerta
  // aparezca sin exigir una recarga manual y que un recordatorio vuelva a hora.
  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(reloj);
  }, []);

  useEffect(() => {
    const refresco = window.setInterval(() => {
      releer()
        .then(() => setAhora(Date.now()))
        .catch(() => {});
    }, 10 * 60_000);
    return () => window.clearInterval(refresco);
  }, [releer]);

  async function sincronizar(cual: Sync) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setCorriendo(cual);
    setAviso(null);

    const ruta =
      cual === "posiciones"
        ? "/api/live-tracker/sync/drivers"
        : "/api/live-tracker/sync/shipments";

    try {
      const respuesta = await fetch(ruta, { method: "POST", cache: "no-store" });
      const cuerpo = await respuesta.json().catch(() => null);

      if (!respuesta.ok || !cuerpo?.ok) {
        setAviso({
          tono: "error",
          texto: cuerpo?.error ?? `La sincronización respondió ${respuesta.status}.`,
        });
        // Se relee igual: el flujo pudo haber guardado parte antes de fallar, y
        // mostrar lo que sí quedó es mejor que dejar la pantalla en el pasado.
        await releer().catch(() => {});
        return;
      }

      await releer();
      setAviso({ tono: "ok", texto: resumenEnPalabras(cual, cuerpo) });
    } catch {
      setAviso({ tono: "error", texto: "No se pudo completar la sincronización." });
    } finally {
      enVuelo.current = false;
      setCorriendo(null);
    }
  }

  return (
    <div className={estilos.pantalla}>
      {demoraParaNotificar ? (
        <AlertaDemora
          key={demoraParaNotificar.driver.id}
          driver={demoraParaNotificar.driver}
          estado={demoraParaNotificar.estado}
          puedeRegistrar={!datos.tablasFaltantes.includes("tracker_demoras")}
          onRecordar={() =>
            setRecordatorios((actuales) => ({
              ...actuales,
              [demoraParaNotificar.driver.id]: Date.now() + 10 * 60_000,
            }))
          }
          onGuardado={async () => {
            await releer();
            setAhora(Date.now());
          }}
        />
      ) : null}

      <aside className={estilos.panel} aria-label="Repartidores del día">
        <div className={estilos.panelBarra}>
          <input
            className={estilos.buscador}
            value={busqueda}
            onChange={(e) => {
              const valor = e.target.value;
              setBusqueda(valor);
              setPaqueteBuscado(null);

              const texto = normalizarBusqueda(valor);
              const coincideConDriver = datos.drivers.some(
                (driver) =>
                  normalizarBusqueda(driver.nombre).includes(texto) ||
                  String(driver.id).includes(texto),
              );
              if (!texto || coincideConDriver) return;

              const encontrado = paqueteUnicoDeBusqueda(datos.drivers, valor);
              setPaqueteBuscado(encontrado?.paquete.id_viaje ?? null);
              if (!encontrado) return;
              setSeleccion([encontrado.driver.id]);
              setPaqueteActivo(null);
              setPoligonoActivo(null);
            }}
            placeholder="Buscar repartidor, dirección o ID de viaje"
            aria-label="Buscar por repartidor, dirección o ID de viaje"
            type="search"
          />
        </div>

        <label className={estilos.ordenLista}>
          <span>Ordenar repartidores por</span>
          <span className={estilos.ordenControl}>
            <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenLista)}>
              <option value="porcentaje">% entregado</option>
              <option value="total">Paquetes totales</option>
              <option value="entregados">Paquetes entregados</option>
              <option value="actualizacion">Última actualización</option>
              <option value="demora">Demorados sin movimiento</option>
            </select>
            <button
              type="button"
              className={estilos.direccionOrden}
              onClick={() => setDireccionOrden((actual) => (actual === "desc" ? "asc" : "desc"))}
              aria-label={direccionOrden === "desc" ? "Orden descendente: mayor a menor" : "Orden ascendente: menor a mayor"}
              title={direccionOrden === "desc" ? "Mayor a menor" : "Menor a mayor"}
            >
              {direccionOrden === "desc" ? "↓" : "↑"}
            </button>
          </span>
        </label>

        <div className={estilos.acciones}>
          <button
            type="button"
            className={estilos.accion}
            onClick={() => setSeleccion(filtrados.map((d) => d.id))}
            disabled={filtrados.length === 0}
          >
            Seleccionar todos
          </button>
          <button
            type="button"
            className={estilos.accion}
            onClick={() => {
              setSeleccion([]);
              setPaqueteActivo(null);
              setPaqueteBuscado(null);
            }}
            disabled={seleccion.length === 0}
          >
            Limpiar selección
          </button>
        </div>

        <div className={estilos.acciones}>
          <button
            type="button"
            className={estilos.sync}
            onClick={() => sincronizar("posiciones")}
            disabled={corriendo !== null}
            title={
              hayFlujoPosiciones
                ? "Vuelve a leer la última posición conocida de cada repartidor. No toca los paquetes."
                : "No hay webhook configurado en N8N_WEBHOOKS_TRACKER_POSICIONES."
            }
          >
            {corriendo === "posiciones" ? "Actualizando posiciones…" : "Actualizar posiciones"}
          </button>
          <button
            type="button"
            className={estilos.sync}
            onClick={() => sincronizar("paquetes")}
            disabled={corriendo !== null}
            title={
              hayFlujoPaquetes
                ? "Vuelve a preguntar cuáles son los paquetes de las rutas de hoy. Descubre los que se agregaron después."
                : "No hay webhook configurado en N8N_WEBHOOKS_TRACKER_PAQUETES."
            }
          >
            {corriendo === "paquetes" ? "Actualizando paquetes…" : "Actualizar paquetes"}
          </button>
        </div>

        <div className={estilos.sincronizaciones}>
          <Marca titulo="Posiciones" sync={datos.sincronizaciones.drivers} />
          <Marca titulo="Paquetes" sync={datos.sincronizaciones.paquetes} />
        </div>

        {datos.pendientesAnteriores ? (
          <p className={estilos.aviso} role="status">
            Hasta las 15:00 de México se conserva la ruta del {datos.dia}. Las entregas cambian
            a verde sin salir del total; las posiciones son las últimas disponibles de los repartidores.
          </p>
        ) : null}

        {aviso ? (
          <p
            className={`${estilos.aviso} ${aviso.tono === "error" ? estilos.avisoError : ""}`}
            role={aviso.tono === "error" ? "alert" : "status"}
          >
            {aviso.texto}
          </p>
        ) : null}

        <label className={estilos.filtro}>
          <input
            type="checkbox"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
          />
          Mostrar cancelados y retirados de ruta
        </label>

        <label className={estilos.filtro}>
          <input
            type="checkbox"
            checked={mostrarPropuesta}
            onChange={(e) => setMostrarPropuesta(e.target.checked)}
          />
          Ver ruta propuesta por cercanía
        </label>

        <label className={estilos.filtro}>
          <input
            type="checkbox"
            checked={lluvia.activa}
            onChange={(e) => lluvia.prender(e.target.checked)}
          />
          Ver la lluvia sobre el mapa
        </label>

        {lluvia.activa ? <ControlLluvia estado={lluvia} /> : null}

        {datos.tablasFaltantes.includes("tracker_choferes") ? (
          /*
           * Decir qué falta y qué correr, en vez de dejar la pantalla a medias
           * sin explicación. Sin esto, un mapa sin domicilios se lee como «no
           * hay domicilios cargados» y no como «falta la migración».
           */
          <p className={estilos.aviso} role="status">
            Falta correr <code>supabase/migracion-06-lugares.sql</code>: no existe{" "}
            tracker_choferes. El mapa funciona igual, pero sin los domicilios de los
            repartidores.
          </p>
        ) : null}

        {datos.tablasFaltantes.includes("tracker_demoras") ? (
          <p className={`${estilos.aviso} ${estilos.avisoError}`} role="status">
            Falta correr <code>supabase/migracion-10-tracker-demoras.sql</code>. Las alertas se
            muestran, pero no se puede registrar el motivo hasta instalarla.
          </p>
        ) : null}

        <ul className={estilos.lista}>
          {filtrados.length === 0 ? (
            <li className={estilos.vacio}>
              {datos.drivers.length === 0
                ? "No hay repartidores con una ruta activa para hoy. Probá «Actualizar paquetes»."
                : "Ningún repartidor coincide con la búsqueda."}
            </li>
          ) : (
            filtrados.map((driver) => (
              <FilaDriver
                key={driver.id}
                driver={driver}
                elegido={seleccion.includes(driver.id)}
                demora={demoras.get(driver.id)?.demorado === true}
                onAlternar={() =>
                  setSeleccion((antes) =>
                    antes.includes(driver.id)
                      ? antes.filter((id) => id !== driver.id)
                      : [...antes, driver.id],
                  )
                }
              />
            ))
          )}
        </ul>

        {datos.huerfanos.length > 0 ? (
          <p className={estilos.huerfanos}>
            {datos.huerfanos.length} paquete{datos.huerfanos.length === 1 ? "" : "s"} de hoy sin
            repartidor asignado. No se dibujan en el mapa porque no hay a qué ruta atarlos.
          </p>
        ) : null}
      </aside>

      <div className={estilos.derecha}>
        <MapaTracker
          ventana={ventana}
          drivers={datos.drivers}
          seleccionados={seleccion}
          mostrarInactivos={mostrarInactivos}
          mostrarPropuesta={mostrarPropuesta}
          lluvia={lluvia}
          paqueteActivo={paqueteEnMapa}
          onPaquete={seleccionarPaquete}
          onPoligono={(poligono) => {
            setPaqueteActivo(null);
            setPaqueteBuscado(null);
            setPoligonoActivo(poligono);
          }}
        >
          {children}
        </MapaTracker>

        <EntregasPorHora horas={horas} acotado={elegidos.length > 0} />

        {elegidos.length > 0 ? (
          <div className={estilos.detalles}>
            {elegidos.map((driver) => (
              <DetalleDriver
                key={driver.id}
                driver={driver}
                mostrarInactivos={mostrarInactivos}
                mostrarPropuesta={mostrarPropuesta}
                paqueteActivo={paqueteEnMapa}
                onPaquete={seleccionarPaquete}
              />
            ))}
          </div>
        ) : null}
      </div>

      {paqueteSeleccionado ? (
        <DetallePaqueteModal
          key={paqueteSeleccionado.paquete.id_viaje}
          paquete={paqueteSeleccionado.paquete}
          driver={paqueteSeleccionado.driver}
          onCerrar={() => setPaqueteActivo(null)}
        />
      ) : null}

      {poligonoActivo ? (
        <DetallePoligono poligono={poligonoActivo} onCerrar={() => setPoligonoActivo(null)} />
      ) : null}
    </div>
  );
}

function FilaDriver({
  driver,
  elegido,
  demora,
  onAlternar,
}: {
  driver: DriverDelTracker;
  elegido: boolean;
  demora: boolean;
  onAlternar: () => void;
}) {
  const color = colorDeDriver(driver.id);
  const { resumen } = driver;

  return (
    <li>
      <label
        className={`${estilos.fila} ${elegido ? estilos.filaElegida : ""} ${demora ? estilos.filaDemorada : ""}`}
      >
        <input type="checkbox" checked={elegido} onChange={onAlternar} />
        <span className={estilos.chip} style={{ background: color }} aria-hidden="true" />
        <span className={estilos.filaTexto}>
          <span className={estilos.filaNombre}>{driver.nombre}</span>
          <span className={estilos.filaDato}>
            #{driver.id} · {resumen.enRuta} paq. ·{" "}
            {porcentajeEntregado(resumen) == null
              ? "sin ruta"
              : `${Math.round(porcentajeEntregado(resumen) as number)}% entregado`}
          </span>
        </span>
        <span
          className={`${estilos.pastilla} ${estilos[`pos${driver.estadoPosicion}`] ?? ""}`}
          title={`Última posición: ${textoAntiguedad(driver)}`}
        >
          {textoCorto(driver)}
        </span>
      </label>
    </li>
  );
}

function compararDrivers(
  a: DriverDelTracker,
  b: DriverDelTracker,
  orden: OrdenLista,
  direccion: DireccionOrden,
  ahora: number,
): number {
  let diferencia = 0;
  if (orden === "porcentaje") {
    diferencia = (porcentajeEntregado(b.resumen) ?? -1) - (porcentajeEntregado(a.resumen) ?? -1);
  } else if (orden === "total") {
    diferencia = b.resumen.enRuta - a.resumen.enRuta;
  } else if (orden === "entregados") {
    diferencia = b.resumen.entregados - a.resumen.entregados;
  } else if (orden === "demora") {
    const demoraA = estadoDemoraDriver(a, new Date(ahora));
    const demoraB = estadoDemoraDriver(b, new Date(ahora));
    diferencia =
      Number(demoraB.demorado) - Number(demoraA.demorado) ||
      demoraB.minutosSinMovimiento - demoraA.minutosSinMovimiento;
  } else {
    diferencia = fechaNumero(b.fechaPosicion) - fechaNumero(a.fechaPosicion);
  }
  return (direccion === "desc" ? diferencia : -diferencia) || a.nombre.localeCompare(b.nombre, "es");
}

function fechaNumero(fecha: string | null): number {
  if (!fecha) return -1;
  const numero = new Date(fecha).getTime();
  return Number.isFinite(numero) ? numero : -1;
}

function AlertaDemora({
  driver,
  estado,
  puedeRegistrar,
  onRecordar,
  onGuardado,
}: {
  driver: DriverDelTracker;
  estado: EstadoDemora;
  puedeRegistrar: boolean;
  onRecordar: () => void;
  onGuardado: () => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!confirmado) {
      setError("Confirmá que el driver informó que no continuará la ruta.");
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/live-tracker/demoras", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idDriver: driver.id,
          motivo,
          confirmaQueNoContinua: confirmado,
        }),
      });
      const cuerpo = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !cuerpo?.ok) {
        setError(cuerpo?.error ?? "No se pudo guardar el motivo.");
        return;
      }
      await onGuardado();
    } catch {
      setError("No se pudo guardar el motivo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section
      className={estilos.alertaDemora}
      role="alertdialog"
      aria-labelledby={`alerta-demora-${driver.id}`}
      aria-describedby={`detalle-demora-${driver.id}`}
    >
      <div className={estilos.alertaDemoraCabecera}>
        <div>
          <span className={estilos.alertaDemoraEyebrow}>Driver sin movimiento</span>
          <h2 id={`alerta-demora-${driver.id}`}>{driver.nombre}</h2>
        </div>
        <button type="button" onClick={onRecordar} disabled={guardando}>
          Recordar en 10 min
        </button>
      </div>

      <p id={`detalle-demora-${driver.id}`}>
        Lleva {estado.minutosSinMovimiento} min sin desplazarse y conserva {estado.paquetesSinVisitar}{" "}
        paquete{estado.paquetesSinVisitar === 1 ? "" : "s"} sin visitar. Comunicate con el driver.
      </p>

      <form onSubmit={guardar}>
        <label>
          <span>Motivo confirmado</span>
          <textarea
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            rows={3}
            minLength={5}
            maxLength={1000}
            required
            disabled={guardando || !puedeRegistrar}
            placeholder="Ej.: rotura de la moto, robo o choque. No completar si todavía puede continuar."
          />
        </label>

        <label className={estilos.confirmacionDemora}>
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(evento) => setConfirmado(evento.target.checked)}
            disabled={guardando || !puedeRegistrar}
          />
          Confirmo que el driver informó un inconveniente y no continuará la ruta.
        </label>

        {!puedeRegistrar ? (
          <p className={estilos.alertaDemoraError}>
            Falta instalar <code>web/supabase/migracion-10-tracker-demoras.sql</code>.
          </p>
        ) : null}
        {error ? <p className={estilos.alertaDemoraError}>{error}</p> : null}

        <button
          type="submit"
          className={estilos.guardarDemora}
          disabled={guardando || !puedeRegistrar || !confirmado || motivo.trim().length < 5}
        >
          {guardando ? "Guardando…" : "Registrar inconveniente y dejar de notificar"}
        </button>
      </form>
    </section>
  );
}

function EntregasPorHora({
  horas,
  acotado,
}: {
  horas: { hora: number; cantidad: number }[];
  acotado: boolean;
}) {
  const maximo = Math.max(1, ...horas.map((h) => h.cantidad));
  const total = horas.reduce((suma, h) => suma + h.cantidad, 0);

  return (
    <section className={estilos.horas} aria-label="Paquetes entregados por hora">
      <header className={estilos.horasHead}>
        <div>
          <h2>Entregados por hora</h2>
          <p>Hora de Ciudad de México{acotado ? " · repartidores seleccionados" : " · todas las rutas"}</p>
        </div>
        <strong>{total} entregados con horario</strong>
      </header>
      <div className={estilos.graficoHoras}>
        {horas.map(({ hora, cantidad }) => (
          <div
            key={hora}
            className={estilos.horaColumna}
            title={`${String(hora).padStart(2, "0")}:00 · ${cantidad} paquete${cantidad === 1 ? "" : "s"}`}
          >
            <span className={estilos.horaCantidad}>{cantidad || ""}</span>
            <span
              className={estilos.horaBarra}
              style={{ height: `${cantidad === 0 ? 2 : Math.max(8, (cantidad / maximo) * 100)}%` }}
            />
            <span className={estilos.horaEtiqueta}>{hora % 3 === 0 ? `${hora}h` : ""}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetalleDriver({
  driver,
  mostrarInactivos,
  mostrarPropuesta,
  paqueteActivo,
  onPaquete,
}: {
  driver: DriverDelTracker;
  mostrarInactivos: boolean;
  mostrarPropuesta: boolean;
  paqueteActivo: number | null;
  onPaquete: (id: number | null) => void;
}) {
  const color = colorDeDriver(driver.id);
  const { resumen } = driver;
  const estadosDelSistema = estadosDelSistemaSinCategoria(driver.paquetes);

  const visibles = driver.paquetes.filter(
    (p) =>
      mostrarInactivos ||
      p.id_viaje === paqueteActivo ||
      (p.clasificacion !== "CANCELADO" && p.clasificacion !== "RETIRADO_DE_RUTA"),
  );

  return (
    <section className={estilos.detalle} style={{ borderTopColor: color }}>
      <header className={estilos.detalleHead}>
        <span className={estilos.chip} style={{ background: color }} aria-hidden="true" />
        <h3 className={estilos.detalleTitulo}>{driver.nombre}</h3>
        <span className={estilos.detalleSub}>
          #{driver.id}
          {driver.rutas.length > 0 ? ` · ruta ${driver.rutas.join(", ")}` : ""}
          {driver.idReserva != null ? ` · reserva ${driver.idReserva}` : ""}
        </span>
      </header>

      <p className={estilos.detallePos}>
        {driver.posicion
          ? `Última posición conocida: ${textoAntiguedad(driver)}`
          : "Sin posición conocida: el dispositivo no reportó coordenadas válidas."}
        {driver.poligonos.length > 0 ? ` · ${driver.poligonos.join(" / ")}` : ""}
      </p>

      <p className={estilos.detallePos}>
        {driver.domicilio
          ? "Su domicilio está marcado en el mapa con una casita."
          : "Sin domicilio cargado en el mapa de choferes."}
      </p>

      {driver.demoraInformada ? (
        <p className={estilos.demoraInformada}>
          <strong>Inconveniente registrado:</strong> {driver.demoraInformada.motivo}
          <span>
            {` · ${driver.demoraInformada.registrado_por} · ${fechaHoraMexico(driver.demoraInformada.registrado_en)}`}
          </span>
        </p>
      ) : null}

      <div className={estilos.cifras}>
        <Cifra etiqueta="Paquetes" valor={resumen.enRuta} />
        <Cifra etiqueta="Entregados" valor={resumen.entregados} />
        <Cifra etiqueta="No entregados" valor={resumen.noEntregados} />
        <Cifra etiqueta="Pendientes" valor={resumen.pendientes} />
        <Cifra
          etiqueta="Avance"
          valor={resumen.avance == null ? "—" : `${Math.round(resumen.avance)}%`}
        />
        {estadosDelSistema.map(({ estado, cantidad }) => (
          <Cifra key={estado} etiqueta={estado} valor={cantidad} />
        ))}
        {resumen.cancelados + resumen.retirados > 0 ? (
          <Cifra etiqueta="Fuera de ruta" valor={resumen.cancelados + resumen.retirados} />
        ) : null}
      </div>

      <p className={estilos.proximo}>
        {driver.proximo ? (
          <>
            <strong>Próximo destino:</strong> <EnlaceViaje paquete={driver.proximo} />
            {driver.proximo.orden != null ? ` (orden ${driver.proximo.orden})` : ""}
            {driver.proximo.direccion ? ` — ${driver.proximo.direccion}` : ""}
          </>
        ) : resumen.pendientes === 0 ? (
          <>No le quedan paradas pendientes.</>
        ) : (
          /*
           * Decir por qué no hay próximo, en vez de mostrar el primero de la
           * lista. Sin orden declarado —o con dos pendientes compartiéndolo—
           * elegir uno sería inventar la secuencia, y el equipo lo tomaría como
           * un dato del sistema.
           */
          <>
            No se puede señalar el próximo destino:{" "}
            {driver.secuencia.sinOrden > 0 && driver.secuencia.duplicados > 0
              ? `${driver.secuencia.sinOrden} pendientes sin orden y ${driver.secuencia.duplicados} con el orden repetido.`
              : driver.secuencia.sinOrden > 0
                ? `${driver.secuencia.sinOrden} pendiente${driver.secuencia.sinOrden === 1 ? "" : "s"} sin orden asignado.`
                : `${driver.secuencia.duplicados} pendientes comparten el mismo orden.`}
          </>
        )}
      </p>

      {mostrarPropuesta ? <Propuesta driver={driver} /> : null}

      <ul className={estilos.paquetes}>
        {visibles.map((paquete) => (
          /*
           * Dos cosas para tocar en la misma fila: el id abre el viaje en
           * Rapiboy y el resto lo señala en el mapa.
           *
           * Por eso la fila no es un botón con el enlace adentro —un `<a>`
           * dentro de un `<button>` es HTML inválido y los lectores de
           * pantalla lo anuncian mal—. El botón va detrás, estirado sobre toda
           * la fila, y el enlace queda por encima. Se sigue pudiendo tocar
           * cualquier parte para seleccionar, y el id lleva al sistema.
           */
          <li
            key={paquete.id_viaje}
            className={`${estilos.paquete} ${paqueteActivo === paquete.id_viaje ? estilos.paqueteActivo : ""}`}
          >
            <button
              type="button"
              className={estilos.paqueteFondo}
              aria-pressed={paqueteActivo === paquete.id_viaje}
              onClick={() => onPaquete(paqueteActivo === paquete.id_viaje ? null : paquete.id_viaje)}
            >
              {/* Lo que se lee en voz alta al llegar al botón: el texto de la
                  fila está afuera, así que hay que nombrarlo acá. */}
              <span className={estilos.soloLectores}>
                Ver en el mapa el paquete {paquete.id_viaje}
                {paquete.direccion ? `, ${paquete.direccion}` : ""}
              </span>
            </button>

            <span className={estilos.paqueteOrden} style={{ color }}>
              {paquete.orden ?? "—"}
            </span>
            <span className={estilos.paqueteTexto}>
              <EnlaceViaje paquete={paquete} />
              <span className={estilos.paqueteDir}>{paquete.direccion ?? "sin dirección"}</span>
            </span>
            <span className={`${estilos.tag} ${estilos[`tag${paquete.clasificacion}`] ?? ""}`}>
              {etiquetaPaquete(paquete)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DetallePaqueteModal({
  paquete,
  driver,
  onCerrar,
}: {
  paquete: PaqueteDelTracker;
  driver: DriverDelTracker;
  onCerrar: () => void;
}) {
  const [verEvidencia, setVerEvidencia] = useState(false);
  const direccion = paquete.direccion;
  const maps =
    paquete.latitud_destino != null && paquete.longitud_destino != null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${paquete.latitud_destino},${paquete.longitud_destino}`)}`
      : direccion
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`
        : null;

  useEffect(() => {
    const cerrar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [onCerrar]);

  return (
    <div className={estilos.modalFondo} role="presentation" onMouseDown={onCerrar}>
      <section
        className={estilos.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-paquete-titulo"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={estilos.modalAcciones}>
          {maps ? (
            <a href={maps} target="_blank" rel="noopener noreferrer">
              Ir a Google Maps
            </a>
          ) : null}
          <a href={enlaceAlOperador(paquete.id_viaje)} target="_blank" rel="noopener noreferrer">
            Abrir en Rapiboy
          </a>
        </div>

        <header className={estilos.modalHead}>
          <span className={`${estilos.tag} ${estilos[`tag${paquete.clasificacion}`] ?? ""}`}>
            {etiquetaPaquete(paquete)}
          </span>
          <h2 id="detalle-paquete-titulo">Paquete #{paquete.id_viaje}</h2>
        </header>

        <dl className={estilos.modalDatos}>
          <DatoModal etiqueta="Dirección" valor={direccion} />
          <DatoModal etiqueta="Teléfono" valor={paquete.telefono} telefono />
          <DatoModal etiqueta="Ciudad" valor={paquete.ciudad} />
          <DatoModal etiqueta="Barrio" valor={paquete.barrio} />
          <DatoModal etiqueta="Código postal" valor={paquete.codigo_postal} />
          <DatoModal etiqueta="Tipo de destino" valor={paquete.es_laboral ? "Domicilio laboral" : "Domicilio particular"} />
          <DatoModal etiqueta="Polígono" valor={paquete.poligono} />
          <DatoModal etiqueta="Tienda" valor={paquete.tienda} />
          <DatoModal etiqueta="Repartidor" valor={driver.nombre} />
          <DatoModal etiqueta="Aclaraciones de dirección" valor={paquete.observacion_direccion} />
          <DatoModal etiqueta="Comentario del repartidor" valor={paquete.comentario_motoboy} />
          <DatoModal etiqueta="Comentario de estado" valor={paquete.comentario_estado} />
          <DatoModal etiqueta="Motivo no entregado" valor={paquete.motivo_no_entregado} />
          <DatoModal etiqueta="Motivo no devuelto" valor={paquete.motivo_no_devuelto} />
          <DatoModal etiqueta="Recibe" valor={paquete.nombre_recibe} />
          <DatoModal etiqueta="Ruta" valor={paquete.id_ruta == null ? null : String(paquete.id_ruta)} />
          <DatoModal etiqueta="Orden" valor={paquete.orden == null ? null : String(paquete.orden)} />
          <DatoModal etiqueta="Estado del sistema" valor={paquete.nombre_estado} />
          <DatoModal etiqueta="Programado" valor={fechaMexico(paquete.fecha_programado)} />
          <DatoModal etiqueta="Visita" valor={fechaMexico(paquete.fecha_visita)} />
          <DatoModal etiqueta="Último cambio" valor={fechaMexico(paquete.fecha_cambio_estado)} />
          <DatoModal etiqueta="ID de viaje" valor={String(paquete.id_viaje)} />
        </dl>

        {paquete.evidencia_foto ? (
          <div className={estilos.evidencia}>
            <button type="button" onClick={() => setVerEvidencia((antes) => !antes)}>
              {verEvidencia ? "Ocultar evidencia" : "Ver evidencia"}
            </button>
            {verEvidencia ? (
              <a href={paquete.evidencia_foto} target="_blank" rel="noopener noreferrer">
                {/* La última foto viene de FotoViaje, HistorialViaje o Viaje. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={paquete.evidencia_foto} alt={`Última evidencia del paquete ${paquete.id_viaje}`} />
              </a>
            ) : null}
          </div>
        ) : (
          <p className={estilos.sinEvidencia}>Este paquete no tiene una foto de evidencia cargada.</p>
        )}

        <button type="button" className={estilos.cerrarModal} onClick={onCerrar}>
          Cerrar
        </button>
      </section>
    </div>
  );
}

function DatoModal({ etiqueta, valor, telefono = false }: { etiqueta: string; valor?: string | null; telefono?: boolean }) {
  if (!valor) return null;
  return (
    <div>
      <dt>{etiqueta}</dt>
      <dd>{telefono ? <a href={`tel:${valor.replace(/\s+/g, "")}`}>{valor}</a> : valor}</dd>
    </div>
  );
}

function DetallePoligono({
  poligono,
  onCerrar,
}: {
  poligono: { nombre: string; zona: string };
  onCerrar: () => void;
}) {
  useEffect(() => {
    const cerrar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [onCerrar]);

  return (
    <div className={estilos.modalFondo} role="presentation" onMouseDown={onCerrar}>
      <section
        className={`${estilos.modal} ${estilos.modalPoligono}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-poligono-titulo"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={estilos.modalEyebrow}>Polígono del KMZ</span>
        <h2 id="detalle-poligono-titulo">{poligono.nombre}</h2>
        {poligono.zona && poligono.zona !== poligono.nombre ? <p>Zona: {poligono.zona}</p> : null}
        <button type="button" className={estilos.cerrarModal} onClick={onCerrar}>
          Cerrar
        </button>
      </section>
    </div>
  );
}

function fechaMexico(valor: string | null): string | null {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (!Number.isFinite(fecha.getTime())) return valor;
  return fecha.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * El id del viaje, que abre ese viaje en el sistema de Rapiboy.
 *
 * Es la salida del tablero hacia donde se opera: acá se mira, allá se toca.
 * Abre en otra pestaña porque nadie quiere perder la selección y el encuadre
 * del mapa por ir a ver un pedido; `noopener` va con eso, para que la pestaña
 * nueva no quede con una referencia a esta.
 */
function EnlaceViaje({ paquete }: { paquete: PaqueteDelTracker }) {
  return (
    <a
      className={estilos.paqueteId}
      href={enlaceAlOperador(paquete.id_viaje)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir el viaje ${paquete.id_viaje} en Rapiboy`}
      onClick={(e) => e.stopPropagation()}
    >
      #{paquete.id_viaje}
    </a>
  );
}

/**
 * La ruta propuesta por cercanía, en palabras.
 *
 * Dice de dónde sale —siempre la bodega—, cuántas paradas ordenó y cuánto
 * mide, y solo compara contra la ruta
 * real cuando el servidor pudo medir las dos sobre exactamente las mismas
 * paradas. Con órdenes faltantes o repetidos, los dos números medirían
 * recorridos distintos y el «ahorro» sería un artefacto de la resta: ahí no se
 * muestra ninguno.
 *
 * Los kilómetros son de línea recta, no de calle, y el texto lo dice. Un
 * número que parece de ruteo y no lo es termina en una promesa de horario que
 * nadie puede cumplir.
 */
function Propuesta({ driver }: { driver: DriverDelTracker }) {
  const { propuesta } = driver;

  if (!propuesta) {
    return (
      <p className={estilos.propuesta}>
        Con menos de dos paradas pendientes ubicables no hay nada que ordenar.
      </p>
    );
  }

  const ahorro =
    propuesta.kmDeclarado == null ? null : propuesta.kmDeclarado - propuesta.km;

  return (
    <p className={estilos.propuesta}>
      <strong>Ruta propuesta:</strong> desde la bodega, {propuesta.secuencia.length} paradas,{" "}
      {propuesta.km.toFixed(1)} km en línea recta.{" "}
      {ahorro == null ? (
        <>No se compara con el orden del sistema porque no cubren las mismas paradas.</>
      ) : ahorro > 0.1 ? (
        <>
          El orden del sistema mide {propuesta.kmDeclarado?.toFixed(1)} km: son{" "}
          {ahorro.toFixed(1)} km menos.
        </>
      ) : ahorro < -0.1 ? (
        <>
          El orden del sistema mide {propuesta.kmDeclarado?.toFixed(1)} km, o sea{" "}
          {Math.abs(ahorro).toFixed(1)} km menos que esta propuesta.
        </>
      ) : (
        <>Mide prácticamente lo mismo que el orden del sistema.</>
      )}{" "}
      Cada parada es la más cercana a la anterior. Es una sugerencia calculada,
      no la ruta asignada.
    </p>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number | string }) {
  return (
    <span className={estilos.cifra}>
      <span className={estilos.cifraValor}>{valor}</span>
      <span className={estilos.cifraEtiqueta}>{etiqueta}</span>
    </span>
  );
}

/** Cuándo corrió por última vez cada sincronización y cómo le fue. */
function Marca({ titulo, sync }: { titulo: string; sync: Sincronizacion | null }) {
  if (!sync) {
    return (
      <span className={estilos.marca}>
        <b>{titulo}</b> nunca
      </span>
    );
  }

  const hora = new Date(sync.fecha_fin ?? sync.fecha_inicio).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span className={`${estilos.marca} ${sync.estado === "failed" ? estilos.marcaFalla : ""}`}>
      <b>{titulo}</b>{" "}
      {sync.estado === "running"
        ? "corriendo…"
        : sync.estado === "failed"
          ? `falló ${hora}`
          : `${hora} · ${sync.registros_leidos}`}
    </span>
  );
}

function textoAntiguedad(driver: DriverDelTracker): string {
  if (!driver.posicion) return "sin posición";
  if (!driver.fechaPosicion) return "sin fecha";
  const minutos = driver.minutosSinActualizar;
  const hora = new Date(driver.fechaPosicion).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (minutos == null) return hora;
  return minutos < 60 ? `${hora} (hace ${minutos} min)` : `${hora} (hace ${Math.floor(minutos / 60)} h)`;
}

function fechaHoraMexico(fecha: string): string {
  const instante = new Date(fecha);
  if (!Number.isFinite(instante.getTime())) return "fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(instante);
}

function textoCorto(driver: DriverDelTracker): string {
  if (!driver.posicion) return "sin GPS";
  const minutos = driver.minutosSinActualizar;
  if (minutos == null) return "s/f";
  if (minutos < 60) return `${minutos}m`;
  return `${Math.floor(minutos / 60)}h`;
}

/**
 * El resultado de una corrida, en una frase.
 *
 * Se nombra lo que cambió y no solo cuántas filas se leyeron: «31 paquetes» no
 * dice nada, «1 nuevo» sí. Es la confirmación de que el paquete que alguien
 * agregó a la ruta hace un minuto ya está en el mapa.
 */
function resumenEnPalabras(cual: Sync, r: Record<string, number>): string {
  const partes: string[] = [];
  if (r.insertados) partes.push(`${r.insertados} nuevo${r.insertados === 1 ? "" : "s"}`);
  if (r.actualizados) partes.push(`${r.actualizados} actualizado${r.actualizados === 1 ? "" : "s"}`);
  if (r.desactivados) {
    partes.push(
      cual === "posiciones"
        ? `${r.desactivados} fuera de operación`
        : `${r.desactivados} fuera de ruta`,
    );
  }
  if (r.omitidos) partes.push(`${r.omitidos} omitido${r.omitidos === 1 ? "" : "s"}`);
  if (r.conError) partes.push(`${r.conError} con error`);

  const que = cual === "posiciones" ? "repartidores" : "paquetes";
  const leidos = `${r.leidos} ${que} leídos`;
  return partes.length === 0 ? `${leidos}. Sin cambios.` : `${leidos}: ${partes.join(", ")}.`;
}
