import "server-only";
import {
  TABLA_TRACKER_CHOFERES,
  TABLA_TRACKER_PAQUETES,
  TABLA_TRACKER_SYNC,
  diasAtrasDelTracker,
  VISTA_TRACKER_DRIVERS,
} from "./config";
import { consultarTodo, TablaFaltante } from "./supabase";
import { ubicarPunto } from "./cobertura";
import {
  clasificarRuta,
  coordenadaValida,
  diaDeOperacion,
  nombreDeDriver,
  proponerRuta,
  recorridoPendiente,
  resumirRuta,
  secuenciaConfiable,
  type Clasificacion,
  type DriverFila,
  type PaqueteFila,
  type Parada,
  type Propuesta,
  type Resumen,
  type Sincronizacion,
} from "./tracker";

/**
 * Lo que el tablero lee de la base para dibujar el mapa.
 *
 * La agrupación por repartidor se hace acá y no en el navegador: es lo que
 * garantiza que un paquete no pueda aparecer en la ruta de otro. El cliente
 * recibe cada repartidor con sus paquetes adentro y no tiene forma de
 * mezclarlos aunque quisiera.
 */

export type PaqueteDelTracker = PaqueteFila & { clasificacion: Clasificacion };

export type DriverDelTracker = {
  id: number;
  nombre: string;
  posicion: { lat: number; lon: number } | null;
  fechaPosicion: string | null;
  estadoPosicion: DriverFila["estado_posicion"];
  minutosSinActualizar: number | null;
  ultimaInfo: string | null;
  idReserva: number | null;

  /**
   * Las rutas de sus paquetes. Sale de `Viaje.IdRuta` y no de la reserva:
   * `ReservaxMotoboy` no expone `IdRuta` —está probado contra el sistema, ver
   * `supabase/colectas.sql`— así que la única fuente real es el paquete.
   */
  rutas: number[];

  /** Polígonos de cobertura que cubren su posición. Puede ser más de uno. */
  poligonos: string[];

  /**
   * Dónde vive, del mapa que mantiene operaciones. `null` cuando su punto no
   * está cargado, que hoy es el caso de buena parte de la planta.
   *
   * Es un dato sensible y por eso viaja solo con el repartidor que se está
   * mirando, nunca la lista entera de domicilios de la empresa.
   */
  domicilio: { lat: number; lon: number } | null;

  paquetes: PaqueteDelTracker[];
  resumen: Resumen;

  /** El próximo destino, cuando el orden alcanza para decidirlo. */
  proximo: PaqueteDelTracker | null;

  /** Los pendientes encadenables, en orden, para dibujar la línea. */
  recorrido: PaqueteDelTracker[];

  secuencia: { confiable: boolean; sinOrden: number; duplicados: number };

  /**
   * Una ruta alternativa armada por cercanía, calculada en el servidor.
   *
   * Va como lista de `id_viaje` y no como los paquetes de nuevo: son los
   * mismos objetos que ya viajan en `paquetes`, y repetirlos duplicaría el
   * tamaño de la respuesta para no agregar un solo dato.
   *
   * `null` cuando no se puede proponer nada: sin posición del repartidor no
   * hay desde dónde empezar a medir, y con una sola parada pendiente no hay
   * nada que ordenar.
   */
  propuesta: Propuesta | null;
};

export type DatosDelTracker = {
  dia: string;
  /** Cuántos días atrás se está mirando. `0` es hoy. La pantalla lo anuncia. */
  diasAtras: number;
  drivers: DriverDelTracker[];
  /** Paquetes del día que ninguna reserva ata a un repartidor conocido. */
  huerfanos: PaqueteDelTracker[];
  sincronizaciones: { drivers: Sincronizacion | null; paquetes: Sincronizacion | null };

  /**
   * Tablas de referencia que no existen todavía.
   *
   * Va en los datos y no como excepción: sin ellas la pantalla sirve igual,
   * pero callarse cuál falta convierte «no corriste la migración» en «este
   * repartidor no tiene domicilio», que es una respuesta distinta.
   */
  tablasFaltantes: string[];

  leidoEn: string;
};

/** El día que está mirando el tracker: hoy, o el que corra `TRACKER_DIAS_ATRAS`. */
export function diaVigente(): string {
  return diaDeOperacion(new Date(), diasAtrasDelTracker());
}

/**
 * Lee la jornada entera y la devuelve armada.
 *
 * Las tres lecturas van en paralelo porque no dependen entre sí, y las tres van
 * sin caché: el sentido de la pantalla es ver dónde está la gente ahora.
 *
 * Repartidores y paquetes se piden con el mismo `dia`. No es un detalle: si
 * cada uno resolviera su fecha por su lado, una corrida a las 23:59 podría leer
 * los repartidores de hoy y los paquetes de mañana, y el mapa mostraría gente
 * sin ruta sin que nada avisara.
 */
export async function leerTracker(dia = diaVigente()): Promise<DatosDelTracker> {
  /*
   * Qué tablas de referencia faltan.
   *
   * Se anota en vez de tragarse el error en silencio. La primera versión de
   * esto hacía `catch(() => [])` y la pantalla decía «sin domicilio cargado»,
   * que es una respuesta distinta y equivocada: no es que la persona no tenga
   * domicilio, es que la migración no se corrió. Con esto la pantalla dice
   * cuál falta y qué correr.
   */
  const faltan: string[] = [];
  const opcional = async <T>(tabla: string, orden: string): Promise<T[]> => {
    try {
      return await consultarTodo<T>(tabla, {}, orden);
    } catch (error) {
      if (error instanceof TablaFaltante) {
        faltan.push(tabla);
        return [];
      }
      throw error;
    }
  };

  const [drivers, paquetes, sincronizaciones, choferes] = await Promise.all([
    consultarTodo<DriverFila>(
      VISTA_TRACKER_DRIVERS,
      { fecha_operacion: `eq.${dia}`, activo: "is.true" },
      "id_motoboy.asc",
    ),
    consultarTodo<PaqueteFila>(
      TABLA_TRACKER_PAQUETES,
      { fecha_ruta: `eq.${dia}` },
      "id_motoboy.asc,orden.asc,id_viaje.asc",
    ),
    /*
     * Las últimas corridas de cada tipo. Se piden veinte y se elige la primera
     * de cada uno en vez de hacer dos consultas: PostgREST no tiene un
     * `distinct on`, y veinte filas de una tabla de ejecuciones no justifican
     * una vista más.
     */
    consultarTodo<Sincronizacion>(TABLA_TRACKER_SYNC, {}, "fecha_inicio.desc").then((filas) =>
      filas.slice(0, 20),
    ),

    /*
     * Los domicilios. Es una tabla de referencia -no cambia sola- y son setenta
     * filas, así que se leen todas de una y se cruzan en memoria: una consulta
     * por repartidor serían veinte viajes a la base para dibujar una pantalla.
     *
     * Si todavía no existe -la migración 06 no se corrió-, la pantalla funciona
     * igual y lo dice. Un dato accesorio no puede tirar abajo el mapa entero.
     */
    opcional<DomicilioFila>(TABLA_TRACKER_CHOFERES, "id_motoboy.asc"),
  ]);

  const domicilios = new Map(choferes.map((c) => [c.id_motoboy, c]));

  const porDriver = new Map<number, PaqueteFila[]>();
  const huerfanos: PaqueteFila[] = [];
  for (const paquete of paquetes) {
    if (paquete.id_motoboy == null) {
      huerfanos.push(paquete);
      continue;
    }
    const lista = porDriver.get(paquete.id_motoboy);
    if (lista) lista.push(paquete);
    else porDriver.set(paquete.id_motoboy, [paquete]);
  }

  return {
    dia,
    diasAtras: diasAtrasDelTracker(),
    drivers: drivers.map((fila) =>
      armarDriver(fila, porDriver.get(fila.id_motoboy) ?? [], domicilios.get(fila.id_motoboy)),
    ),

    // Los huérfanos se clasifican solos, sin ruta: sin repartidor no hay
    // secuencia contra la cual decidir cuál es el próximo.
    huerfanos: clasificarRuta(huerfanos),

    sincronizaciones: {
      drivers: sincronizaciones.find((s) => s.tipo === "drivers") ?? null,
      paquetes: sincronizaciones.find((s) => s.tipo === "paquetes") ?? null,
    },
    tablasFaltantes: faltan,
    leidoEn: new Date().toISOString(),
  };
}

type DomicilioFila = {
  id_motoboy: number;
  nombre: string;
  latitud: number;
  longitud: number;
};

function armarDriver(
  fila: DriverFila,
  suyos: PaqueteFila[],
  casa: DomicilioFila | undefined,
): DriverDelTracker {
  /*
   * La clasificación se recalcula al leer aunque n8n ya la haya guardado.
   *
   * No es trabajo repetido al pedo: `PROXIMO` depende de la ruta entera, y el
   * flujo la escribe con lo que vio en su corrida. Si entre una corrida y otra
   * el próximo se entrega, la columna guardada seguiría señalando a ese, y
   * recalcular acá es lo que hace que el mapa no marque como siguiente parada
   * una que ya pasó. La columna de la base queda para poder consultarla con
   * SQL sin reimplementar la regla.
   */
  const clasificados = clasificarRuta(suyos);

  const posicion = coordenadaValida(fila.latitud, fila.longitud)
    ? { lat: fila.latitud as number, lon: fila.longitud as number }
    : null;

  /*
   * Las dos listas que se comparan.
   *
   * `pendientes` son todas las paradas que le quedan por resolver; la
   * propuesta las ordena a todas. `declaradas` son esas mismas paradas en el
   * orden del sistema, y salen de `recorrido`, que deja afuera las que no
   * traen `Orden` o lo comparten. Cuando las dos listas no coinciden no hay
   * comparación posible, y de eso se ocupa `proponerRuta`.
   */
  const recorrido = recorridoPendiente(clasificados);
  const pendientes = aParadas(
    clasificados.filter(
      (p) => p.clasificacion === "PENDIENTE_NO_VISITADO" || p.clasificacion === "PROXIMO",
    ),
  );
  const declaradas = aParadas(recorrido);

  return {
    id: fila.id_motoboy,
    nombre: nombreDeDriver(fila),
    posicion,
    fechaPosicion: fila.fecha_ultima_posicion,
    estadoPosicion: posicion ? fila.estado_posicion : "SIN_POSICION",
    minutosSinActualizar: fila.minutos_sin_actualizar,
    ultimaInfo: fila.ultima_info,
    idReserva: fila.id_reserva,

    rutas: [...new Set(clasificados.map((p) => p.id_ruta).filter((r): r is number => r != null))].sort(
      (a, b) => a - b,
    ),

    poligonos: posicion
      ? ubicarPunto({ lon: posicion.lon, lat: posicion.lat }).map((z) => z.nombre)
      : [],

    domicilio:
      casa && coordenadaValida(casa.latitud, casa.longitud)
        ? { lat: casa.latitud, lon: casa.longitud }
        : null,

    paquetes: clasificados,
    resumen: resumirRuta(clasificados),
    proximo: clasificados.find((p) => p.clasificacion === "PROXIMO") ?? null,
    recorrido,
    secuencia: secuenciaConfiable(clasificados),

    /*
     * La propuesta se calcula acá y no en el navegador porque es lo único de
     * esta pantalla que es un cálculo y no un dibujo: el resultado tiene que
     * ser el mismo para todos los que miren la misma jornada, y tiene que
     * poder pedirse por API sin abrir el mapa.
     *
     * Sale de la bodega, no de donde está el repartidor ahora. Por eso existe
     * también para el que no está reportando posición.
     */
    propuesta: proponerRuta(pendientes, declaradas),
  };
}

/** Las paradas con coordenadas utilizables, en el orden en que vienen. */
function aParadas(paquetes: PaqueteDelTracker[]): Parada[] {
  return paquetes
    .filter((p) => coordenadaValida(p.latitud_destino, p.longitud_destino))
    .map((p) => ({
      id_viaje: p.id_viaje,
      lat: p.latitud_destino as number,
      lon: p.longitud_destino as number,
    }));
}
