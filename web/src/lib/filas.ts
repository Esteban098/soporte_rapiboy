import type { Pedido } from "./normalizar";
import type { Fila } from "@/components/Tabla";
import { fechaCorta } from "./formato";

const DIA_MS = 24 * 60 * 60 * 1000;

function diasQuieto(pedido: Pedido, hoy: number): number | null {
  if (!pedido.ultimoMovimiento) return null;
  return Math.floor((hoy - pedido.ultimoMovimiento.getTime()) / DIA_MS);
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
    estado: pedido.estado,
    caso: pedido.cerrado ? "Cerrado" : "Abierto",
    repartidor: pedido.repartidor,
    tienda: pedido.tienda,
    zona: pedido.poligono,
    visitas: pedido.visitas,
    quieto: diasQuieto(pedido, hoy),
    movimiento: fechaCorta(pedido.ultimoMovimiento),
  }));
}

/** Filas de los casos con datos aportados por la tienda. */
export function filasDeReclamos(pedidos: Pedido[], hoy = Date.now()): Fila[] {
  return pedidos.map((pedido) => ({
    id: pedido.id,
    aviso: pedido.aviso || "AVISADO",
    reclamo: pedido.reclamoTienda,
    ubicacion: pedido.ubicacion,
    telefono: pedido.telefono,
    estado: pedido.estado,
    caso: pedido.cerrado ? "Cerrado" : "Abierto",
    repartidor: pedido.repartidor,
    tienda: pedido.tienda,
    zona: pedido.poligono,
    visitas: pedido.visitas,
    quieto: diasQuieto(pedido, hoy),
  }));
}
