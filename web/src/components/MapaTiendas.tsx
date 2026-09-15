"use client";

import { useCallback, useMemo, useState } from "react";
import { COLOR_DRIVER, estadoPosicion, proyectarEn, type Ventana } from "@/lib/tracker";
import { REFRESCO_TRAFICO_MS } from "@/lib/trafico";
import type { PosicionDriver } from "@/lib/posiciones-datos";
import {
  COLOR_TIPO,
  ETIQUETA_TIPO,
  enlaceAGoogleMaps,
  filtrarLugares,
  type Lugar,
} from "@/lib/tiendas";
import { responsableDe } from "@/lib/responsables";
import { encuadreDe, LienzoMapa } from "./LienzoMapa";
import { useIndiceTiendas } from "./ColorTiendas";
import { CapaLluvia, ControlLluvia, useLluvia } from "./Lluvia";
import { AtribucionTomTom, CapaTomTom, ControlesTomTom, useCiclo } from "./Trafico";
import estilos from "./live-tracker.module.css";

/**
 * El color de un punto: el de su dueño si la tienda está repartida, el de su
 * tipo si no. La bodega no es de nadie y conserva el suyo. Tienda y dropoff
 * se siguen distinguiendo por el relleno, hueco o lleno.
 */
function colorDe(lugar: Lugar, indice: Record<string, string>): string {
  if (lugar.tipo === "BODEGA") return COLOR_TIPO.BODEGA;
  return responsableDe(indice, lugar.nombre)?.color ?? COLOR_TIPO[lugar.tipo];
}

/** El grupo dicho con palabras, para que el color no sea el único portador del dato. */
function grupoDe(lugar: Lugar, indice: Record<string, string>): string {
  const responsable = responsableDe(indice, lugar.nombre);
  return responsable ? ` · Grupo ${responsable.grupo} (${responsable.nombre})` : "";
}

/**
 * Dónde está cada tienda, cada dropoff y la bodega.
 *
 * Es una pantalla informativa y punto: no tiene día, no tiene jornada y no
 * depende del live tracker. Lo que responde es «¿dónde queda este comercio?»,
 * que es una pregunta que se hace suelta, casi siempre con un id o un nombre a
 * mano.
 *
 * Por eso el buscador filtra en el navegador sobre las sesenta y cinco filas
 * que ya llegaron: escribir tiene que ir a la velocidad de los dedos, no a la
 * de la red.
 */
export function MapaTiendas({
  lugares,
  ventana,
  claveTomTom,
  posiciones,
  children,
}: {
  lugares: Lugar[];
  ventana: Ventana;
  /** Sin clave no se ofrecen calles ni tráfico. */
  claveTomTom: string | null;
  /**
   * Las posiciones de los repartidores, o `null` si quien mira no tiene
   * permiso —el rol comercial no ve el live tracker— o no se pudieron leer.
   */
  posiciones: PosicionDriver[] | null;
  /** Los polígonos de cobertura, dibujados en el servidor. */
  children: React.ReactNode;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const indice = useIndiceTiendas();

  /*
   * Las cuatro capas arrancan apagadas. Tres salen a internet —lluvia, calles,
   * tráfico— y la pantalla tiene que servir sin pedirle nada a nadie; la de
   * repartidores no, pero encendida por defecto llenaría de pines un mapa cuya
   * pregunta es «dónde queda este comercio».
   */
  const lluvia = useLluvia(ventana);
  const [verCalles, setVerCalles] = useState(false);
  const [verTrafico, setVerTrafico] = useState(false);
  const cicloTrafico = useCiclo(verTrafico, REFRESCO_TRAFICO_MS);
  const [verDrivers, setVerDrivers] = useState(false);

  const visibles = useMemo(() => filtrarLugares(lugares, busqueda), [lugares, busqueda]);

  const proyectar = useCallback(
    (lat: number, lon: number) => proyectarEn({ lat, lon }, ventana),
    [ventana],
  );

  /*
   * El cuadro se ajusta a lo que quedó del filtro, y se cierra sobre uno solo
   * cuando hay uno elegido. Buscar «powerbatt» y que el mapa siga mostrando la
   * ciudad entera obligaría a buscar el punto a ojo, que es justamente lo que
   * el buscador viene a evitar.
   */
  const encuadrar = useCallback(() => {
    const uno = elegido ? visibles.find((l) => l.clave === elegido) : null;
    const puntos = (uno ? [uno] : visibles).map((l) => proyectar(l.lat, l.lon));

    /*
     * Un punto solo no tiene ancho, así que el cuadro sale del piso que pone
     * `encuadreDe` -un 6% de la ventana- y el margen lo multiplica. Con 0,5
     * queda el doble de ese piso: lo justo para ver contra qué zona cae el
     * punto sin perderlo de vista.
     *
     * Tuvo 3 y estaba mal: multiplicaba el piso por siete y elegir un punto
     * terminaba mostrando más ciudad que el filtro del que venía, o sea que
     * hacer clic para mirarlo de cerca alejaba.
     */
    return encuadreDe(puntos, ventana, uno ? 0.5 : 0.25);
  }, [visibles, elegido, proyectar, ventana]);

  return (
    <div className={estilos.pantalla}>
      <aside className={estilos.panel} aria-label="Tiendas y dropoff">
        <div className={estilos.panelBarra}>
          <input
            className={estilos.buscador}
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setElegido(null);
            }}
            placeholder="Buscar por nombre o ID"
            aria-label="Buscar tienda por nombre o ID"
            type="search"
          />
        </div>

        <p className={estilos.marca}>
          {visibles.length === lugares.length
            ? `${lugares.length} puntos cargados`
            : `${visibles.length} de ${lugares.length}`}
        </p>

        <ul className={estilos.lista}>
          {visibles.length === 0 ? (
            <li className={estilos.vacio}>Ningún punto coincide con la búsqueda.</li>
          ) : (
            visibles.map((lugar) => (
              <li
                key={lugar.clave}
                className={`${estilos.paquete} ${elegido === lugar.clave ? estilos.paqueteActivo : ""}`}
              >
                <button
                  type="button"
                  className={estilos.paqueteFondo}
                  aria-pressed={elegido === lugar.clave}
                  onClick={() => setElegido(elegido === lugar.clave ? null : lugar.clave)}
                >
                  <span className={estilos.soloLectores}>
                    Ver en el mapa {lugar.nombre}
                  </span>
                </button>

                <span
                  className={estilos.chip}
                  style={{ background: colorDe(lugar, indice) }}
                  aria-hidden="true"
                />

                <span className={estilos.paqueteTexto}>
                  <a
                    className={estilos.paqueteId}
                    href={enlaceAGoogleMaps(lugar)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Abrir ${lugar.nombre} en Google Maps`}
                  >
                    {lugar.nombre}
                  </a>
                  <span className={estilos.paqueteDir}>
                    {lugar.id != null ? `#${lugar.id}` : "sin ID en el mapa"}
                    {lugar.compartido ? " · ID compartido" : ""}
                    {grupoDe(lugar, indice)}
                    {` · ${lugar.lat}, ${lugar.lon}`}
                  </span>
                </span>

                <span className={estilos.tag}>{ETIQUETA_TIPO[lugar.tipo]}</span>
              </li>
            ))
          )}
        </ul>
      </aside>

      <div className={estilos.derecha}>
        {/*
          Las casillas van arriba del mapa y no en el panel: dicen qué se ve en
          el mapa, y el panel queda para buscar comercios.
        */}
        <div className={estilos.barraMapa}>
          <div className={estilos.barraMapaCasillas} role="group" aria-label="Capas del mapa">
            <label className={estilos.filtro}>
              <input
                type="checkbox"
                checked={lluvia.activa}
                onChange={(e) => lluvia.prender(e.target.checked)}
              />
              Lluvia
            </label>

            {claveTomTom ? (
              <ControlesTomTom
                calles={verCalles}
                trafico={verTrafico}
                onCalles={setVerCalles}
                onTrafico={setVerTrafico}
              />
            ) : null}

            {posiciones ? (
              <label className={estilos.filtro}>
                <input
                  type="checkbox"
                  checked={verDrivers}
                  onChange={(e) => setVerDrivers(e.target.checked)}
                />
                Repartidores ({posiciones.length})
              </label>
            ) : null}
          </div>

          {lluvia.activa || (claveTomTom && (verCalles || verTrafico)) ? (
            <div className={estilos.barraMapaDetalle}>
              {lluvia.activa ? <ControlLluvia estado={lluvia} /> : null}
              {claveTomTom && (verCalles || verTrafico) ? (
                <AtribucionTomTom trafico={verTrafico} />
              ) : null}
            </div>
          ) : null}
        </div>

        <LienzoMapa
          ventana={ventana}
          clave={`${busqueda}|${elegido ?? ""}`}
          encuadrar={encuadrar}
          etiqueta={`Mapa con ${visibles.length} punto${visibles.length === 1 ? "" : "s"} de entrega y colecta`}
          fondo={children}
          fondoSobreMapa={Boolean(claveTomTom && verCalles)}
          debajo={
            claveTomTom && verCalles
              ? (lienzo) => (
                  <CapaTomTom capa="calles" clave={claveTomTom} ventana={ventana} lienzo={lienzo} />
                )
              : undefined
          }
        >
          {(k, lienzo) => (
            <>
              {/* Mismo orden que el live tracker: lluvia y tráfico por debajo
                  de los puntos, que son lo que se toca. */}
              {lluvia.activa ? <CapaLluvia estado={lluvia} ventana={ventana} /> : null}
              {claveTomTom && verTrafico ? (
                <CapaTomTom
                  capa="trafico"
                  clave={claveTomTom}
                  ventana={ventana}
                  lienzo={lienzo}
                  ciclo={cicloTrafico}
                />
              ) : null}

              {visibles.map((lugar) => (
                <MarcaLugar
                  key={lugar.clave}
                  lugar={lugar}
                  punto={proyectar(lugar.lat, lugar.lon)}
                  color={colorDe(lugar, indice)}
                  grupo={grupoDe(lugar, indice)}
                  k={k}
                  elegido={elegido === lugar.clave}
                  onElegir={() => setElegido(elegido === lugar.clave ? null : lugar.clave)}
                />
              ))}

              {/* Los repartidores al final: son lo que se mueve, y un pin
                  tapado por una tienda no se encuentra. */}
              {posiciones && verDrivers
                ? posiciones.map((driver) => (
                    <PinRepartidor
                      key={driver.id}
                      driver={driver}
                      punto={proyectar(driver.lat, driver.lon)}
                      k={k}
                    />
                  ))
                : null}
            </>
          )}
        </LienzoMapa>
      </div>
    </div>
  );
}

/**
 * Un punto del mapa. La bodega en rombo, el resto en círculo.
 *
 * Los tipos son tres y se distinguen por color, que a este tamaño alcanza. La
 * bodega es la excepción y lleva forma propia porque no es una categoría más:
 * es el punto contra el que se ubica todo lo demás.
 */
function MarcaLugar({
  lugar,
  punto,
  color,
  grupo,
  k,
  elegido,
  onElegir,
}: {
  lugar: Lugar;
  punto: { x: number; y: number };
  color: string;
  grupo: string;
  k: number;
  elegido: boolean;
  onElegir: () => void;
}) {
  const r = (lugar.tipo === "BODEGA" ? 11 : 8) * k;

  return (
    <g
      transform={`translate(${punto.x} ${punto.y})`}
      className={estilos.destino}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onElegir();
      }}
    >
      <title>
        {`${lugar.nombre}${lugar.id != null ? ` · #${lugar.id}` : ""}\n` +
          `${ETIQUETA_TIPO[lugar.tipo]}${lugar.compartido ? " · el ID tiene otra sucursal" : ""}${grupo}`}
      </title>

      {elegido ? (
        <circle r={r * 2.4} fill="none" stroke={color} strokeWidth={2.2 * k} />
      ) : null}

      {lugar.tipo === "BODEGA" ? (
        <path
          d={`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`}
          fill="var(--surface, #fff)"
          stroke={color}
          strokeWidth={2.4 * k}
          strokeLinejoin="round"
        />
      ) : (
        <circle
          r={r}
          fill={lugar.tipo === "DROPOFF" ? color : "var(--surface, #fff)"}
          stroke={color}
          strokeWidth={2.2 * k}
        />
      )}
    </g>
  );
}

/**
 * Un repartidor sobre el mapa de tiendas: el mismo pin negro con moto del live
 * tracker, sin el color de identidad —acá no hay rutas que distinguir— y
 * lavado cuando la posición es vieja.
 */
function PinRepartidor({
  driver,
  punto,
  k,
}: {
  driver: PosicionDriver;
  punto: { x: number; y: number };
  k: number;
}) {
  const r = 12 * k;

  /*
   * La antigüedad se recalcula contra el reloj de quien mira, no se toma la
   * que calculó la base al cargar la página. Con tiendas abierta una hora, el
   * número de la carga seguiría diciendo «hace 3 min».
   *
   * Llamar al reloj durante el render es seguro acá: los pines solo existen
   * después de prender la casilla, así que nunca forman parte del HTML del
   * servidor y no pueden desencontrarse con él al hidratar.
   */
  const { estado, minutos } = estadoPosicion(driver.lat, driver.lon, driver.fecha);
  const antiguedad =
    minutos == null
      ? "posición sin fecha"
      : minutos < 60
        ? `hace ${minutos} min`
        : `hace ${Math.floor(minutos / 60)} h`;

  return (
    <g
      transform={`translate(${punto.x} ${punto.y})`}
      opacity={estado === "VIEJA" || estado === "SIN_FECHA" ? 0.45 : 1}
      pointerEvents="none"
    >
      <title>{`${driver.nombre} · #${driver.id} · última posición conocida ${antiguedad}`}</title>
      <circle r={r + 2.5 * k} fill="var(--surface, #fff)" />
      <circle r={r} fill={COLOR_DRIVER} />
      <g
        transform={`scale(${k * 0.72}) translate(-12 -12)`}
        fill="none"
        stroke="var(--surface, #fff)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6.5" cy="15.5" r="3.4" />
        <circle cx="17.5" cy="15.5" r="3.4" />
        <path d="M6.5 15.5h4l3-5h4" />
        <path d="M13 8.5h3l1.5 7" />
      </g>
    </g>
  );
}
