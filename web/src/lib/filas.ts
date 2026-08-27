import type { Pedido } from "./normalizar";
import type { CampoPedido } from "./normalizar";
import type { Columna, Fila } from "@/components/Tabla";
import { fechaCorta } from "./formato";

const DIA_MS = 24 * 60 * 60 * 1000;

function diasQuieto(pedido: Pedido, hoy: number): number | null {
  if (!pedido.ultimoMovimiento) return null;
  return Math.floor((hoy - pedido.ultimoMovimiento.getTime()) / DIA_MS);
}

/**
 * Todas las columnas que trae el libro, en el mismo orden.
 *
 * Están todas disponibles a propósito: el equipo oculta desde el menú de la
 * tabla las que no le interesan en cada momento, en lugar de que el tablero
 * decida por él cuáles se pueden ver.
 */
type ColumnaPedido = Columna & {
  /** Campo del libro que la alimenta. Sin campo, es un derivado siempre disponible. */
  campo?: CampoPedido;
};

const TODAS: ColumnaPedido[] = [
  { clave: "id", titulo: "Viaje", tipo: "viaje" , campo: "id" },
  { clave: "quieto", titulo: "Sin moverse", tipo: "dias" },
  { clave: "estado", titulo: "Estado", tipo: "estado" , campo: "estado" },
  { clave: "caso", titulo: "Caso", tipo: "caso" },
  { clave: "demora", titulo: "Demora", tipo: "texto" , campo: "demora" },
  { clave: "creacion", titulo: "Creación", tipo: "texto" , campo: "creacion" },
  { clave: "movimiento", titulo: "Último mov.", tipo: "texto" },
  { clave: "repartidor", titulo: "Repartidor", tipo: "texto" , campo: "repartidor" },
  { clave: "tienda", titulo: "Tienda", tipo: "texto" , campo: "tienda" },
  { clave: "destino", titulo: "Domicilio", tipo: "texto" , campo: "destino" },
  { clave: "zona", titulo: "Zona", tipo: "texto" , campo: "poligono" },
  { clave: "visitas", titulo: "Visitas", tipo: "numero" , campo: "visitas" },
  { clave: "reclamo", titulo: "Reclamo tienda", tipo: "texto" , campo: "reclamo" },
  { clave: "ubicacion", titulo: "Ubicación", tipo: "texto" , campo: "ubicacion" },
  { clave: "telefono", titulo: "Teléfono", tipo: "texto" , campo: "telefono" },
  { clave: "aviso", titulo: "Aviso", tipo: "aviso" , campo: "aviso" },
  { clave: "enlace", titulo: "Enlace", tipo: "texto" , campo: "enlace" },
  { clave: "copiar", titulo: "Mensaje", tipo: "texto" , campo: "copiar" },
  { clave: "ids", titulo: "IDs", tipo: "texto" , campo: "ids" },
];

/**
 * Las columnas que corresponden a una pestaña: solo las que esa hoja trae, más
 * los derivados que se calculan siempre.
 */
export function columnasPara(campos: CampoPedido[]): Columna[] {
  const disponibles = new Set(campos);
  return TODAS.filter((columna) => !columna.campo || disponibles.has(columna.campo)).map(
    (columna) => ({ clave: columna.clave, titulo: columna.titulo, tipo: columna.tipo }),
  );
}

/**
 * Convierte pedidos en filas planas para la tabla.
 *
 * La tabla es un componente de cliente, así que solo puede recibir valores
 * serializables: acá se resuelve todo lo que dependa de fechas o de funciones.
 */
export function filasDePedidos(pedidos: Pedido[], hoy = Date.now()): Fila[] {
  return pedidos.map((pedido) => ({
    id: pedido.id,
    quieto: diasQuieto(pedido, hoy),
    estado: pedido.estado,
    caso: pedido.cerrado ? "Cerrado" : "Abierto",
    demora: pedido.demora,
    creacion: fechaCorta(pedido.creacion),
    movimiento: fechaCorta(pedido.ultimoMovimiento),
    repartidor: pedido.repartidor,
    tienda: pedido.tienda,
    destino: pedido.destino,
    zona: pedido.poligono,
    visitas: pedido.visitas,
    reclamo: pedido.reclamoTienda,
    ubicacion: pedido.ubicacion,
    telefono: pedido.telefono,
    aviso: pedido.aviso,
    enlace: pedido.enlace,
    copiar: pedido.copiar,
    ids: pedido.ids,
  }));
}
