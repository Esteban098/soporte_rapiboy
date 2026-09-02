/**
 * Normalización de las filas del libro.
 *
 * El esquema del sheet cambió varias veces: `Repartidor` pasó a `Driver`,
 * `Polígono` perdió el acento, los encabezados traen saltos de línea y las
 * fechas conviven en tres formatos. Todo eso se resuelve acá para que el resto
 * de la app trabaje con un solo tipo de dato.
 */

import { mesDe } from "./periodos";

export type Pedido = {
  id: number;
  creacion: Date | null;
  /**
   * Fecha del último cambio de estado, no una entrega comprometida. La columna
   * se pisa cada vez que el paquete se mueve: si no se entregó el 20 y volvió a
   * la tienda el 24, queda en el 24. Por eso no sirve para saber para cuándo
   * estaba prometida la entrega, y sí para saber hace cuánto que el caso no se
   * mueve.
   */
  ultimoMovimiento: Date | null;
  estado: string;
  repartidor: string;
  tienda: string;
  /** Domicilio de entrega, tal como viene del sistema. */
  destino: string;
  poligono: string;
  visitas: number | null;
  /**
   * Mes al que pertenece el caso, como `2026-08`.
   *
   * Sale de la fecha de creación, no del último movimiento, y esa diferencia
   * es la que hace posible el histórico: un paquete creado el 30 de agosto que
   * se movió el 3 de septiembre pertenece a agosto y se queda ahí para
   * siempre.
   *
   * Con el último movimiento el mes se desarmaba solo: esa columna la reescribe
   * el refresco de estados en cada corrida, así que revisar agosto movía sus
   * casos a septiembre y el mes que se estaba mirando quedaba vacío. El total
   * de un mes cerrado tiene que poder mirarse dos veces y dar lo mismo.
   *
   * Cuando no hay fecha de creación se usa el último movimiento, que es lo
   * único que queda: es preferible ubicar el caso en un mes aproximado a
   * dejarlo fuera de todos.
   */
  mes: string;
  devuelto: boolean;
  entregado: boolean;
  abierto: boolean;
  /**
   * Días que el caso lleva vivo: de la creación al último movimiento. Ojo al
   * interpretarlo: un caso devuelto tiene un valor alto porque la devolución
   * ocurre después, no porque tardar lo haya hecho devolverse.
   */
  diasDeVida: number | null;
  /**
   * Caso resuelto. Sale de la columna CASO del libro, que cierra con
   * Entregado, Devuelto o Siniestrado; `Devolucion` sigue abierto porque la
   * devolución está en curso.
   */
  cerrado: boolean;
  /** Tipificación que cargó soporte con lo que pasó la tienda. Vacío si no hay. */
  reclamoTienda: string;
  /**
   * Lo que pasó la tienda para concretar la entrega. Son datos del cliente, y
   * se muestran en el tablero porque el equipo los necesita para trabajar el
   * caso; por eso el acceso está restringido por login.
   */
  ubicacion: string;
  telefono: string;
  /**
   * La tienda aportó algo con qué trabajar.
   *
   * Es un solo dato y no uno por columna a propósito: `UBICACION` y `TELEFONO`
   * son nombres de columna, no categorías. La tienda manda un teléfono, un link
   * de mapa o una indicación del domicilio, y cae en la que haya a mano. Lo que
   * importa es si mandó algo, no dónde quedó escrito.
   */
  tieneDatosTienda: boolean;
  /**
   * Valor crudo de la columna AVISO: "AVISADO", "NO AVISADO" o vacío. Hoy la
   * fórmula del libro solo produce "NO AVISADO", pero se guarda tal cual para
   * que la tabla distinga los dos casos en cuanto la columna sepa hacerlo.
   */
  aviso: string;
  avisoPendiente: boolean;
  /**
   * URL de la foto de la entrega, si el libro la trae. No se puede reconstruir
   * desde el id: ver `enlaceFotoEntrega`.
   */
  foto: string;
  /** Columnas auxiliares del libro, que el equipo usa para operar. */
  enlace: string;
  /**
   * El mensaje listo para mandarle al repartidor por WhatsApp. En el libro era
   * la columna COPIAR; en la base se llama `informacion_enviar` y la calcula
   * Postgres a partir del reclamo, el domicilio, la ubicación y el teléfono.
   */
  informacionEnviar: string;
  /**
   * Qué tan atrasado está el caso: URGENTE, RETRASADA o A TIEMPO.
   *
   * Se calcula al leer, no se guarda. La fórmula del sheet dependía de TODAY(),
   * así que el valor envejecía hasta que alguien reescribiera la fila: un caso
   * podía mostrar «A TIEMPO» llevando cuatro días parado. Calculado en cada
   * lectura siempre dice la verdad, y Postgres tampoco lo aceptaría como
   * columna generada porque esas tienen que ser deterministas.
   */
  demora: string;
  ids: string;
};

/** Estados que significan que el paquete volvió al vendedor. */
const ESTADOS_DEVOLUCION = new Set([
  "devuelto",
  "devolucion",
  "devolución",
  "devolución en centro de dropoff",
  "devolucion en centro de dropoff",
]);

/** Estados que significan que el caso sigue sin resolverse. */
const ESTADOS_ABIERTOS = new Set([
  "pedido no entregado",
  "en deposito",
  "en depósito",
  "para retirar",
  "retirado en camino a destino",
  "colectado",
  "en centro de dropoff",
  "en deposito con direccion incorrecta",
]);

/**
 * Campos que puede traer una pestaña. No están todos en todas: `Ayer` no tiene
 * visitas, y solo `Mensual` trae reclamo, aviso y caso.
 */
export type CampoPedido =
  | "id"
  | "creacion"
  | "ultimoMovimiento"
  | "estado"
  | "repartidor"
  | "tienda"
  | "destino"
  | "poligono"
  | "visitas"
  | "enlace"
  | "reclamo"
  | "ubicacion"
  | "telefono"
  | "aviso"
  | "caso"
  | "ids"
  | "informacionEnviar"
  | "demora"
  | "foto";

/**
 * Nombres con los que cada campo aparece en el origen de datos.
 *
 * Se lee por nombre y no por posición porque las vistas no comparten el mismo
 * orden: en `Ayer`, la columna 8 es `IDcoma`, mientras que en `Mensual` esa
 * posición es `Visitas`. Leer por posición metía una lista de IDs donde iban
 * las visitas.
 *
 * La lista cubre el libro y la base a la vez: los encabezados del sheet vienen
 * en una sola palabra o con espacios (`FechaCreacion`, `RECLAMO TIENDA`) y las
 * columnas de Postgres en snake_case (`fecha_creacion`, `reclamo_tienda`). Con
 * los dos juegos acá, el mismo normalizador sirve para los dos orígenes y no
 * hace falta renombrar columnas en la base para que el tablero las encuentre.
 */
const ALIAS: Record<Exclude<CampoPedido, "demora">, string[]> = {
  id: ["id"],
  creacion: ["fechacreacion", "fecha creacion", "fecha creación", "fecha_creacion"],
  ultimoMovimiento: [
    "fechaprogramado",
    "fecha programado",
    "fecha progra",
    "fecha programada",
    "fecha_programado",
    "ultimo_movimiento",
  ],
  estado: ["estado"],
  repartidor: ["repartidor", "driver"],
  tienda: ["tienda", "empresa", "seller"],
  destino: ["destino", "domicilio"],
  poligono: ["poligono", "polígono"],
  visitas: ["visitas"],
  enlace: ["enlace"],
  reclamo: ["reclamo tienda", "reclamotienda", "reclamo_tienda"],
  ubicacion: ["ubicacion", "ubicación"],
  telefono: ["telefono", "teléfono"],
  aviso: ["aviso"],
  caso: ["caso"],
  ids: ["ids", "idcoma", "ids sql", "ids_sql"],
  informacionEnviar: ["informacion_enviar", "copiar"],
  foto: ["foto", "foto entrega", "firma", "url foto", "evidencia", "foto_entrega"],
};

export type MapaColumnas = Partial<Record<CampoPedido, number>>;

/** Ubica cada campo en el encabezado de una pestaña. */
export function mapearColumnas(encabezado: string[]): MapaColumnas {
  const normalizado = encabezado.map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
  const mapa: MapaColumnas = {};

  for (const [campo, nombres] of Object.entries(ALIAS) as [CampoPedido, string[]][]) {
    const indice = normalizado.findIndex((c) => nombres.includes(c));
    if (indice >= 0) mapa[campo] = indice;
  }
  return mapa;
}

/**
 * Qué campos trae realmente la vista, para armar sus columnas.
 *
 * `demora` se suma aparte porque no se lee de ninguna columna: se deduce del
 * último movimiento. Si no lo declaráramos acá, la columna «Demora» no
 * aparecería en ninguna tabla aunque el dato exista.
 */
export function camposPresentes(mapa: MapaColumnas): CampoPedido[] {
  const campos = Object.keys(mapa) as CampoPedido[];
  if (mapa.ultimoMovimiento != null) campos.push("demora");
  return campos;
}

function celda(fila: string[], indice: number | undefined): string {
  if (indice == null) return "";
  const valor = fila[indice];
  if (valor == null) return "";
  const texto = String(valor).replace(/\s+/g, " ").trim();
  return texto.toLowerCase() === "nan" ? "" : texto;
}

/** Estados que la columna CASO del libro considera resueltos. */
const ESTADOS_CERRADOS = new Set(["entregado", "devuelto", "siniestrado"]);

export function parsearFecha(valor: string): Date | null {
  if (!valor) return null;
  const iso = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  }
  // El endpoint gviz de Google devuelve las fechas con el formato del
  // documento, que en este libro es el de EE.UU.: M/D/AAAA. Cuando el primer
  // número supera 12 no puede ser un mes, así que ahí se lee como D/M/AAAA.
  const barras = valor.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (barras) {
    const primero = +barras[1];
    const segundo = +barras[2];
    const [mes, dia] = primero > 12 ? [segundo, primero] : [primero, segundo];
    return new Date(Date.UTC(+barras[3], mes - 1, dia));
  }
  return null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Días que un caso lleva sin ningún cambio de estado.
 *
 * Vive acá y no en cada página porque la columna «sin moverse» de las tablas,
 * la clasificación de demora y el corte de la cola de escalamiento tienen que
 * dar lo mismo: si difirieran, una fila podría aparecer entre los demorados
 * mostrando dos días.
 */
export function diasSinMovimiento(
  pedido: Pick<Pedido, "ultimoMovimiento">,
  hoy = Date.now(),
): number | null {
  if (!pedido.ultimoMovimiento) return null;
  return Math.floor((hoy - pedido.ultimoMovimiento.getTime()) / DIA_MS);
}

/**
 * A partir de cuántos días sin moverse un caso se considera demorado. Es el
 * mismo umbral con el que la columna DEMORA del libro marcaba «URGENTE».
 */
export const DIAS_PARA_DEMORA = 2;

/**
 * Traduce los días parado a la etiqueta que usaba el libro. Mismos cortes que
 * la fórmula original: más de dos días URGENTE, más de uno RETRASADA.
 */
function clasificarDemora(ultimoMovimiento: Date | null, hoy = Date.now()): string {
  const dias = diasSinMovimiento({ ultimoMovimiento }, hoy);
  if (dias == null) return "";
  if (dias > DIAS_PARA_DEMORA) return "URGENTE";
  if (dias > 1) return "RETRASADA";
  return "A TIEMPO";
}

export function parsearPedido(fila: string[], mapa: MapaColumnas): Pedido | null {
  const id = Number(celda(fila, mapa.id));
  if (!Number.isFinite(id) || id <= 0) return null;

  const ultimoMovimiento = parsearFecha(celda(fila, mapa.ultimoMovimiento));
  if (!ultimoMovimiento) return null;

  const creacion = parsearFecha(celda(fila, mapa.creacion));
  const estado = celda(fila, mapa.estado);
  const normalizado = estado.toLowerCase();
  const visitasCrudo = celda(fila, mapa.visitas);
  const visitas = Number(visitasCrudo);

  return {
    id,
    creacion,
    ultimoMovimiento,
    estado,
    repartidor: celda(fila, mapa.repartidor),
    tienda: celda(fila, mapa.tienda),
    destino: celda(fila, mapa.destino),
    poligono: celda(fila, mapa.poligono),
    visitas: visitasCrudo !== "" && Number.isFinite(visitas) ? visitas : null,
    mes: mesDe(creacion ?? ultimoMovimiento),
    devuelto: ESTADOS_DEVOLUCION.has(normalizado),
    entregado: normalizado === "entregado",
    abierto: ESTADOS_ABIERTOS.has(normalizado),
    diasDeVida: creacion
      ? Math.round((ultimoMovimiento.getTime() - creacion.getTime()) / DIA_MS)
      : null,
    cerrado: cerradoDe(fila, mapa, normalizado),
    reclamoTienda: celda(fila, mapa.reclamo),
    ubicacion: celda(fila, mapa.ubicacion),
    telefono: celda(fila, mapa.telefono),
    tieneDatosTienda: celda(fila, mapa.ubicacion) !== "" || celda(fila, mapa.telefono) !== "",
    aviso: celda(fila, mapa.aviso).toUpperCase(),
    avisoPendiente: celda(fila, mapa.aviso).toLowerCase() === "no avisado",
    foto: celda(fila, mapa.foto),
    enlace: celda(fila, mapa.enlace),
    informacionEnviar: celda(fila, mapa.informacionEnviar),
    demora: clasificarDemora(ultimoMovimiento),
    ids: celda(fila, mapa.ids),
  };
}

/**
 * Usa la columna CASO cuando viene calculada y, si no está, aplica la misma
 * regla en código. Las vistas del día no traen esa columna.
 */
function cerradoDe(fila: string[], mapa: MapaColumnas, estadoNormalizado: string): boolean {
  const declarado = celda(fila, mapa.caso).toLowerCase();
  if (declarado === "cerrado") return true;
  if (declarado === "abierto") return false;
  return ESTADOS_CERRADOS.has(estadoNormalizado);
}

/**
 * Un pedido puede aparecer más de una vez. Nos quedamos con el registro de
 * movimiento más reciente, que es el que refleja en qué quedó el caso.
 */
export function consolidarPedidos(grupos: Pedido[][]): Pedido[] {
  const porId = new Map<number, Pedido>();

  for (const grupo of grupos) {
    for (const pedido of grupo) {
      const previo = porId.get(pedido.id);
      if (!previo || pedido.ultimoMovimiento! > previo.ultimoMovimiento!) {
        porId.set(pedido.id, pedido);
      }
    }
  }

  return [...porId.values()].sort(
    (a, b) => a.ultimoMovimiento!.getTime() - b.ultimoMovimiento!.getTime(),
  );
}
