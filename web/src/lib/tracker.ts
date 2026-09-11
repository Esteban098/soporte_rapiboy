import { colorEstado, type ColorEstado } from "./estados";

/**
 * Las reglas del live tracker, sin nada alrededor.
 *
 * Este módulo no lee la base, no habla con n8n y no importa nada de servidor:
 * es la misma clasificación corriendo en el navegador —que pinta el mapa—, en
 * la API —que arma el resumen— y en las pruebas. Tenerla escrita una sola vez
 * es lo que hace que el número del panel y el color del marcador no puedan
 * discrepar.
 */

/* ---------- Lo que devuelve la base ---------- */

export type EstadoPosicion = "RECIENTE" | "DEMORADA" | "VIEJA" | "SIN_FECHA" | "SIN_POSICION";

export type DriverFila = {
  id_motoboy: number;
  nombre: string | null;
  apellido: string | null;
  latitud: number | null;
  longitud: number | null;
  fecha_ultima_posicion: string | null;
  ultima_info: string | null;
  id_reserva: number | null;
  id_localidad: number | null;
  id_modalidad: number | null;
  fecha_operacion: string | null;
  activo: boolean;
  primera_deteccion: string;
  ultima_deteccion: string;
  sincronizado_en: string;
  sync_id: string | null;
  /** Las calcula la vista al leer, no están guardadas. */
  minutos_sin_actualizar: number | null;
  estado_posicion: EstadoPosicion;
};

export type PaqueteFila = {
  id_viaje: number;
  tracking_id: string;
  id_motoboy: number | null;
  id_motoboy_balanceado: number | null;
  id_reserva: number | null;
  id_ruta: number | null;

  id_estado: number | null;
  nombre_estado: string | null;
  orden: number | null;
  direccion: string | null;
  latitud_destino: number | null;
  longitud_destino: number | null;
  visitado: boolean;
  fecha_visita: string | null;
  clasificacion: Clasificacion;
  fecha_ruta: string | null;
  fecha_programado: string | null;
  fecha_programado_hasta: string | null;
  fecha_cambio_estado: string | null;
  activo_en_ruta: boolean;
  retirado_de_ruta_en: string | null;
  primera_deteccion: string;
  ultima_deteccion: string;
  sincronizado_en: string;
  sync_id: string | null;
};

export type Sincronizacion = {
  id: string;
  tipo: "drivers" | "paquetes";
  estado: "running" | "success" | "failed";
  fecha_inicio: string;
  fecha_fin: string | null;
  fecha_operacion: string | null;
  registros_leidos: number;
  registros_insertados: number;
  registros_actualizados: number;
  registros_desactivados: number;
  mensaje_error: string | null;
};

/* ---------- Clasificación ---------- */

export type Clasificacion =
  | "PROXIMO"
  | "PENDIENTE_NO_VISITADO"
  | "VISITADO_ENTREGADO"
  | "VISITADO_NO_ENTREGADO"
  | "CANCELADO"
  | "RETIRADO_DE_RUTA"
  | "SIN_CLASIFICAR";

/**
 * Qué le pasó al paquete según su estado, sin mirar la visita todavía.
 *
 * Sale de `colorEstado`, que ya traduce los `EstadoViaje.NombreCompleto`
 * reales que devuelve el sistema. Es a propósito que no haya una lista de
 * `IdEstado` acá: los ids que el proyecto tiene verificados son cuatro —22
 * cancelado, 24 colectado y los del filtro de fallidos— y armar una tabla
 * completa a ojo sería adivinar. El nombre viene con la consulta, ya está
 * probado contra los datos y es lo que el equipo lee en pantalla.
 */
export type Desenlace = "ENTREGADO" | "NO_ENTREGADO" | "CANCELADO" | "EN_RUTA" | "DESCONOCIDO";

const DESENLACE: Record<ColorEstado, Desenlace> = {
  entregado: "ENTREGADO",

  // Los cinco terminan igual para la operación: el paquete no llegó a manos
  // del comprador. Se distinguen entre sí en la columna de estado, que se
  // muestra tal cual; acá lo que importa es de qué lado del avance cuentan.
  noentregado: "NO_ENTREGADO",
  devuelto: "NO_ENTREGADO",
  devolucion: "NO_ENTREGADO",
  deposito: "NO_ENTREGADO",
  siniestrado: "NO_ENTREGADO",

  cancelado: "CANCELADO",

  // «Retirado en camino a destino» y «Para retirar» son las dos etapas de un
  // paquete que todavía se está moviendo. No son un resultado.
  retirado: "EN_RUTA",
  pararetirar: "EN_RUTA",

  neutral: "DESCONOCIDO",
};

export function desenlaceDe(nombreEstado: string | null | undefined): Desenlace {
  if (!nombreEstado?.trim()) return "DESCONOCIDO";
  return DESENLACE[colorEstado(nombreEstado)];
}

/** Lo mínimo que hace falta para clasificar. Así lo pueden llamar las pruebas. */
export type ParaClasificar = {
  nombre_estado: string | null;
  visitado: boolean;
  activo_en_ruta: boolean;
};

/**
 * Clasifica un paquete suelto. `PROXIMO` no sale de acá: es una propiedad de
 * la ruta entera —cuál viene primero— y se resuelve en `clasificarRuta`.
 *
 * La asimetría entre entregado y no entregado es deliberada. «Entregado» se
 * acepta sin pedir la marca de visita porque no hay forma de entregar sin
 * pasar; «Pedido no entregado» sin ninguna visita registrada, en cambio, es
 * una contradicción —el sistema dice que se intentó y nada lo respalda— y va a
 * `SIN_CLASIFICAR`, que es justo para lo que está: no hay evidencia suficiente
 * y conviene que se note en vez de contarlo como un intento fallido real.
 */
export function clasificarPaquete(paquete: ParaClasificar): Clasificacion {
  const desenlace = desenlaceDe(paquete.nombre_estado);

  // Cancelado gana sobre retirado: los dos sacan al paquete del mapa, pero
  // «lo cancelaron» explica por qué y «salió de la ruta» no.
  if (desenlace === "CANCELADO") return "CANCELADO";
  if (!paquete.activo_en_ruta) return "RETIRADO_DE_RUTA";

  if (desenlace === "ENTREGADO") return "VISITADO_ENTREGADO";
  if (desenlace === "NO_ENTREGADO") {
    return paquete.visitado ? "VISITADO_NO_ENTREGADO" : "SIN_CLASIFICAR";
  }
  if (desenlace === "EN_RUTA") {
    // Visitado pero el estado sigue diciendo «en camino»: hubo un paso y
    // todavía no se sabe cómo terminó. No es pendiente ni es un resultado.
    return paquete.visitado ? "SIN_CLASIFICAR" : "PENDIENTE_NO_VISITADO";
  }
  return "SIN_CLASIFICAR";
}

/**
 * Clasifica los paquetes de un repartidor y marca cuál es el próximo.
 *
 * `PROXIMO` es el pendiente de menor `Orden`, y solamente si ese orden alcanza
 * para decidirlo. Si ningún pendiente trae orden, o si el menor está empatado
 * entre varios, no hay próximo: la secuencia no está declarada y elegir uno
 * sería inventarla. El mapa muestra los pendientes numerados igual, sin
 * destacar ninguno, y el panel avisa por qué.
 */
export function clasificarRuta<T extends ParaClasificar & { orden: number | null; id_viaje: number }>(
  paquetes: T[],
): (T & { clasificacion: Clasificacion })[] {
  const clasificados = paquetes.map((p) => ({ ...p, clasificacion: clasificarPaquete(p) }));

  const pendientesConOrden = clasificados.filter(
    (p) => p.clasificacion === "PENDIENTE_NO_VISITADO" && p.orden != null,
  );
  if (pendientesConOrden.length === 0) return clasificados;

  const minimo = Math.min(...pendientesConOrden.map((p) => p.orden as number));
  const empatados = pendientesConOrden.filter((p) => p.orden === minimo);
  if (empatados.length !== 1) return clasificados;

  empatados[0].clasificacion = "PROXIMO";
  return clasificados;
}

/** Si la secuencia de la ruta alcanza para dibujar un recorrido sin inventar nada. */
export function secuenciaConfiable(paquetes: { orden: number | null; clasificacion: Clasificacion }[]): {
  confiable: boolean;
  sinOrden: number;
  duplicados: number;
} {
  const pendientes = paquetes.filter(
    (p) => p.clasificacion === "PENDIENTE_NO_VISITADO" || p.clasificacion === "PROXIMO",
  );
  const sinOrden = pendientes.filter((p) => p.orden == null).length;

  const vistos = new Map<number, number>();
  for (const p of pendientes) {
    if (p.orden != null) vistos.set(p.orden, (vistos.get(p.orden) ?? 0) + 1);
  }
  const duplicados = [...vistos.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);

  return { confiable: sinOrden === 0 && duplicados === 0, sinOrden, duplicados };
}

/**
 * Los pendientes que se pueden encadenar en una línea, en orden.
 *
 * Deja afuera los que no traen `Orden` y los que lo comparten con otro. Un
 * paquete sin lugar en la secuencia se sigue viendo como marcador; lo que no
 * se hace es meterlo en la línea en una posición que nadie declaró.
 */
export function recorridoPendiente<T extends { orden: number | null; clasificacion: Clasificacion }>(
  paquetes: T[],
): T[] {
  const pendientes = paquetes.filter(
    (p) => p.clasificacion === "PENDIENTE_NO_VISITADO" || p.clasificacion === "PROXIMO",
  );

  const cuenta = new Map<number, number>();
  for (const p of pendientes) {
    if (p.orden != null) cuenta.set(p.orden, (cuenta.get(p.orden) ?? 0) + 1);
  }

  return pendientes
    .filter((p) => p.orden != null && cuenta.get(p.orden) === 1)
    .sort((a, b) => (a.orden as number) - (b.orden as number));
}

/* ---------- Resumen por repartidor ---------- */

export type Resumen = {
  total: number;
  entregados: number;
  noEntregados: number;
  pendientes: number;
  cancelados: number;
  retirados: number;
  sinClasificar: number;
  /** Cuántos cuentan para el avance: los que el repartidor tiene que resolver. */
  enRuta: number;
  /** Porcentaje de paradas resueltas sobre las que le tocan. `null` si no tiene. */
  avance: number | null;
};

export function resumirRuta(paquetes: { clasificacion: Clasificacion }[]): Resumen {
  const cuenta = (c: Clasificacion) => paquetes.filter((p) => p.clasificacion === c).length;

  const entregados = cuenta("VISITADO_ENTREGADO");
  const noEntregados = cuenta("VISITADO_NO_ENTREGADO");
  const pendientes = cuenta("PENDIENTE_NO_VISITADO") + cuenta("PROXIMO");
  const sinClasificar = cuenta("SIN_CLASIFICAR");

  /*
   * Cancelados y retirados quedan fuera del denominador. No son paradas que el
   * repartidor tenga que resolver —se las sacaron de la ruta—, así que
   * contarlas haría que el avance bajara justamente cuando le aligeran el día.
   * Los sin clasificar sí entran: son paquetes que siguen siendo suyos y de los
   * que todavía no sabemos el resultado, y esconderlos del denominador
   * inflaría el porcentaje.
   */
  const enRuta = entregados + noEntregados + pendientes + sinClasificar;

  return {
    total: paquetes.length,
    entregados,
    noEntregados,
    pendientes,
    cancelados: cuenta("CANCELADO"),
    retirados: cuenta("RETIRADO_DE_RUTA"),
    sinClasificar,
    enRuta,
    avance: enRuta === 0 ? null : ((entregados + noEntregados) / enRuta) * 100,
  };
}

/** Porcentaje entregado sobre los paquetes que siguen formando parte de la ruta. */
export function porcentajeEntregado(resumen: Pick<Resumen, "entregados" | "enRuta">): number | null {
  return resumen.enRuta === 0 ? null : (resumen.entregados / resumen.enRuta) * 100;
}

export type EntregasDeHora = { hora: number; cantidad: number };

/**
 * Entregas agrupadas por hora de Ciudad de México.
 *
 * Se usa la visita y, cuando el origen no la informó, el último cambio de
 * estado. Los 24 casilleros salen siempre para que una hora con cero no
 * desaparezca del gráfico ni haga parecer que el día tuvo menos horas.
 */
export function entregadosPorHora(
  paquetes: Pick<PaqueteFila, "clasificacion" | "fecha_visita" | "fecha_cambio_estado">[],
): EntregasDeHora[] {
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, cantidad: 0 }));
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_OPERACION,
    hour: "2-digit",
    hourCycle: "h23",
  });

  for (const paquete of paquetes) {
    if (paquete.clasificacion !== "VISITADO_ENTREGADO") continue;
    const cruda = paquete.fecha_visita ?? paquete.fecha_cambio_estado;
    if (!cruda) continue;
    const fecha = new Date(cruda);
    if (!Number.isFinite(fecha.getTime())) continue;
    const parte = formateador.formatToParts(fecha).find((p) => p.type === "hour")?.value;
    const hora = Number(parte);
    if (Number.isInteger(hora) && hora >= 0 && hora < 24) horas[hora].cantidad += 1;
  }

  return horas;
}

/* ---------- Coordenadas ---------- */

/**
 * Si un par de coordenadas se puede dibujar.
 *
 * El `(0, 0)` se rechaza aparte del rango porque es válido como número y no lo
 * es como posición: es lo que devuelve un dispositivo que todavía no consiguió
 * señal, y cae en el Atlántico. Sin este corte, cada repartidor sin GPS
 * aparecería amontonado frente a la costa de África.
 */
export function coordenadaValida(lat: unknown, lon: unknown): lat is number {
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return !(lat === 0 && lon === 0);
}

/**
 * La antigüedad de una posición, recalculada en el navegador.
 *
 * La vista de Postgres devuelve lo mismo, pero contra el reloj del momento de
 * la lectura. Una pantalla abierta media hora seguiría mostrando «hace 2
 * minutos» si no se recalculara acá.
 */
export function estadoPosicion(
  latitud: number | null,
  longitud: number | null,
  fecha: string | null,
  ahora = Date.now(),
): { estado: EstadoPosicion; minutos: number | null } {
  if (!coordenadaValida(latitud, longitud)) return { estado: "SIN_POSICION", minutos: null };
  const marca = fecha ? Date.parse(fecha) : NaN;
  if (!Number.isFinite(marca)) return { estado: "SIN_FECHA", minutos: null };

  const minutos = Math.floor((ahora - marca) / 60_000);
  if (minutos <= 10) return { estado: "RECIENTE", minutos };
  if (minutos <= 45) return { estado: "DEMORADA", minutos };
  return { estado: "VIEJA", minutos };
}

/* ---------- Color por repartidor ---------- */

/**
 * Diez tonos que se distinguen entre sí y sobre el fondo del mapa. No salen de
 * las variables del tema: acá el color identifica a una persona, no un estado,
 * así que tiene que ser el mismo en el marcador, en la línea, en los destinos
 * y en el casillero del panel.
 *
 * El orden importa y no es alfabético ni por familia. Los ids de una jornada
 * suelen venir corridos -7, 8, 9, 10- así que las posiciones vecinas de esta
 * lista son las que van a caer juntas en el mapa, y dos azules seguidos
 * obligarían a mirar el panel para saber de quién es cada punto. Está ordenada
 * para que cada tono contraste con el anterior y con el siguiente, incluido el
 * salto del último al primero, que es el que se lleva a un décimo repartidor
 * con el primero de la lista.
 */
export const PALETA = [
  "#2f6fed", // azul
  "#e07a1f", // naranja
  "#1f9d6b", // verde
  "#be185d", // magenta
  "#0c8fa8", // turquesa
  "#c2410c", // ladrillo
  "#7b52d3", // violeta
  "#4d7c0f", // oliva
  "#d94f70", // rosa
  "#a16207", // ámbar
] as const;

/**
 * El color de un repartidor, estable entre cargas.
 *
 * Se deriva del id y no de la posición en la lista: si dependiera del orden,
 * un repartidor que entra a la jornada le correría el color a todos los demás
 * y el mapa cambiaría de paleta a mitad del turno.
 */
export function colorDeDriver(idMotoboy: number): string {
  return PALETA[Math.abs(Math.trunc(idMotoboy)) % PALETA.length];
}

/** Nombre y apellido, o el id cuando el sistema no trae ninguno de los dos. */
export function nombreDeDriver(driver: Pick<DriverFila, "id_motoboy" | "nombre" | "apellido">): string {
  const completo = [driver.nombre, driver.apellido]
    .map((parte) => parte?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return completo || `Repartidor ${driver.id_motoboy}`;
}

/* ---------- Color por clasificación ---------- */

/**
 * El color del repartidor en el mapa.
 *
 * Negro, y no el tono que lo identifica: el pin de la persona es lo primero
 * que hay que encontrar, y el negro es el único que gana contra el relleno de
 * los polígonos y contra los cuatro colores de estado sin competir con ellos.
 *
 * En tema oscuro no puede seguir siendo negro -desaparecería sobre el fondo-,
 * así que sale de `--ink`, que es la tinta del tema: negro en claro, casi
 * blanco en oscuro. El identificador de la persona no se pierde: queda en el
 * aro del pin y en la línea de su recorrido, que siguen siendo de su color.
 */
export const COLOR_DRIVER = "var(--ink, #111827)";

/**
 * El color de cada estado del paquete. Verde entregó, rojo no entregó, ámbar
 * salió de la ruta.
 *
 * Son las mismas variables que usan Mensual, Ayer y Cancelados, no tonos
 * nuevos: el verde de «Entregado» tiene que ser el mismo verde en las cuatro
 * pantallas o el equipo aprende dos vocabularios. Por eso «amarillo» es el
 * ámbar del tema y no un amarillo puro, que sobre fondo claro no se lee.
 *
 * `null` significa «todavía no pasó nada»: ahí el marcador se pinta del color
 * del repartidor, que es lo que permite saber de quién es cada parada cuando
 * hay varios seleccionados. Es la división que hace el mapa legible: lo
 * resuelto se lee por color de estado, lo pendiente por color de persona.
 */
export const COLOR_CLASIFICACION: Record<Clasificacion, string | null> = {
  VISITADO_ENTREGADO: "var(--estado-entregado, #248a3d)",
  VISITADO_NO_ENTREGADO: "var(--estado-noentregado, #d70015)",
  RETIRADO_DE_RUTA: "var(--warning, #b45309)",

  /*
   * Cancelado no comparte el ámbar de retirado aunque los dos salgan del mapa.
   * Retirado es una decisión de la operación sobre la ruta -alguien le sacó la
   * parada al repartidor- y cancelado es el pedido que dejó de existir. El
   * gris dice «esto ya no es asunto de nadie»; el ámbar dice «esto cambió,
   * mirá».
   */
  CANCELADO: "var(--estado-cancelado, #6c6c70)",

  PROXIMO: null,
  PENDIENTE_NO_VISITADO: null,
  SIN_CLASIFICAR: null,
};

/** El color con el que se dibuja un destino: el del estado, o el del repartidor. */
export function colorDeClasificacion(clasificacion: Clasificacion, colorDriver: string): string {
  return COLOR_CLASIFICACION[clasificacion] ?? colorDriver;
}

/* ---------- Enlace al operador ---------- */

/**
 * El viaje abierto en el sistema de Rapiboy.
 *
 * Es la salida del tablero hacia donde se opera de verdad: acá se mira, allá
 * se toca. `idviaje` es `Viaje.Id`, el mismo número que la tabla guarda en
 * `id_viaje` y muestra como tracking id.
 *
 * La modalidad va fija en 5 porque es la única que este tablero mira: la
 * consulta que alimenta el tracker filtra `Usuario.IdModalidad = 5`, así que
 * no hay ningún paquete en pantalla que pertenezca a otra.
 */
export function enlaceAlOperador(idViaje: number): string {
  return `https://rapiboy.com/Operador?modalidad=5&idviaje=${encodeURIComponent(String(idViaje))}`;
}

/* ---------- Día de operación ---------- */

/** La operación vive en esta zona, y es la única que decide qué día es. */
export const ZONA_OPERACION = "America/Mexico_City";

/**
 * El día de operación: la fecha que es **en México** en este momento.
 *
 * No es la fecha del servidor ni la de quien mira. Ciudad de México está tres
 * horas detrás de Buenos Aires, así que entre la medianoche y las tres de la
 * mañana en Argentina en México todavía es el día anterior, y los paquetes que
 * hay que mostrar son los de esa jornada, que sigue abierta. Un tablero que
 * mirara el reloj de quien lo abre pasaría a mostrar la jornada nueva -vacía-
 * tres horas antes de que exista.
 *
 * Se resuelve con `Intl` y no restando horas a mano. Hoy la diferencia es de
 * tres horas fijas -ninguno de los dos países usa horario de verano-, pero eso
 * es una circunstancia y no una regla: México lo dejó de usar en 2022 y podría
 * volver, y una constante de −3 movería el corte del día durante medio año sin
 * que nada avise. `Intl` sabe la respuesta correcta cualquiera sea el año.
 *
 * El servidor de la web, el de n8n y el de la base pueden estar en tres zonas
 * distintas, así que el día se decide en un solo lugar y viaja como texto.
 */
export function diaDeOperacion(momento: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_OPERACION,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(momento);
}

/* ---------- Proyección en el navegador ---------- */

/**
 * La ventana del mapa: los mismos límites que usa `lib/cobertura` para dibujar
 * el fondo, pasados como datos para no arrastrar el KMZ al bundle del cliente.
 */
export type Ventana = {
  oeste: number;
  este: number;
  sur: number;
  norte: number;
  ancho: number;
  alto: number;
};

/**
 * Grados a coordenadas del `viewBox`, con la ventana recibida por props.
 *
 * Es la misma cuenta que `proyectar` de `lib/cobertura` y tiene que seguir
 * siéndolo: si las dos se separaran, los marcadores quedarían corridos
 * respecto de los polígonos del fondo. La prueba compara las dos salidas.
 */
export function proyectarEn(
  punto: { lon: number; lat: number },
  v: Ventana,
): { x: number; y: number } {
  return {
    x: ((punto.lon - v.oeste) / (v.este - v.oeste)) * v.ancho,
    y: ((v.norte - punto.lat) / (v.norte - v.sur)) * v.alto,
  };
}

/* ---------- Ruta propuesta por cercanía ---------- */

/**
 * La bodega: de donde sale la ruta.
 *
 * Es el punto negro de `datos/tiendas.kmz` y el origen de toda ruta propuesta.
 * Está acá como constante y no se lee de la base porque es la única
 * coordenada de la que depende un cálculo: si la tabla no estuviera cargada,
 * la pantalla se quedaría sin proponer nada en vez de proponer desde el lugar
 * de siempre.
 *
 * Que no se separe de la tabla lo cuida una prueba, que la compara contra la
 * fila BODEGA de `supabase/migracion-06-lugares.sql`.
 */
export const BODEGA = { lat: 19.455207, lon: -99.105858 } as const;

/** Una parada candidata: el viaje y dónde hay que ir. */
export type Parada = { id_viaje: number; lat: number; lon: number };

export type Propuesta = {
  /** Los `id_viaje` en el orden sugerido, arrancando por el más cercano. */
  secuencia: number[];
  /** Cuánto mide el recorrido propuesto, en kilómetros de línea recta. */
  km: number;
  /**
   * Lo que mide el mismo conjunto de paradas siguiendo `Viaje.Orden`.
   * `null` cuando no son comparables, y ahí no se muestra ningún ahorro.
   */
  kmDeclarado: number | null;
};

const RADIO_TIERRA_KM = 6371;

/**
 * Distancia en línea recta entre dos puntos, por haversine.
 *
 * Es la distancia del cuervo, no la de las calles: no hay ruteo por calles acá
 * -haría falta un servicio externo, y esta pantalla no le pide nada a nadie-.
 * Para ordenar paradas dentro de una zona de reparto alcanza, porque lo que
 * decide el orden es cuál está cerca y cuál lejos, y eso la línea recta lo
 * ordena casi siempre igual que la calle. Lo que no se puede hacer con este
 * número es prometer un tiempo de viaje.
 */
export function distanciaKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Lo que mide un recorrido que arranca en `origen` y pasa por los puntos en orden. */
export function largoDeRuta(
  origen: { lat: number; lon: number },
  puntos: { lat: number; lon: number }[],
): number {
  let total = 0;
  let actual = origen;
  for (const punto of puntos) {
    total += distanciaKm(actual, punto);
    actual = punto;
  }
  return total;
}

/**
 * Una ruta propuesta a partir de la cercanía entre paradas.
 *
 * La regla es la que definió la operación: la primera parada es la más cercana
 * a la bodega, la segunda la más cercana a esa primera, y así. Es el «vecino
 * más cercano» de toda la vida, y es deliberado que sea eso y no algo más
 * fino: es una regla que una persona puede seguir con el dedo sobre el mapa y
 * verificar. Un optimizador que devolviera un orden más corto pero distinto
 * del que se pidió sería imposible de discutir con quien lo tiene que usar.
 *
 * Deja kilómetros sobre la mesa —el vecino más cercano se come lo fácil y
 * termina cruzando la zona para juntar lo que quedó suelto, y un paso de 2-opt
 * lo arreglaría— pero eso es un cambio de regla, no un detalle de
 * implementación, y lo decide la operación.
 *
 * Es determinista a propósito. Ante dos paradas a la misma distancia se queda
 * con la primera de la lista, que llega ordenada por `Orden` e `IdViaje` desde
 * la base. Una propuesta que se reacomodara sola en cada actualización no
 * serviría para decirle nada a nadie por teléfono.
 *
 * Lo que devuelve NO es la ruta del sistema y no pisa `Viaje.Orden`: se dibuja
 * aparte, apagada por defecto, y el orden real sigue siendo el que manda en la
 * clasificación y en cuál es el próximo destino.
 */
export function rutaPorCercania(
  origen: { lat: number; lon: number },
  paradas: Parada[],
): Parada[] {
  const restantes = paradas.slice();
  const orden: Parada[] = [];
  let actual: { lat: number; lon: number } = origen;

  while (restantes.length > 0) {
    let elegida = 0;
    let menor = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaKm(actual, restantes[i]);
      // Estrictamente menor: con `<=`, un empate se lo llevaría el último de
      // la lista y el orden dependería de cómo vinieron las filas.
      if (d < menor) {
        menor = d;
        elegida = i;
      }
    }
    const [parada] = restantes.splice(elegida, 1);
    orden.push(parada);
    actual = parada;
  }

  return orden;
}

/**
 * La propuesta completa, con su largo y el del orden declarado para comparar.
 *
 * El origen es la bodega y no la posición del repartidor. Es la ruta que
 * habría que haber armado al salir, así que se mide desde donde se sale; y
 * además así la propuesta existe también para el repartidor cuyo teléfono no
 * está reportando, que es justo de quien menos se sabe.
 *
 * `declarado` son las mismas paradas en el orden que trae el sistema. La
 * comparación solo se ofrece cuando las dos listas cubren exactamente el mismo
 * conjunto: si el orden real deja paradas afuera -porque no traen `Orden` o
 * porque lo comparten con otra-, los dos números medirían recorridos distintos
 * y el «ahorro» sería una ilusión de la resta.
 */
export function proponerRuta(
  paradas: Parada[],
  declarado: Parada[],
  origen: { lat: number; lon: number } = BODEGA,
): Propuesta | null {
  // Con una sola parada no hay nada que ordenar: la propuesta sería el orden
  // real, y ofrecerla como alternativa solo agregaría ruido al mapa.
  if (paradas.length < 2) return null;

  const secuencia = rutaPorCercania(origen, paradas);

  const mismos =
    declarado.length === paradas.length &&
    new Set(declarado.map((p) => p.id_viaje)).size === declarado.length &&
    declarado.every((p) => paradas.some((q) => q.id_viaje === p.id_viaje));

  return {
    secuencia: secuencia.map((p) => p.id_viaje),
    km: largoDeRuta(origen, secuencia),
    kmDeclarado: mismos ? largoDeRuta(origen, declarado) : null,
  };
}
