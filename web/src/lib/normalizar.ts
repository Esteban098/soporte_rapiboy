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
  /** Domicilio de entrega, tal como viene del sistema. */
  destino: string;
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
  /** Columnas auxiliares del libro, que el equipo usa para operar. */
  enlace: string;
  copiar: string;
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
 * Meses que aparecen como coletazo de otras pestañas (menos de 300 casos) y no
 * corresponden a un mes realmente cargado en el libro.
 */
const MESES_RESIDUALES = new Set(["2026-01", "2026-06"]);

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
  | "copiar"
  | "demora";

/**
 * Nombres con los que cada campo aparece en el libro.
 *
 * Se lee por nombre y no por posición porque las pestañas no comparten el mismo
 * orden: en `Ayer`, la columna 8 es `IDcoma`, mientras que en `Mensual` esa
 * posición es `Visitas`. Leer por posición metía una lista de IDs donde iban
 * las visitas.
 */
const ALIAS: Record<CampoPedido, string[]> = {
  id: ["id"],
  creacion: ["fechacreacion", "fecha creacion", "fecha creación"],
  ultimoMovimiento: ["fechaprogramado", "fecha programado", "fecha progra", "fecha programada"],
  estado: ["estado"],
  repartidor: ["repartidor", "driver"],
  tienda: ["tienda", "empresa", "seller"],
  destino: ["destino", "domicilio"],
  poligono: ["poligono", "polígono"],
  visitas: ["visitas"],
  enlace: ["enlace"],
  reclamo: ["reclamo tienda", "reclamotienda"],
  ubicacion: ["ubicacion", "ubicación"],
  telefono: ["telefono", "teléfono"],
  aviso: ["aviso"],
  caso: ["caso"],
  ids: ["ids", "idcoma", "ids sql"],
  copiar: ["copiar"],
  demora: ["demora"],
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

/** Qué campos trae realmente la pestaña, para armar sus columnas. */
export function camposPresentes(mapa: MapaColumnas): CampoPedido[] {
  return Object.keys(mapa) as CampoPedido[];
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

function mesDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DIA_MS = 24 * 60 * 60 * 1000;

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
    mes: mesDe(ultimoMovimiento),
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
    tieneUbicacion: celda(fila, mapa.ubicacion) !== "",
    tieneTelefono: celda(fila, mapa.telefono) !== "",
    aviso: celda(fila, mapa.aviso).toUpperCase(),
    avisoPendiente: celda(fila, mapa.aviso).toLowerCase() === "no avisado",
    enlace: celda(fila, mapa.enlace),
    copiar: celda(fila, mapa.copiar),
    demora: celda(fila, mapa.demora),
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
      if (MESES_RESIDUALES.has(pedido.mes)) continue;
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
