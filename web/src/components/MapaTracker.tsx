"use client";

import { useCallback, useMemo } from "react";
import {
  BODEGA,
  COLOR_CLASIFICACION,
  COLOR_DRIVER,
  colorDeClasificacion,
  colorDeDriver,
  proyectarEn,
  type Clasificacion,
  type Ventana,
} from "@/lib/tracker";
import { colorEstado, type ColorEstado } from "@/lib/estados";
import type { DriverDelTracker, PaqueteDelTracker } from "@/lib/tracker-datos";
import { encuadreDe, LienzoMapa } from "./LienzoMapa";
import estilos from "./live-tracker.module.css";

/** El relleno comunica el desenlace que informa el sistema. */
const COLOR_RELLENO_POR_ESTADO: Partial<Record<ColorEstado, string>> = {
  entregado: "var(--estado-entregado, #248a3d)",
  noentregado: "var(--estado-noentregado, #d70015)",
  devuelto: "var(--estado-devuelto, #0a7d6d)",
  devolucion: "var(--estado-noentregado, #d70015)",
  deposito: "var(--estado-noentregado, #d70015)",
  siniestrado: "var(--estado-noentregado, #d70015)",
  retirado: "var(--warning, #ffe600)",
};

/**
 * El mapa del live tracker: los repartidores, sus rutas y sus paradas.
 *
 * El encuadre movible y el fondo de cobertura los pone `LienzoMapa`, que es el
 * mismo lienzo que usa el mapa de tiendas. Acá solo vive lo que es del
 * tracker: qué se dibuja encima y qué tiene que quedar dentro del cuadro.
 */

export function MapaTracker({
  ventana,
  drivers,
  seleccionados,
  mostrarInactivos,
  mostrarPropuesta,
  paqueteActivo,
  onPaquete,
  onPoligono,
  children,
}: {
  ventana: Ventana;
  drivers: DriverDelTracker[];
  seleccionados: number[];
  /** Cancelados y retirados de ruta. Ocultos salvo que se pidan. */
  mostrarInactivos: boolean;
  /** La ruta alternativa por cercanía. Apagada salvo que se pida. */
  mostrarPropuesta: boolean;
  paqueteActivo: number | null;
  onPaquete: (idViaje: number | null) => void;
  onPoligono: (poligono: { nombre: string; zona: string }) => void;
  /** Los polígonos de cobertura, dibujados en el servidor. */
  children: React.ReactNode;
}) {
  const proyectar = useCallback(
    (lat: number, lon: number) => proyectarEn({ lat, lon }, ventana),
    [ventana],
  );

  const visibles = useMemo(
    () => drivers.filter((d) => seleccionados.includes(d.id)),
    [drivers, seleccionados],
  );

  /** Todo lo que hay que dejar dentro del cuadro para la selección actual. */
  const encuadrar = useCallback(() => {
    const puntos: { x: number; y: number }[] = [];

    // Con la propuesta prendida la línea arranca en la bodega, así que la
    // bodega tiene que entrar en el cuadro o la ruta se sale por un costado.
    if (mostrarPropuesta) puntos.push(proyectar(BODEGA.lat, BODEGA.lon));

    for (const driver of visibles) {
      if (driver.posicion) puntos.push(proyectar(driver.posicion.lat, driver.posicion.lon));

      // El domicilio entra en el encuadre: se pidió poder verlo al elegir al
      // repartidor, y un punto fuera de cuadro no se ve.
      if (driver.domicilio) puntos.push(proyectar(driver.domicilio.lat, driver.domicilio.lon));

      for (const p of driver.paquetes) {
        if (!mostrarInactivos && ocultable(p.clasificacion)) continue;
        if (p.latitud_destino != null && p.longitud_destino != null) {
          puntos.push(proyectar(p.latitud_destino, p.longitud_destino));
        }
      }
    }

    return encuadreDe(puntos, ventana);
  }, [visibles, mostrarInactivos, mostrarPropuesta, proyectar, ventana]);

  return (
    <>
      <LienzoMapa
        ventana={ventana}
        clave={`${seleccionados.join(",")}|${mostrarInactivos}|${mostrarPropuesta}`}
        encuadrar={encuadrar}
        etiqueta={
          visibles.length === 0
            ? "Mapa de la zona de reparto, sin repartidores seleccionados"
            : `Mapa con ${visibles.length} repartidor${visibles.length === 1 ? "" : "es"} en pantalla`
        }
        fondo={children}
        onPoligono={onPoligono}
      >
        {(k) => (
          <>
            {/* La bodega va una sola vez, no una por repartidor: es el mismo
                punto para todos y superponer diez copias solo engorda el SVG. */}
            {mostrarPropuesta && visibles.length > 0 ? (
              <MarcaBodega punto={proyectar(BODEGA.lat, BODEGA.lon)} k={k} />
            ) : null}

            {visibles.map((driver) => (
              <RutaDeDriver
                key={driver.id}
                driver={driver}
                k={k}
                mostrarInactivos={mostrarInactivos}
                mostrarPropuesta={mostrarPropuesta}
                paqueteActivo={paqueteActivo}
                onPaquete={onPaquete}
                proyectar={proyectar}
              />
            ))}
          </>
        )}
      </LienzoMapa>

      {visibles.length === 0 ? (
        <p className={estilos.vacioMapa}>Seleccioná uno o más drivers para ver su recorrido</p>
      ) : null}
    </>
  );
}

/** Cancelado y retirado salen del mapa salvo que se pidan expresamente. */
function ocultable(clasificacion: Clasificacion): boolean {
  return clasificacion === "CANCELADO" || clasificacion === "RETIRADO_DE_RUTA";
}

function RutaDeDriver({
  driver,
  k,
  mostrarInactivos,
  mostrarPropuesta,
  paqueteActivo,
  onPaquete,
  proyectar,
}: {
  driver: DriverDelTracker;
  k: number;
  mostrarInactivos: boolean;
  mostrarPropuesta: boolean;
  paqueteActivo: number | null;
  onPaquete: (id: number | null) => void;
  proyectar: (lat: number, lon: number) => { x: number; y: number };
}) {
  const color = colorDeDriver(driver.id);

  const conDestino = driver.paquetes.filter(
    (p) =>
      p.latitud_destino != null &&
      p.longitud_destino != null &&
      (mostrarInactivos || !ocultable(p.clasificacion)),
  );

  /*
   * La línea arranca en el repartidor y sigue por los pendientes en orden.
   * Solo entra lo que `recorridoPendiente` dejó pasar: los que no traen `Orden`
   * o lo comparten con otro quedan como marcador suelto. Dibujarlos igual
   * obligaría a elegir un lugar en la fila, y ese lugar no lo declaró nadie.
   */
  const puntos: { x: number; y: number }[] = [];
  if (driver.posicion) puntos.push(proyectar(driver.posicion.lat, driver.posicion.lon));
  for (const p of driver.recorrido) {
    if (p.latitud_destino != null && p.longitud_destino != null) {
      puntos.push(proyectar(p.latitud_destino, p.longitud_destino));
    }
  }

  /*
   * La ruta propuesta por cercanía, cuando se pide.
   *
   * Se dibuja debajo de todo y como una banda ancha y translúcida, no como
   * otra línea igual a la real: son dos cosas distintas -una es el orden del
   * sistema y la otra una sugerencia calculada- y tienen que verse distintas
   * aunque estén las dos en pantalla al mismo tiempo.
   *
   * Arranca en la bodega, que es de donde sale la ruta de verdad, y no en la
   * posición actual del repartidor. Por eso se dibuja también para el que no
   * está reportando posición.
   *
   * El orden llega del servidor como lista de `id_viaje`; acá solo se
   * resuelven las coordenadas. Reordenar en el navegador daría un resultado
   * que nadie más puede reproducir.
   */
  const propuesta: { x: number; y: number }[] = [];
  if (mostrarPropuesta && driver.propuesta) {
    const porId = new Map(driver.paquetes.map((p) => [p.id_viaje, p]));
    propuesta.push(proyectar(BODEGA.lat, BODEGA.lon));
    for (const id of driver.propuesta.secuencia) {
      const p = porId.get(id);
      if (p?.latitud_destino != null && p.longitud_destino != null) {
        propuesta.push(proyectar(p.latitud_destino, p.longitud_destino));
      }
    }
  }

  return (
    <g>
      {propuesta.length > 1 ? (
        <polyline
          points={propuesta.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={7 * k}
          strokeOpacity={0.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <title>Ruta propuesta por cercanía. No es el orden del sistema.</title>
        </polyline>
      ) : null}

      {puntos.length > 1 ? (
        <polyline
          points={puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={2.2 * k}
          strokeOpacity={0.55}
          strokeDasharray={`${6 * k} ${5 * k}`}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {conDestino.map((paquete) => (
        <Destino
          key={paquete.id_viaje}
          paquete={paquete}
          color={color}
          k={k}
          activo={paqueteActivo === paquete.id_viaje}
          onSeleccionar={onPaquete}
          punto={proyectar(paquete.latitud_destino as number, paquete.longitud_destino as number)}
          driver={driver.nombre}
        />
      ))}

      {driver.domicilio ? (
        <MarcaCasa
          punto={proyectar(driver.domicilio.lat, driver.domicilio.lon)}
          color={color}
          k={k}
          driver={driver.nombre}
        />
      ) : null}

      {driver.posicion ? (
        <MarcaDriver
          punto={proyectar(driver.posicion.lat, driver.posicion.lon)}
          color={color}
          k={k}
          driver={driver}
        />
      ) : null}
    </g>
  );
}

/**
 * El repartidor: un pin negro con la silueta de una moto.
 *
 * Va bien más grande que los destinos. Con varios repartidores seleccionados
 * sobre una misma zona, lo que hay que poder encontrar de un vistazo es dónde
 * está la gente, no dónde están los paquetes, y el negro es lo único que gana
 * contra los cuatro colores de estado sin discutirles el significado.
 *
 * De quién es cada pin lo sigue diciendo el aro, que conserva el color de la
 * persona. Sin eso, dos repartidores en la misma cuadra serían dos puntos
 * negros idénticos y habría que pasar el mouse por encima para distinguirlos.
 */
function MarcaDriver({
  punto,
  color,
  k,
  driver,
}: {
  punto: { x: number; y: number };
  color: string;
  k: number;
  driver: DriverDelTracker;
}) {
  const r = 16 * k;
  const opaco = driver.estadoPosicion === "VIEJA" ? 0.45 : 1;

  return (
    <g transform={`translate(${punto.x} ${punto.y})`} opacity={opaco}>
      <title>
        {`${driver.nombre} · ${textoPosicion(driver)}`}
      </title>

      {/* Halo fijo mientras la posición sea reciente. Antes latía con una
          animación infinita por repartidor; con varios en pantalla, sobre un
          SVG que además se redibuja con cada pan/zoom, eran demasiadas
          animaciones corriendo juntas. El color sigue diciendo «en vivo». */}
      {driver.estadoPosicion === "RECIENTE" ? (
        <circle r={r * 1.8} fill={color} className={estilos.pulso} />
      ) : null}

      {/* Dos aros: el de afuera separa el pin del mapa, el de adentro es el
          color de la persona. */}
      <circle r={r + 3 * k} fill="var(--surface, #fff)" />
      <circle r={r} fill={COLOR_DRIVER} stroke={color} strokeWidth={3 * k} />

      {/* Moto simplificada: dos ruedas y el manubrio. A este tamaño no entra
          más detalle y con menos no se distingue de un punto cualquiera. */}
      <g
        transform={`scale(${k * 0.95}) translate(-12 -12)`}
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

/**
 * La bodega: de donde sale la ruta propuesta.
 *
 * Va en forma de rombo y no de círculo. Los círculos ya están todos tomados
 * —los destinos y el repartidor— y a este tamaño la silueta es lo único que
 * se distingue de verdad; el color solo tendría que competir con los cuatro
 * estados.
 */
function MarcaBodega({ punto, k }: { punto: { x: number; y: number }; k: number }) {
  const r = 11 * k;

  return (
    <g transform={`translate(${punto.x} ${punto.y})`}>
      <title>Bodega. La ruta propuesta arranca acá.</title>
      <path
        d={`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`}
        fill="var(--surface, #fff)"
        stroke={COLOR_DRIVER}
        strokeWidth={2.4 * k}
        strokeLinejoin="round"
      />
      <circle r={r * 0.28} fill={COLOR_DRIVER} />
    </g>
  );
}

/**
 * El domicilio del repartidor: una casita hueca del color de la persona.
 *
 * Hueca y sin relleno de estado a propósito. No es una parada de la ruta y no
 * tiene desenlace: mezclarla con los destinos haría que se contara sola en el
 * avance de quien mira el mapa.
 *
 * Sale del mapa que mantiene operaciones (`datos/choferes.kmz`), así que es
 * dónde vive la persona y no dónde estuvo: no se actualiza con la jornada.
 */
function MarcaCasa({
  punto,
  color,
  k,
  driver,
}: {
  punto: { x: number; y: number };
  color: string;
  k: number;
  driver: string;
}) {
  const r = 9 * k;

  return (
    <g transform={`translate(${punto.x} ${punto.y})`} opacity={0.85}>
      <title>{`Domicilio de ${driver}`}</title>

      {/* Techo y cuerpo en un solo trazo: a nueve píxeles, dos figuras
          separadas se ven como una mancha. */}
      <path
        d={`M${-r} ${-r * 0.1} L0 ${-r} L${r} ${-r * 0.1} M${-r * 0.72} ${-r * 0.32} V${r * 0.85} H${r * 0.72} V${-r * 0.32}`}
        fill="var(--surface, #fff)"
        stroke={color}
        strokeWidth={2.2 * k}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}

function textoPosicion(driver: DriverDelTracker): string {
  if (!driver.posicion) return "sin posición conocida";
  const minutos = driver.minutosSinActualizar;
  if (minutos == null) return "posición sin fecha";
  if (minutos < 1) return "posición de hace menos de un minuto";
  if (minutos < 60) return `posición de hace ${minutos} min`;
  return `posición de hace ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/**
 * Un destino. El color dice cómo terminó y el aro de quién es.
 *
 * Las dos preguntas que hay que poder responder con varios repartidores en
 * pantalla son «cómo terminó este paquete» y «de quién es», y cada una tiene
 * su canal: el relleno lleva el estado —verde entregado, rojo no entregado,
 * ámbar fuera de ruta, gris cancelado— y el borde lleva a la persona.
 *
 * Lo que todavía no pasó no tiene color de estado, así que ahí el marcador se
 * pinta entero del color del repartidor y queda hueco. Lleno es «esto ya está
 * resuelto», hueco es «esto falta»: se lee sin tener que aprender la paleta.
 */
function Destino({
  paquete,
  color,
  k,
  activo,
  onSeleccionar,
  punto,
  driver,
}: {
  paquete: PaqueteDelTracker;
  color: string;
  k: number;
  activo: boolean;
  onSeleccionar: (id: number | null) => void;
  punto: { x: number; y: number };
  driver: string;
}) {
  const r = (paquete.clasificacion === "PROXIMO" ? 13 : 10) * k;
  const blanco = "var(--surface, #fff)";

  /*
   * El tono del estado, o el del repartidor cuando el paquete todavía no tiene
   * desenlace. `COLOR_CLASIFICACION` devuelve `null` justamente para los tres
   * casos sin resolver, y ese `null` es lo que decide también si el marcador
   * va lleno o hueco: una sola fuente para el color y para la forma, así no
   * pueden discrepar.
   */
  const colorDelEstado = COLOR_RELLENO_POR_ESTADO[colorEstado(paquete.nombre_estado ?? "")];
  const tono = colorDelEstado ?? colorDeClasificacion(paquete.clasificacion, color);
  const resuelto = COLOR_CLASIFICACION[paquete.clasificacion] !== null;
  const lleno = colorDelEstado != null || resuelto || paquete.clasificacion === "PROXIMO";
  const amarillo = colorEstado(paquete.nombre_estado ?? "") === "retirado" ||
    paquete.clasificacion === "RETIRADO_DE_RUTA";

  const relleno = lleno ? tono : blanco;
  const glifo = amarillo ? "var(--warning-ink, #21180a)" : lleno ? blanco : tono;

  return (
    <g
      transform={`translate(${punto.x} ${punto.y})`}
      className={estilos.destino}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSeleccionar(activo ? null : paquete.id_viaje);
      }}
      opacity={paquete.clasificacion === "RETIRADO_DE_RUTA" || paquete.clasificacion === "CANCELADO" ? 0.4 : 1}
    >
      <title>
        {`#${paquete.id_viaje} · ${driver}\n${paquete.nombre_estado ?? "sin estado"}` +
          `\n${etiquetaPaquete(paquete)}` +
          (paquete.es_laboral ? " · destino laboral" : "") +
          (paquete.orden != null ? ` · orden ${paquete.orden}` : " · sin orden") +
          (paquete.direccion ? `\n${paquete.direccion}` : "")}
      </title>

      {/* Aro exterior del próximo: es la parada que hay que mirar. */}
      {paquete.clasificacion === "PROXIMO" ? (
        <circle r={r * 1.75} fill="none" stroke={color} strokeWidth={2 * k} strokeOpacity={0.5} />
      ) : null}
      {activo ? (
        <circle r={r * 2.3} fill="none" stroke={color} strokeWidth={2.2 * k} />
      ) : null}

      <circle r={r} fill={relleno} stroke={color} strokeWidth={2 * k} />

      {paquete.es_laboral ? (
        /* El maletín identifica el tipo de destino. El círculo conserva el
           relleno y borde calculados arriba, que son los que comunican el
           estado del paquete y el repartidor asignado. */
        <g fill="none" stroke={glifo} strokeWidth={1.8 * k} strokeLinecap="round" strokeLinejoin="round">
          <rect x={-r * 0.48} y={-r * 0.18} width={r * 0.96} height={r * 0.58} rx={r * 0.07} />
          <path d={`M${-r * 0.18} ${-r * 0.18} v${-r * 0.17} h${r * 0.36} v${r * 0.17} M${-r * 0.48} ${r * 0.08} h${r * 0.96} M0 ${r * 0.08} v${r * 0.12}`} />
        </g>
      ) : paquete.clasificacion === "VISITADO_ENTREGADO" ? (
        <path
          d={`M${-r * 0.45} 0 L${-r * 0.1} ${r * 0.38} L${r * 0.5} ${-r * 0.4}`}
          fill="none"
          stroke={glifo}
          strokeWidth={2.1 * k}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : paquete.clasificacion === "VISITADO_NO_ENTREGADO" ? (
        <path
          d={`M0 ${-r * 0.5} V${r * 0.14} M0 ${r * 0.46} v0.01`}
          stroke={glifo}
          strokeWidth={2.2 * k}
          strokeLinecap="round"
        />
      ) : paquete.clasificacion === "CANCELADO" || paquete.clasificacion === "RETIRADO_DE_RUTA" ? (
        <path
          d={`M${-r * 0.42} ${-r * 0.42} L${r * 0.42} ${r * 0.42} M${r * 0.42} ${-r * 0.42} L${-r * 0.42} ${r * 0.42}`}
          stroke={glifo}
          strokeWidth={2 * k}
          strokeLinecap="round"
        />
      ) : paquete.orden != null ? (
        /* El número de orden, dentro del marcador. Es lo que el repartidor ve
           en su app, así que es lo que permite hablar con él por teléfono. */
        <text
          y={r * 0.36}
          textAnchor="middle"
          fontSize={r * 1.05}
          fontWeight={600}
          fill={glifo}
        >
          {paquete.orden}
        </text>
      ) : (
        <circle r={r * 0.3} fill={glifo} />
      )}
    </g>
  );
}

export const ETIQUETA: Record<Clasificacion, string> = {
  PROXIMO: "Próximo destino",
  PENDIENTE_NO_VISITADO: "Pendiente",
  VISITADO_ENTREGADO: "Entregado",
  VISITADO_NO_ENTREGADO: "Visitado sin entregar",
  CANCELADO: "Cancelado",
  RETIRADO_DE_RUTA: "Retirado de la ruta",
  SIN_CLASIFICAR: "Estado no informado",
};

/** Muestra el estado textual del sistema cuando no hay una categoría segura. */
export function etiquetaPaquete(
  paquete: Pick<PaqueteDelTracker, "clasificacion" | "nombre_estado">,
): string {
  if (paquete.clasificacion === "SIN_CLASIFICAR") {
    const estado = paquete.nombre_estado?.trim();
    if (estado) return estado;
  }
  return ETIQUETA[paquete.clasificacion];
}
