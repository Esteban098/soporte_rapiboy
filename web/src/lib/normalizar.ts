/**
 * Normalización de las filas del libro.
 *
 * El esquema del sheet cambió varias veces: `Repartidor` pasó a `Driver`,
 * `Polígono` perdió el acento, los encabezados traen saltos de línea y las
 * fechas conviven en tres formatos. Todo eso se resuelve acá para que el resto
 * de la app trabaje con un solo tipo de dato.
 */

export type Pedido = {
  id: number;
  creacion: Date | null;
  programado: Date | null;
  estado: string;
  repartidor: string;
  tienda: string;
  poligono: string;
  visitas: number | null;
  /** Mes de la fecha programada, como `2026-08`. */
  mes: string;
  devuelto: boolean;
  entregado: boolean;
  abierto: boolean;
  /** Días entre la creación del pedido y su fecha programada. */
  leadTime: number | null;
  /**
   * Caso resuelto. Sale de la columna CASO del libro, que cierra con
   * Entregado, Devuelto o Siniestrado; `Devolucion` sigue abierto porque la
   * devolución está en curso.
   */
  cerrado: boolean;
  /** Tipificación que cargó soporte con lo que pasó la tienda. Vacío si no hay. */
  reclamoTienda: string;
  /**
   * Si la tienda pasó ubicación o teléfono. Se guarda solo el hecho de que
   * existan: el dato en sí es del cliente y no sale del servidor.
   */
  tieneUbicacion: boolean;
  tieneTelefono: boolean;
  /** La columna AVISO del libro quedó en "NO AVISADO". */
  avisoPendiente: boolean;
};

export type Cancelacion = {
  id: number;
  tienda: string;
  estadoRpb: string;
  colectado: Date | null;
  cancelado: Date | null;
  /** Minutos en ruta antes de que Mercado Libre cancelara. */
  minutos: number | null;
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
 * Meses que aparecen como coletazo de otras pestañas (menos de 300 casos) y no
 * corresponden a un mes realmente cargado en el libro.
 */
const MESES_RESIDUALES = new Set(["2026-01", "2026-06"]);

/**
 * Orden de las nueve primeras columnas en las pestañas de pedidos. Es estable
 * en todo el libro, incluso donde los encabezados cambiaron de nombre o
 * directamente no existen.
 */
const COL = {
  id: 0,
  creacion: 1,
  programado: 2,
  estado: 3,
  repartidor: 4,
  tienda: 5,
  destino: 6,
  poligono: 7,
  visitas: 8,
  reclamo: 10,
  ubicacion: 11,
  telefono: 12,
  aviso: 13,
  caso: 14,
} as const;

/** Estados que la columna CASO del libro considera resueltos. */
const ESTADOS_CERRADOS = new Set(["entregado", "devuelto", "siniestrado"]);

function celda(fila: string[], indice: number): string {
  const valor = fila[indice];
  if (valor == null) return "";
  const texto = String(valor).replace(/\s+/g, " ").trim();
  return texto.toLowerCase() === "nan" ? "" : texto;
}

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

function parsearFechaHora(valor: string): Date | null {
  if (!valor) return null;
  const m = valor.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0));
  }
  return parsearFecha(valor);
}

function mesDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export function parsearPedido(fila: string[]): Pedido | null {
  const id = Number(celda(fila, COL.id));
  if (!Number.isFinite(id) || id <= 0) return null;

  const programado = parsearFecha(celda(fila, COL.programado));
  if (!programado) return null;

  const creacion = parsearFecha(celda(fila, COL.creacion));
  const estado = celda(fila, COL.estado);
  const normalizado = estado.toLowerCase();
  const visitasCrudo = celda(fila, COL.visitas);
  const visitas = Number(visitasCrudo);

  return {
    id,
    creacion,
    programado,
    estado,
    repartidor: celda(fila, COL.repartidor),
    tienda: celda(fila, COL.tienda),
    poligono: celda(fila, COL.poligono),
    visitas: visitasCrudo !== "" && Number.isFinite(visitas) ? visitas : null,
    mes: mesDe(programado),
    devuelto: ESTADOS_DEVOLUCION.has(normalizado),
    entregado: normalizado === "entregado",
    abierto: ESTADOS_ABIERTOS.has(normalizado),
    leadTime: creacion ? Math.round((programado.getTime() - creacion.getTime()) / DIA_MS) : null,
    cerrado: cerradoDe(fila, normalizado),
    reclamoTienda: celda(fila, COL.reclamo),
    tieneUbicacion: celda(fila, COL.ubicacion) !== "",
    tieneTelefono: celda(fila, COL.telefono) !== "",
    avisoPendiente: celda(fila, COL.aviso).toLowerCase() === "no avisado",
  };
}

/**
 * Usa la columna CASO cuando viene calculada y, si no está, aplica la misma
 * regla en código. Las vistas del día no traen esa columna.
 */
function cerradoDe(fila: string[], estadoNormalizado: string): boolean {
  const declarado = celda(fila, COL.caso).toLowerCase();
  if (declarado === "cerrado") return true;
  if (declarado === "abierto") return false;
  return ESTADOS_CERRADOS.has(estadoNormalizado);
}

/**
 * Un pedido reprogramado a fin de mes queda cargado en dos pestañas. Nos
 * quedamos con la primera aparición y descartamos los meses residuales.
 */
export function consolidarPedidos(filas: string[][][]): Pedido[] {
  const porId = new Map<number, Pedido>();

  for (const tab of filas) {
    for (const fila of tab) {
      const pedido = parsearPedido(fila);
      if (!pedido || MESES_RESIDUALES.has(pedido.mes)) continue;

      const previo = porId.get(pedido.id);
      if (!previo || pedido.programado! < previo.programado!) {
        porId.set(pedido.id, pedido);
      }
    }
  }

  return [...porId.values()].sort((a, b) => a.programado!.getTime() - b.programado!.getTime());
}

const MINUTO_MS = 60 * 1000;

/** Columnas que se buscan por nombre en la pestaña de cancelaciones. */
export const COLUMNAS_CANCELADOS = [
  "Id",
  "Tienda",
  "Estado_RBP",
  "Fecha_ColectadoMEX",
  "Fecha_CanceladoMEX",
  "Minutos_Diferencia",
];

export function parsearCancelacion(fila: string[], indices: number[]): Cancelacion | null {
  const [iId, iTienda, iEstado, iColectado, iCancelado, iMinutos] = indices;

  const id = Number(celda(fila, iId));
  if (!Number.isFinite(id) || id <= 0) return null;

  const colectado = parsearFechaHora(celda(fila, iColectado));
  const cancelado = parsearFechaHora(celda(fila, iCancelado));

  // La hoja de 2026 dejó de calcular los minutos, así que los derivamos de las
  // dos fechas y solo usamos la columna cuando ya viene cargada.
  const declarados = Number(celda(fila, iMinutos));
  const calculados =
    colectado && cancelado ? Math.round((cancelado.getTime() - colectado.getTime()) / MINUTO_MS) : null;
  const minutos = Number.isFinite(declarados) && declarados > 0 ? declarados : calculados;

  return {
    id,
    tienda: celda(fila, iTienda),
    estadoRpb: celda(fila, iEstado),
    colectado,
    cancelado,
    minutos: minutos != null && minutos > 0 ? minutos : null,
  };
}
