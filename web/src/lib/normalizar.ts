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

const ALIAS: Record<string, string[]> = {
  id: ["id"],
  creacion: ["fechacreacion", "fecha creacion", "fecha creación"],
  programado: ["fechaprogramado", "fecha programado", "fecha progra", "fecha programada"],
  estado: ["estado"],
  repartidor: ["repartidor", "driver"],
  tienda: ["tienda", "empresa", "seller"],
  poligono: ["poligono", "polígono"],
  visitas: ["visitas"],
  idMeli: ["idmeli", "id meli", "id_meli"],
  estadoRpb: ["estadorpb", "estado rpb", "estado_rbp", "estado_rpb"],
  colectado: ["fechacolectado", "fecha colectado", "fecha_colectadomex", "fecha colectado arg"],
  cancelado: ["fechacancelado", "fecha cancelado", "fecha_canceladomex", "fecha cancelado arg"],
  minutos: ["minutos", "minutos_diferencia"],
};

function clave(encabezado: string): string {
  return encabezado.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Busca el valor de un campo probando todos los nombres que tuvo en el libro. */
function campo(fila: Record<string, string>, nombre: keyof typeof ALIAS): string {
  const nombres = ALIAS[nombre];
  for (const [encabezado, valor] of Object.entries(fila)) {
    if (nombres.includes(clave(encabezado)) && valor != null && valor !== "") {
      return String(valor).trim();
    }
  }
  return "";
}

export function parsearFecha(valor: string): Date | null {
  if (!valor) return null;
  const iso = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  }
  const local = valor.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (local) {
    return new Date(Date.UTC(+local[3], +local[2] - 1, +local[1]));
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

export function parsearPedido(fila: Record<string, string>): Pedido | null {
  const id = Number(campo(fila, "id"));
  if (!Number.isFinite(id) || id <= 0) return null;

  const programado = parsearFecha(campo(fila, "programado"));
  if (!programado) return null;

  const creacion = parsearFecha(campo(fila, "creacion"));
  const estado = campo(fila, "estado");
  const normalizado = estado.toLowerCase();
  const visitasCrudo = Number(campo(fila, "visitas"));

  return {
    id,
    creacion,
    programado,
    estado,
    repartidor: campo(fila, "repartidor"),
    tienda: campo(fila, "tienda"),
    poligono: campo(fila, "poligono"),
    visitas: Number.isFinite(visitasCrudo) && campo(fila, "visitas") !== "" ? visitasCrudo : null,
    mes: mesDe(programado),
    devuelto: ESTADOS_DEVOLUCION.has(normalizado),
    entregado: normalizado === "entregado",
    abierto: ESTADOS_ABIERTOS.has(normalizado),
    leadTime: creacion ? Math.round((programado.getTime() - creacion.getTime()) / DIA_MS) : null,
  };
}

/**
 * Un pedido reprogramado a fin de mes queda cargado en dos pestañas. Nos
 * quedamos con la primera aparición y descartamos los meses residuales.
 */
export function consolidarPedidos(filas: Record<string, string>[][]): Pedido[] {
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

export function parsearCancelacion(fila: Record<string, string>): Cancelacion | null {
  const id = Number(campo(fila, "id"));
  if (!Number.isFinite(id) || id <= 0) return null;

  const colectado = parsearFechaHora(campo(fila, "colectado"));
  const cancelado = parsearFechaHora(campo(fila, "cancelado"));

  // La hoja de 2026 dejó de calcular los minutos, así que los derivamos de las
  // dos fechas y solo usamos la columna si ya viene cargada.
  const declarados = Number(campo(fila, "minutos"));
  const calculados =
    colectado && cancelado ? Math.round((cancelado.getTime() - colectado.getTime()) / MINUTO_MS) : null;
  const minutos = Number.isFinite(declarados) && declarados > 0 ? declarados : calculados;

  return {
    id,
    tienda: campo(fila, "tienda"),
    estadoRpb: campo(fila, "estadoRpb"),
    colectado,
    cancelado,
    minutos: minutos != null && minutos > 0 ? minutos : null,
  };
}
