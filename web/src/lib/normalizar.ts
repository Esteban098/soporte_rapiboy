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
  poligono: string;
  visitas: number | null;
  /** Mes del último movimiento, como `2026-08`. */
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
   * Lo que pasó la tienda para concretar la entrega: un link de mapa y un
   * teléfono o referencia del domicilio. Son datos del cliente, y se muestran
   * en el tablero porque el equipo los necesita para trabajar el caso; por eso
   * el acceso está restringido por login.
   */
  ubicacion: string;
  telefono: string;
  tieneUbicacion: boolean;
  tieneTelefono: boolean;
  /**
   * Valor crudo de la columna AVISO: "AVISADO", "NO AVISADO" o vacío. Hoy la
   * fórmula del libro solo produce "NO AVISADO", pero se guarda tal cual para
   * que la tabla distinga los dos casos en cuanto la columna sepa hacerlo.
   */
  aviso: string;
  avisoPendiente: boolean;
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
  ultimoMovimiento: 2,
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

function mesDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export function parsearPedido(fila: string[]): Pedido | null {
  const id = Number(celda(fila, COL.id));
  if (!Number.isFinite(id) || id <= 0) return null;

  const ultimoMovimiento = parsearFecha(celda(fila, COL.ultimoMovimiento));
  if (!ultimoMovimiento) return null;

  const creacion = parsearFecha(celda(fila, COL.creacion));
  const estado = celda(fila, COL.estado);
  const normalizado = estado.toLowerCase();
  const visitasCrudo = celda(fila, COL.visitas);
  const visitas = Number(visitasCrudo);

  return {
    id,
    creacion,
    ultimoMovimiento,
    estado,
    repartidor: celda(fila, COL.repartidor),
    tienda: celda(fila, COL.tienda),
    poligono: celda(fila, COL.poligono),
    visitas: visitasCrudo !== "" && Number.isFinite(visitas) ? visitas : null,
    mes: mesDe(ultimoMovimiento),
    devuelto: ESTADOS_DEVOLUCION.has(normalizado),
    entregado: normalizado === "entregado",
    abierto: ESTADOS_ABIERTOS.has(normalizado),
    diasDeVida: creacion
      ? Math.round((ultimoMovimiento.getTime() - creacion.getTime()) / DIA_MS)
      : null,
    cerrado: cerradoDe(fila, normalizado),
    reclamoTienda: celda(fila, COL.reclamo),
    ubicacion: celda(fila, COL.ubicacion),
    telefono: celda(fila, COL.telefono),
    tieneUbicacion: celda(fila, COL.ubicacion) !== "",
    tieneTelefono: celda(fila, COL.telefono) !== "",
    aviso: celda(fila, COL.aviso).toUpperCase(),
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
 * Un pedido puede aparecer en más de una pestaña. Nos quedamos con el registro
 * de movimiento más reciente, que es el que refleja en qué quedó el caso.
 */
export function consolidarPedidos(filas: string[][][]): Pedido[] {
  const porId = new Map<number, Pedido>();

  for (const tab of filas) {
    for (const fila of tab) {
      const pedido = parsearPedido(fila);
      if (!pedido || MESES_RESIDUALES.has(pedido.mes)) continue;

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

