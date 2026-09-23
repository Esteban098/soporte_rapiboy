import {
  BODEGA,
  ZONA_OPERACION,
  colorDeDriver,
  coordenadaValida,
  distanciaKm,
  estadoPosicion,
  type EstadoPosicion,
} from "./tracker";

/**
 * Las colectas de hoy, en vivo, sobre el mapa de Tiendas.
 *
 * La foto la escribe el flujo 12 de n8n en `colectas_vivo` y
 * `colectas_vivo_drivers`: una fila por colecta y una por repartidor con su
 * última posición conocida. Este módulo no lee la base ni importa nada de
 * servidor —son los tipos y las reglas— para que lo usen igual la página, el
 * mapa del navegador y las pruebas.
 *
 * Lo que agrega sobre la foto es lo que el sistema no guarda: el nombre del
 * estado, la ruta que le queda a cada repartidor y las inconsistencias que
 * hay que mirar.
 */

/* ---------- Filas de la base ---------- */

/** Una fila de `colectas_vivo`, tal como la devuelve PostgREST. */
export type ColectaVivoFila = {
  id_colecta: number;
  fecha_operacion: string;
  id_estado: number | null;
  creada_en: string | null;
  solicitada_en: string | null;
  colectada_en: string | null;
  llego_deposito_en: string | null;
  cancelada_en: string | null;
  estado_desde: string | null;
  aceptada_en: string | null;
  en_camino_en: string | null;
  en_local_en: string | null;
  retirada_en: string | null;
  finalizada_en: string | null;
  en_deposito_en: string | null;
  hora_desde: string | null;
  hora_hasta: string | null;
  id_turno: number | null;
  id_reserva: number | null;
  reserva_cancelada: boolean | null;
  id_motoboy: number | null;
  id_motoboy_reserva: number | null;
  id_seller: number | null;
  seller: string | null;
  direccion_seller: string | null;
  latitud_tienda: number | null;
  longitud_tienda: number | null;
  cantidad_pedidos: number | null;
  paquetes_solicitados: number | null;
  paquetes_colectados: number | null;
  cantidad_bultos: number | null;
  id_deposito: number | null;
  depositos_visitados: string | null;
  comentario: string | null;
  sincronizado_en: string;
};

/** Una fila de `colectas_vivo_drivers`. */
export type DriverVivoFila = {
  id_motoboy: number;
  fecha_operacion: string;
  nombre: string | null;
  apellido: string | null;
  latitud: number | null;
  longitud: number | null;
  posicion_en: string | null;
  sincronizado_en: string;
};

/**
 * Lo que la página le pasa al mapa. `lugarDeColecta` es el dropOFF que la
 * asignación del flujo 06 le conoce a cada comercio, por `id_seller`: el
 * sistema no lo guarda en la colecta.
 */
export type ColectasDelDia = {
  dia: string;
  colectas: ColectaVivoFila[];
  drivers: DriverVivoFila[];
  lugarDeColecta: Record<number, string>;
  /**
   * Si las posiciones vienen sacadas. El rol comercial ve las colectas pero
   * no dónde está cada persona: esa es información del live tracker, del que
   * está afuera a propósito.
   */
  sinPosiciones: boolean;
};

/* ---------- Estados ---------- */

/**
 * El catálogo de `Colecta.IdEstado` (EstadoColectaEnum del sistema).
 *
 * No se cruza con `EstadoViaje`: aquel es el estado de los paquetes y este el
 * de la colecta, y comparten números sin compartir significado.
 */
export type EstadoColecta =
  | "ASIGNADA"
  | "ACEPTADA"
  | "EN_CAMINO"
  | "EN_LOCAL"
  | "RETIRADA"
  | "EN_DEPOSITO"
  | "FINALIZADA"
  | "FINALIZADA_PARCIAL"
  | "CANCELADA"
  | "SIN_CLASIFICAR";

const ESTADO_POR_ID: Record<number, EstadoColecta> = {
  1: "ASIGNADA",
  2: "EN_CAMINO",
  3: "RETIRADA",
  4: "FINALIZADA",
  5: "FINALIZADA_PARCIAL",
  6: "EN_LOCAL",
  7: "ACEPTADA",
  8: "EN_DEPOSITO",
};

export const ETIQUETA_ESTADO: Record<EstadoColecta, string> = {
  ASIGNADA: "Asignada",
  ACEPTADA: "Aceptada",
  EN_CAMINO: "En camino",
  EN_LOCAL: "En local",
  RETIRADA: "Retirada",
  EN_DEPOSITO: "En depósito",
  FINALIZADA: "Finalizada",
  FINALIZADA_PARCIAL: "Finalizada parcial",
  CANCELADA: "Cancelada",
  SIN_CLASIFICAR: "Sin clasificar",
};

/**
 * El estado que se muestra.
 *
 * La cancelación manda sobre el número: el catálogo no tiene un estado
 * «Cancelada», así que una colecta cancelada conserva el último que tuvo y
 * solo `FechaCancelada` dice que ya no va.
 */
export function estadoColecta(fila: Pick<ColectaVivoFila, "id_estado" | "cancelada_en">): EstadoColecta {
  if (fila.cancelada_en) return "CANCELADA";
  return (fila.id_estado != null && ESTADO_POR_ID[fila.id_estado]) || "SIN_CLASIFICAR";
}

/**
 * En qué punto del recorrido está la colecta, que es lo que decide el mapa.
 *
 * - PENDIENTE: el repartidor todavía no salió hacia la tienda.
 * - EN_CURSO: va en camino o ya está en el local.
 * - RETIRADA: tiene los paquetes y le falta llevarlos a la bodega.
 * - CERRADA: los paquetes llegaron.
 */
export type Fase = "PENDIENTE" | "EN_CURSO" | "RETIRADA" | "CERRADA" | "CANCELADA" | "SIN_CLASIFICAR";

const FASE_DE: Record<EstadoColecta, Fase> = {
  ASIGNADA: "PENDIENTE",
  ACEPTADA: "PENDIENTE",
  EN_CAMINO: "EN_CURSO",
  EN_LOCAL: "EN_CURSO",
  RETIRADA: "RETIRADA",
  EN_DEPOSITO: "CERRADA",
  FINALIZADA: "CERRADA",
  FINALIZADA_PARCIAL: "CERRADA",
  CANCELADA: "CANCELADA",
  SIN_CLASIFICAR: "SIN_CLASIFICAR",
};

export function faseDe(estado: EstadoColecta): Fase {
  return FASE_DE[estado];
}

export const FASES: Fase[] = ["PENDIENTE", "EN_CURSO", "RETIRADA", "CERRADA", "CANCELADA", "SIN_CLASIFICAR"];

export const ETIQUETA_FASE: Record<Fase, string> = {
  PENDIENTE: "Por colectar",
  EN_CURSO: "En camino o en local",
  RETIRADA: "Retirada, va a bodega",
  CERRADA: "En bodega",
  CANCELADA: "Cancelada",
  SIN_CLASIFICAR: "Sin clasificar",
};

/**
 * El color de cada fase. Salen de las variables del tema, las mismas que los
 * estados de paquetes, para que «por retirar», «retirado» y «en depósito» se
 * lean igual en todo el tablero.
 */
export const COLOR_FASE: Record<Fase, string> = {
  PENDIENTE: "var(--estado-pararetirar, #7d51c7)",
  EN_CURSO: "var(--estado-devolucion, #ffe600)",
  RETIRADA: "var(--estado-retirado, #0f7a91)",
  CERRADA: "var(--estado-entregado, #248a3d)",
  CANCELADA: "var(--estado-cancelado, #6c6c70)",
  SIN_CLASIFICAR: "var(--estado-noentregado, #d70015)",
};

/** Si a la colecta todavía le falta que el repartidor pase por la tienda. */
export function faltaPasar(fase: Fase): boolean {
  return fase === "PENDIENTE" || fase === "EN_CURSO";
}

/** Si la colecta sigue abierta: falta pasar o falta llegar a la bodega. */
export function estaActiva(fase: Fase): boolean {
  return faltaPasar(fase) || fase === "RETIRADA";
}

/* ---------- Colecta lista para mostrar ---------- */

export type Punto = { lat: number; lon: number };

export type ColectaVivo = ColectaVivoFila & {
  estado: EstadoColecta;
  fase: Fase;
  /** El repartidor: el de la colecta o, si falta, el de su reserva. */
  idDriver: number | null;
  tienda: Punto | null;
  /** El dropOFF donde se colecta de hecho, si no es la tienda misma. */
  lugar: string | null;
  /** Ventana horaria en minutos del día, o `null` si no hay una utilizable. */
  ventana: { desde: number; hasta: number } | null;
};

/**
 * 'HH:MM' a minutos del día. Una ventana vacía o invertida —el sistema carga
 * '01:00'–'01:00' cuando no hay— no es una ventana.
 */
export function ventanaDe(desde: string | null, hasta: string | null): { desde: number; hasta: number } | null {
  const minutos = (v: string | null) => {
    const m = v ? /^(\d{2}):(\d{2})$/.exec(v) : null;
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const d = minutos(desde);
  const h = minutos(hasta);
  return d != null && h != null && d < h ? { desde: d, hasta: h } : null;
}

export function prepararColecta(fila: ColectaVivoFila, lugarDeColecta: Record<number, string> = {}): ColectaVivo {
  const estado = estadoColecta(fila);
  const lugar = fila.id_seller != null ? lugarDeColecta[fila.id_seller] ?? null : null;
  return {
    ...fila,
    estado,
    fase: faseDe(estado),
    idDriver: fila.id_motoboy ?? fila.id_motoboy_reserva ?? null,
    tienda: coordenadaValida(fila.latitud_tienda, fila.longitud_tienda)
      ? { lat: fila.latitud_tienda as number, lon: fila.longitud_tienda as number }
      : null,
    lugar: lugar && normalizar(lugar) !== normalizar(fila.seller ?? "") ? lugar : null,
    ventana: ventanaDe(fila.hora_desde, fila.hora_hasta),
  };
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/* ---------- Paquetes ---------- */

/**
 * Los paquetes de una colecta, en los tres momentos en que el sistema los
 * cuenta. Ninguno alcanza solo:
 *
 * - `esperados`: los ids de `IdPedidos`, lo que se sabe antes de pasar. Los
 *   dropOFF no lo traen, porque juntan paquetes de otros comercios.
 * - `retirados`: `CantidadPaquetes`, que el sistema llena recién al retirar
 *   (hasta ahí vale 0).
 * - `enBodega`: `CantidadPaquetesColectados`, al llegar a la bodega.
 *
 * `faltantes` solo existe para una colecta cerrada: antes de llegar a la
 * bodega, que los colectados sean 0 no es una falta, es que todavía no llegó.
 */
export type Paquetes = {
  esperados: number | null;
  retirados: number;
  enBodega: number;
  faltantes: number | null;
  porcentaje: number | null;
};

export function paquetesDe(c: Pick<ColectaVivo, "cantidad_pedidos" | "paquetes_solicitados" | "paquetes_colectados" | "fase">): Paquetes {
  const retirados = c.paquetes_solicitados ?? 0;
  const enBodega = c.paquetes_colectados ?? 0;
  const cerrada = c.fase === "CERRADA";
  return {
    esperados: c.cantidad_pedidos,
    retirados,
    enBodega,
    faltantes: cerrada ? Math.max(retirados - enBodega, 0) : null,
    porcentaje: cerrada && retirados > 0 ? (enBodega * 100) / retirados : null,
  };
}

/** Lo que se sabe hoy de cuántos paquetes tiene la colecta. */
export function paquetesEstimados(c: ColectaVivo): number {
  const p = paquetesDe(c);
  return Math.max(p.retirados, p.enBodega, p.esperados ?? 0);
}

/* ---------- Ruta calculada ---------- */

/**
 * Qué tan adelantada está una colecta que todavía falta visitar. Las que ya
 * están en local o en camino van primero: el repartidor ya se comprometió con
 * esa parada.
 */
function prioridadDeEstado(estado: EstadoColecta): number {
  if (estado === "EN_LOCAL") return 0;
  if (estado === "EN_CAMINO") return 1;
  if (estado === "ACEPTADA") return 2;
  return 3;
}

/**
 * La ruta que le queda a un repartidor: las tiendas que le falta visitar, en
 * orden.
 *
 * El sistema no guarda un orden de paradas para las colectas, así que esto se
 * calcula y se muestra como calculado. La regla es la acordada, en este orden:
 *
 *   1. la ventana horaria que cierra antes;
 *   2. las que ya están en local o en camino, después las aceptadas;
 *   3. la más cercana al punto anterior (al principio, a la posición del
 *      repartidor);
 *   4. la solicitud más antigua;
 *   5. el id de la colecta, para que el orden no cambie entre lecturas.
 *
 * Es un vecino más cercano con prioridades: una regla que se puede seguir con
 * el dedo sobre el mapa y discutir por teléfono. Sin posición del repartidor,
 * la primera parada sale de las prioridades y del orden de solicitud.
 *
 * Las colectas sin coordenadas de tienda van al final: tienen que figurar en
 * la lista, pero no hay dónde dibujarlas.
 */
export function rutaPendiente(origen: Punto | null, colectas: ColectaVivo[]): ColectaVivo[] {
  const conPunto = colectas.filter((c) => faltaPasar(c.fase) && c.tienda);
  const sinPunto = colectas
    .filter((c) => faltaPasar(c.fase) && !c.tienda)
    .sort((a, b) => a.id_colecta - b.id_colecta);

  const orden: ColectaVivo[] = [];
  let actual = origen;

  while (conPunto.length > 0) {
    let elegida = 0;
    for (let i = 1; i < conPunto.length; i++) {
      if (compararParada(conPunto[i], conPunto[elegida], actual) < 0) elegida = i;
    }
    const [parada] = conPunto.splice(elegida, 1);
    orden.push(parada);
    actual = parada.tienda;
  }

  return [...orden, ...sinPunto];
}

function compararParada(a: ColectaVivo, b: ColectaVivo, desde: Punto | null): number {
  const ventana = (a.ventana?.hasta ?? Infinity) - (b.ventana?.hasta ?? Infinity);
  if (ventana !== 0 && Number.isFinite(ventana)) return ventana;
  if (a.ventana && !b.ventana) return -1;
  if (!a.ventana && b.ventana) return 1;

  const prioridad = prioridadDeEstado(a.estado) - prioridadDeEstado(b.estado);
  if (prioridad !== 0) return prioridad;

  if (desde && a.tienda && b.tienda) {
    const distancia = distanciaKm(desde, a.tienda) - distanciaKm(desde, b.tienda);
    // Menos de 10 m es la misma puerta: se desempata por lo que sigue.
    if (Math.abs(distancia) > 0.01) return distancia;
  }

  const solicitud = marcaDe(a.solicitada_en ?? a.creada_en) - marcaDe(b.solicitada_en ?? b.creada_en);
  if (solicitud !== 0 && Number.isFinite(solicitud)) return solicitud;

  return a.id_colecta - b.id_colecta;
}

function marcaDe(fecha: string | null): number {
  const t = fecha ? Date.parse(fecha) : NaN;
  return Number.isFinite(t) ? t : Infinity;
}

/**
 * Los puntos de la línea que se dibuja: la posición del repartidor, las
 * tiendas que le faltan y la bodega al final si lleva o va a llevar
 * paquetes. Sin posición, la línea arranca en la primera tienda.
 */
export function trazoDeRuta(origen: Punto | null, ruta: ColectaVivo[], llevaPaquetes: boolean): Punto[] {
  const puntos: Punto[] = [];
  if (origen) puntos.push(origen);
  for (const c of ruta) if (c.tienda) puntos.push(c.tienda);
  if (llevaPaquetes || ruta.length > 0) puntos.push(BODEGA);
  return puntos.length >= 2 ? puntos : [];
}

/* ---------- Recorrido hecho ---------- */

/** Una fila de `colectas_vivo_posiciones`: un reporte del teléfono. */
export type PosicionRecorrido = { lat: number; lon: number; en: string };

/** Un punto del camino ya recorrido, con qué fue. */
export type PasoRecorrido = Punto & {
  en: string;
  tipo: "GPS" | "TIENDA" | "BODEGA" | "ACTUAL";
  /** La colecta, cuando el paso es una tienda. */
  id_colecta?: number;
};

/** Cuándo estuvo el repartidor en la tienda: al llegar al local o, si no quedó, al retirar. */
export function momentoEnTienda(c: Pick<ColectaVivoFila, "en_local_en" | "retirada_en">): string | null {
  return c.en_local_en ?? c.retirada_en ?? null;
}

/**
 * Por dónde anduvo el repartidor hoy, en orden de hora.
 *
 * RapiboyData no guarda un historial de posiciones, así que el camino se arma
 * con lo que sí se sabe con hora:
 *
 * - las tiendas por las que pasó, en el momento en que llegó al local o
 *   retiró (del historial de la colecta);
 * - los reportes del teléfono que fue guardando el flujo 12, uno cada vez que
 *   cambió la posición;
 * - la bodega, cuando alguna colecta ya llegó;
 * - y al final, la última posición conocida.
 *
 * Entre dos puntos se dibuja una recta: es por dónde pasó, no por qué calles.
 * Dos puntos seguidos a menos de 30 m son el mismo lugar y se dejan uno.
 */
export function recorridoHecho(
  colectas: ColectaVivo[],
  gps: PosicionRecorrido[],
  actual: { punto: Punto; en: string | null } | null,
): PasoRecorrido[] {
  const pasos: PasoRecorrido[] = [];

  for (const c of colectas) {
    const en = momentoEnTienda(c);
    if (c.tienda && en && Number.isFinite(marcaDe(en))) {
      pasos.push({ ...c.tienda, en, tipo: "TIENDA", id_colecta: c.id_colecta });
    }
    const bodega = c.en_deposito_en ?? c.finalizada_en ?? c.llego_deposito_en;
    if (c.fase === "CERRADA" && bodega && Number.isFinite(marcaDe(bodega))) {
      pasos.push({ ...BODEGA, en: bodega, tipo: "BODEGA" });
    }
  }
  for (const p of gps) {
    if (coordenadaValida(p.lat, p.lon) && Number.isFinite(marcaDe(p.en))) {
      pasos.push({ lat: p.lat, lon: p.lon, en: p.en, tipo: "GPS" });
    }
  }

  pasos.sort((a, b) => marcaDe(a.en) - marcaDe(b.en));

  // La posición actual cierra el camino solo si es posterior a lo último que
  // se sabe: una posición vieja no puede ir después de una tienda de recién.
  if (actual) {
    const t = marcaDe(actual.en);
    const ultimo = pasos.length > 0 ? marcaDe(pasos[pasos.length - 1].en) : -Infinity;
    if (!Number.isFinite(t) || t >= ultimo) {
      pasos.push({ ...actual.punto, en: actual.en ?? new Date(Math.max(ultimo, 0)).toISOString(), tipo: "ACTUAL" });
    }
  }

  const limpio: PasoRecorrido[] = [];
  for (const paso of pasos) {
    const anterior = limpio[limpio.length - 1];
    if (anterior && distanciaKm(anterior, paso) < 0.03) {
      // Una tienda o la bodega dicen más que un reporte del teléfono en el
      // mismo lugar: si coinciden, queda la tienda.
      if (anterior.tipo === "GPS" && paso.tipo !== "GPS") limpio[limpio.length - 1] = paso;
      continue;
    }
    limpio.push(paso);
  }
  return limpio.length >= 2 ? limpio : [];
}

/** Las tiendas por las que ya pasó, en el orden en que pasó. */
export function tiendasVisitadas(colectas: ColectaVivo[]): ColectaVivo[] {
  return colectas
    .filter((c) => momentoEnTienda(c) != null && !faltaPasar(c.fase))
    .sort((a, b) => marcaDe(momentoEnTienda(a)) - marcaDe(momentoEnTienda(b)) || a.id_colecta - b.id_colecta);
}

/* ---------- Resumen por repartidor ---------- */

export type ResumenDriver = {
  /** `null` agrupa las colectas que no tienen repartidor. */
  id: number | null;
  nombre: string;
  color: string;
  posicion: Punto | null;
  posicionEn: string | null;
  colectas: ColectaVivo[];
  /** Las tiendas que le faltan, en el orden calculado. */
  ruta: ColectaVivo[];
  trazo: Punto[];
  porFase: Record<Fase, number>;
  tiendas: number;
  paquetes: number;
  /** Distancia en línea recta de lo que le queda, hasta la bodega. */
  kmRestantes: number | null;
  /** El último cambio de estado de cualquiera de sus colectas. */
  ultimoMovimiento: string | null;
};

export function nombreDeRepartidor(driver: Pick<DriverVivoFila, "nombre" | "apellido"> | undefined, id: number | null): string {
  if (id == null) return "Sin repartidor";
  const completo = [driver?.nombre, driver?.apellido].map((p) => p?.trim() ?? "").filter(Boolean).join(" ");
  return completo || `Repartidor ${id}`;
}

/**
 * Agrupa las colectas por repartidor y le calcula a cada uno lo que le falta.
 *
 * Primero los que tienen algo abierto, con más paradas pendientes arriba; los
 * que ya terminaron, al final; y «sin repartidor» primero de todos si existe,
 * porque es lo que hay que resolver.
 */
export function resumirPorDriver(dia: ColectasDelDia): ResumenDriver[] {
  const colectas = dia.colectas.map((f) => prepararColecta(f, dia.lugarDeColecta));
  const drivers = new Map(dia.drivers.map((d) => [d.id_motoboy, d]));
  const grupos = new Map<number | null, ColectaVivo[]>();
  for (const c of colectas) {
    const lista = grupos.get(c.idDriver) ?? [];
    lista.push(c);
    grupos.set(c.idDriver, lista);
  }

  const resumenes = [...grupos.entries()].map(([id, lista]): ResumenDriver => {
    const driver = id != null ? drivers.get(id) : undefined;
    const posicion =
      !dia.sinPosiciones && driver && coordenadaValida(driver.latitud, driver.longitud)
        ? { lat: driver.latitud as number, lon: driver.longitud as number }
        : null;

    const ruta = id == null ? [] : rutaPendiente(posicion, lista);
    const llevaPaquetes = lista.some((c) => c.fase === "RETIRADA");
    const trazo = id == null ? [] : trazoDeRuta(posicion, ruta, llevaPaquetes);

    const porFase = Object.fromEntries(FASES.map((f) => [f, 0])) as Record<Fase, number>;
    for (const c of lista) porFase[c.fase] += 1;

    let km: number | null = null;
    if (trazo.length >= 2) {
      km = 0;
      for (let i = 1; i < trazo.length; i++) km += distanciaKm(trazo[i - 1], trazo[i]);
    }

    const movimientos = lista.map((c) => marcaDe(c.estado_desde)).filter(Number.isFinite);

    return {
      id,
      nombre: nombreDeRepartidor(driver, id),
      color: id != null ? colorDeDriver(id) : "var(--muted, #6b7280)",
      posicion,
      posicionEn: dia.sinPosiciones ? null : driver?.posicion_en ?? null,
      colectas: lista.sort((a, b) => a.id_colecta - b.id_colecta),
      ruta,
      trazo,
      porFase,
      tiendas: new Set(lista.map((c) => c.id_seller ?? c.id_colecta)).size,
      paquetes: lista.reduce((suma, c) => suma + paquetesEstimados(c), 0),
      kmRestantes: km,
      ultimoMovimiento: movimientos.length > 0 ? new Date(Math.max(...movimientos)).toISOString() : null,
    };
  });

  const abiertas = (r: ResumenDriver) => r.porFase.PENDIENTE + r.porFase.EN_CURSO + r.porFase.RETIRADA;
  return resumenes.sort(
    (a, b) =>
      Number(b.id == null) - Number(a.id == null) ||
      Number(abiertas(b) > 0) - Number(abiertas(a) > 0) ||
      b.ruta.length - a.ruta.length ||
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
  );
}

/* ---------- Totales del día ---------- */

export type TotalesDia = {
  colectas: number;
  porFase: Record<Fase, number>;
  drivers: number;
  tiendas: number;
  paquetes: { esperados: number; retirados: number; enBodega: number; faltantes: number };
  /** Promedio de minutos entre retirar y llegar a la bodega, de las cerradas. */
  minutosABodega: number | null;
  /** La corrida más reciente del flujo: de cuándo es la foto. */
  sincronizadoEn: string | null;
};

export function totalesDelDia(dia: ColectasDelDia): TotalesDia {
  const colectas = dia.colectas.map((f) => prepararColecta(f, dia.lugarDeColecta));
  const porFase = Object.fromEntries(FASES.map((f) => [f, 0])) as Record<Fase, number>;
  const paquetes = { esperados: 0, retirados: 0, enBodega: 0, faltantes: 0 };
  const tiempos: number[] = [];

  for (const c of colectas) {
    porFase[c.fase] += 1;
    const p = paquetesDe(c);
    paquetes.esperados += p.esperados ?? 0;
    paquetes.retirados += p.retirados;
    paquetes.enBodega += p.enBodega;
    paquetes.faltantes += p.faltantes ?? 0;

    const desde = marcaDe(c.retirada_en);
    const hasta = marcaDe(c.en_deposito_en ?? c.finalizada_en ?? c.llego_deposito_en);
    if (c.fase === "CERRADA" && Number.isFinite(desde) && Number.isFinite(hasta) && hasta >= desde) {
      tiempos.push((hasta - desde) / 60_000);
    }
  }

  return {
    colectas: colectas.length,
    porFase,
    drivers: new Set(colectas.map((c) => c.idDriver).filter((id) => id != null)).size,
    tiendas: new Set(colectas.map((c) => c.id_seller ?? -c.id_colecta)).size,
    paquetes,
    minutosABodega: tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
    sincronizadoEn: ultimaSincronizacion(dia.colectas),
  };
}

export function ultimaSincronizacion(filas: Pick<ColectaVivoFila, "sincronizado_en">[]): string | null {
  const marcas = filas.map((f) => marcaDe(f.sincronizado_en)).filter(Number.isFinite);
  return marcas.length > 0 ? new Date(Math.max(...marcas)).toISOString() : null;
}

/* ---------- Controles de calidad ---------- */

export type TipoAlerta =
  | "SIN_REPARTIDOR"
  | "SIN_RESERVA"
  | "REPARTIDOR_DISTINTO"
  | "RESERVA_CANCELADA"
  | "TIENDA_SIN_COORDENADAS"
  | "REPARTIDOR_SIN_POSICION"
  | "POSICION_VIEJA"
  | "EN_LOCAL_DEMORADA"
  | "COLECTADOS_DE_MAS"
  | "CERRADA_SIN_FECHA"
  | "RETIRADA_SIN_PAQUETES"
  | "FECHAS_INVERTIDAS"
  | "NO_SINCRONIZADA"
  | "SIN_CLASIFICAR";

export type Alerta = {
  tipo: TipoAlerta;
  /** `critica` pide hacer algo ya; `aviso` es un dato a revisar. */
  nivel: "critica" | "aviso";
  id_colecta: number | null;
  id_motoboy: number | null;
  texto: string;
};

/** A partir de cuántos minutos en el local se avisa. */
export const MINUTOS_EN_LOCAL_PARA_ALERTA = 20;

/**
 * Lo que hay que revisar de la jornada: colectas sin repartidor, datos que no
 * cierran y repartidores que no están transmitiendo.
 *
 * `ahora` entra como parámetro para que las pruebas no dependan del reloj; la
 * pantalla pasa el del navegador. Con `null` —el render del servidor, que no
 * puede usar su reloj sin desencontrarse del navegador al hidratar— se
 * omiten las alertas que dependen de la hora.
 */
export function alertasDelDia(dia: ColectasDelDia, ahora: number | null): Alerta[] {
  const alertas: Alerta[] = [];
  const ultima = marcaDe(ultimaSincronizacion(dia.colectas));
  const nombres = new Map(dia.drivers.map((d) => [d.id_motoboy, nombreDeRepartidor(d, d.id_motoboy)]));

  for (const fila of dia.colectas) {
    const c = prepararColecta(fila, dia.lugarDeColecta);
    const tienda = c.seller ?? `Tienda ${c.id_seller ?? "sin id"}`;
    const de = (texto: string) => `${tienda} (#${c.id_colecta}): ${texto}`;
    const alta = (tipo: TipoAlerta, nivel: Alerta["nivel"], texto: string) =>
      alertas.push({ tipo, nivel, id_colecta: c.id_colecta, id_motoboy: c.idDriver, texto: de(texto) });

    const activa = estaActiva(c.fase);

    if (c.fase === "SIN_CLASIFICAR") alta("SIN_CLASIFICAR", "aviso", `el estado ${c.id_estado ?? "vacío"} no está en el catálogo`);
    if (activa && c.idDriver == null) alta("SIN_REPARTIDOR", "critica", "no tiene repartidor asignado");
    if (activa && c.id_reserva == null) alta("SIN_RESERVA", "aviso", "no tiene reserva");
    if (c.id_motoboy != null && c.id_motoboy_reserva != null && c.id_motoboy !== c.id_motoboy_reserva) {
      alta(
        "REPARTIDOR_DISTINTO",
        "aviso",
        `la colecta es de ${nombres.get(c.id_motoboy) ?? c.id_motoboy} y la reserva de ${nombres.get(c.id_motoboy_reserva) ?? c.id_motoboy_reserva}`,
      );
    }
    if (activa && c.reserva_cancelada) alta("RESERVA_CANCELADA", "critica", "la reserva está cancelada y la colecta sigue abierta");
    if (activa && !c.tienda) alta("TIENDA_SIN_COORDENADAS", "aviso", "la tienda no tiene coordenadas, no se puede ubicar en el mapa");

    if (ahora != null && c.estado === "EN_LOCAL") {
      const minutos = Math.floor((ahora - marcaDe(c.estado_desde)) / 60_000);
      if (Number.isFinite(minutos) && minutos >= MINUTOS_EN_LOCAL_PARA_ALERTA) {
        alta("EN_LOCAL_DEMORADA", "critica", `lleva ${minutos} min en el local sin retirar`);
      }
    }

    const retirados = c.paquetes_solicitados ?? 0;
    const enBodega = c.paquetes_colectados ?? 0;
    if (retirados > 0 && enBodega > retirados) alta("COLECTADOS_DE_MAS", "aviso", `llegaron ${enBodega} paquetes a bodega de ${retirados} retirados`);
    if (c.fase === "CERRADA" && !c.colectada_en) alta("CERRADA_SIN_FECHA", "aviso", "está cerrada y no tiene fecha de colecta");
    if (c.estado === "RETIRADA" && retirados === 0) alta("RETIRADA_SIN_PAQUETES", "aviso", "figura retirada con 0 paquetes");

    /*
     * «Llegó al depósito antes de la fecha de colecta» NO se marca, aunque
     * parezca invertido: en México pasa en dos de cada tres colectas
     * (181 de 268 en septiembre de 2026), porque el sistema escribe
     * `FechaColecta` al cerrarla en la bodega y no al retirar. Marcarlo
     * llenaría la lista de falsas alarmas. La hora real de retiro es
     * `retirada_en`, del historial.
     */
    const solicitada = marcaDe(c.solicitada_en);
    const colectada = marcaDe(c.colectada_en);
    if (Number.isFinite(solicitada) && Number.isFinite(colectada) && colectada < solicitada) {
      alta("FECHAS_INVERTIDAS", "aviso", "la fecha de colecta es anterior a la de solicitud");
    }

    if (Number.isFinite(ultima) && marcaDe(c.sincronizado_en) < ultima - 60_000) {
      alta("NO_SINCRONIZADA", "aviso", "la última actualización ya no la trajo; puede haberse movido de día o borrado");
    }
  }

  if (ahora != null && !dia.sinPosiciones) {
    for (const r of resumirPorDriver(dia)) {
      if (r.id == null) continue;
      if (r.porFase.PENDIENTE + r.porFase.EN_CURSO + r.porFase.RETIRADA === 0) continue;
      const driver = dia.drivers.find((d) => d.id_motoboy === r.id);
      const { estado, minutos } = estadoPosicion(driver?.latitud ?? null, driver?.longitud ?? null, driver?.posicion_en ?? null, ahora);
      if (estado === "SIN_POSICION" || estado === "SIN_FECHA") {
        alertas.push({ tipo: "REPARTIDOR_SIN_POSICION", nivel: "aviso", id_colecta: null, id_motoboy: r.id, texto: `${r.nombre}: tiene colectas abiertas y no reporta posición` });
      } else if (estado === "VIEJA" && minutos != null) {
        alertas.push({ tipo: "POSICION_VIEJA", nivel: "aviso", id_colecta: null, id_motoboy: r.id, texto: `${r.nombre}: la última posición es de hace ${textoMinutos(minutos)}` });
      }
    }
  }

  return alertas.sort((a, b) => Number(b.nivel === "critica") - Number(a.nivel === "critica"));
}

/* ---------- Formato ---------- */

/** Hora visible de operación, siempre Argentina. */
export function horaArgentina(fecha: string | null): string {
  const t = marcaDe(fecha);
  if (!Number.isFinite(t)) return "—";
  return `${new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(t))} hs arg`;
}

/** «12 min», «2 h 05 min». */
export function textoMinutos(minutos: number): string {
  if (minutos < 60) return `${Math.max(minutos, 0)} min`;
  const h = Math.floor(minutos / 60);
  return `${h} h ${String(minutos % 60).padStart(2, "0")} min`;
}

/** «hace 12 min», o `null` sin fecha o sin reloj (en el servidor). */
export function hace(fecha: string | null, ahora: number | null): string | null {
  const t = marcaDe(fecha);
  if (ahora == null || !Number.isFinite(t)) return null;
  return `hace ${textoMinutos(Math.floor((ahora - t) / 60_000))}`;
}

/** La etiqueta y la clase de la antigüedad de una posición, para el panel. */
export function antiguedadPosicion(
  posicion: Punto | null,
  fecha: string | null,
  ahora: number,
): { estado: EstadoPosicion; texto: string } {
  const { estado, minutos } = estadoPosicion(posicion?.lat ?? null, posicion?.lon ?? null, fecha, ahora);
  if (estado === "SIN_POSICION") return { estado, texto: "sin posición" };
  if (estado === "SIN_FECHA" || minutos == null) return { estado, texto: "posición sin fecha" };
  return { estado, texto: `hace ${textoMinutos(minutos)}` };
}

/** Los hitos de una colecta que ya ocurrieron, en orden, para la ficha. */
export function hitosDe(c: ColectaVivoFila): { etiqueta: string; fecha: string }[] {
  const hitos: [string, string | null][] = [
    ["Creada", c.creada_en],
    ["Solicitada", c.solicitada_en],
    ["Aceptada", c.aceptada_en],
    ["En camino", c.en_camino_en],
    ["En local", c.en_local_en],
    ["Retirada", c.retirada_en],
    ["Colecta registrada", c.colectada_en],
    ["En depósito", c.en_deposito_en],
    ["Llegó a depósito", c.llego_deposito_en],
    ["Finalizada", c.finalizada_en],
    ["Cancelada", c.cancelada_en],
  ];
  return hitos
    .filter((h): h is [string, string] => Boolean(h[1]) && Number.isFinite(marcaDe(h[1])))
    .map(([etiqueta, fecha]) => ({ etiqueta, fecha }))
    .sort((a, b) => marcaDe(a.fecha) - marcaDe(b.fecha));
}
