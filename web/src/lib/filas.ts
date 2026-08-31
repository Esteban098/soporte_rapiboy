import type { Pedido } from "./normalizar";
import type { CampoPedido } from "./normalizar";
import type { Columna, Fila, Filtro } from "@/components/Tabla";
import { enlaceFotoEntrega } from "./enlaces";
import { fechaCorta } from "./formato";
import { diasSinMovimiento } from "./metricas";

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
 * Filtros de un listado de casos. Están acá y no dentro de la tabla porque el
 * gráfico que la acompaña tiene que recibir exactamente los mismos: comparten
 * el estado de filtrado, y una diferencia entre ambos los desincronizaría.
 */
export const FILTROS_PEDIDO: Filtro[] = [
  { clave: "estado", etiqueta: "Estado" },
  { clave: "caso", etiqueta: "Caso", opciones: ["Abierto", "Cerrado"] },
];

/**
 * Convierte pedidos en filas planas para la tabla.
 *
 * La tabla es un componente de cliente, así que solo puede recibir valores
 * serializables: acá se resuelve todo lo que dependa de fechas o de funciones.
 *
 * `foto` no es una columna: viaja con la fila para que el estado pueda abrir la
 * foto de la entrega. Queda en `null` mientras el libro no traiga esa URL, y
 * entonces el estado se muestra como texto.
 */
export function filasDePedidos(pedidos: Pedido[], hoy = Date.now()): Fila[] {
  return pedidos.map((pedido) => ({
    id: pedido.id,
    quieto: diasSinMovimiento(pedido, hoy),
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
    foto: enlaceFotoEntrega(pedido.foto),
  }));
}
