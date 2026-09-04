import type { Pedido } from "./normalizar";
import type { CampoPedido } from "./normalizar";
import type { Columna, Fila, Filtro } from "@/components/Tabla";
import { enlaceFotoEntrega } from "./enlaces";
import { fechaCorta } from "./formato";
import { diasSinMovimiento, DIAS_SEMANA } from "./metricas";

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
  { clave: "informacionEnviar", titulo: "Información a enviar", tipo: "texto" , campo: "informacionEnviar" },
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
 *
 * `resultado`, `diaSemana`, `mesClave` y `datosTienda` tampoco son columnas:
 * son los recortes que hacen los gráficos —entregado contra devuelto, el día en
 * que volvió el paquete, el mes, si la tienda aportó algo— resueltos acá una
 * vez. Sin ellos, cada gráfico tendría que reconstruir del lado del cliente lo
 * que la métrica ya calculó, y al primer desajuste el detalle mostraría un
 * recorte que no es el de la barra que se tocó.
 *
 * `demora` viaja igual, aunque ya no tenga columna propia en ninguna tabla:
 * clasifica URGENTE / RETRASADA / A TIEMPO y queda disponible para quien lo
 * necesite sin obligar a que el equipo la vea como una columna más.
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
    informacionEnviar: pedido.informacionEnviar,
    foto: enlaceFotoEntrega(pedido.foto),
    resultado: pedido.entregado ? "Entregado" : pedido.devuelto ? "Devuelto" : "",
    diaSemana: pedido.ultimoMovimiento
      ? DIAS_SEMANA[pedido.ultimoMovimiento.getUTCDay()]
      : "",
    mesClave: pedido.mes,
    datosTienda: pedido.tieneDatosTienda ? "Con datos" : "Sin datos",
  }));
}
