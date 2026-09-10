"use client";

import { useCallback, useMemo, useState } from "react";
import { proyectarEn, type Ventana } from "@/lib/tracker";
import {
  COLOR_TIPO,
  ETIQUETA_TIPO,
  enlaceAGoogleMaps,
  filtrarLugares,
  type Lugar,
} from "@/lib/tiendas";
import { encuadreDe, LienzoMapa } from "./LienzoMapa";
import estilos from "./live-tracker.module.css";

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
  children,
}: {
  lugares: Lugar[];
  ventana: Ventana;
  /** Los polígonos de cobertura, dibujados en el servidor. */
  children: React.ReactNode;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);

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
                  style={{ background: COLOR_TIPO[lugar.tipo] }}
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
        <LienzoMapa
          ventana={ventana}
          clave={`${busqueda}|${elegido ?? ""}`}
          encuadrar={encuadrar}
          etiqueta={`Mapa con ${visibles.length} punto${visibles.length === 1 ? "" : "s"} de entrega y colecta`}
          fondo={children}
        >
          {(k) =>
            visibles.map((lugar) => (
              <MarcaLugar
                key={lugar.clave}
                lugar={lugar}
                punto={proyectar(lugar.lat, lugar.lon)}
                k={k}
                elegido={elegido === lugar.clave}
                onElegir={() => setElegido(elegido === lugar.clave ? null : lugar.clave)}
              />
            ))
          }
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
  k,
  elegido,
  onElegir,
}: {
  lugar: Lugar;
  punto: { x: number; y: number };
  k: number;
  elegido: boolean;
  onElegir: () => void;
}) {
  const r = (lugar.tipo === "BODEGA" ? 11 : 8) * k;
  const color = COLOR_TIPO[lugar.tipo];

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
          `${ETIQUETA_TIPO[lugar.tipo]}${lugar.compartido ? " · el ID tiene otra sucursal" : ""}`}
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
