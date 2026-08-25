import "server-only";
import { cache } from "react";
import { leerFilas } from "./csv";
import {
  TAB_MENSUAL,
  TAB_AYER,
  TAB_DEMORADOS,
  modoDatos,
} from "./config";
import {
  consolidarPedidos,
  parsearPedido,
  type Pedido,
} from "./normalizar";

export type EstadoFuente = {
  modo: "sheet" | "fixture";
  actualizado: string;
  pestanas: number;
};

/**
 * Carga los casos del mes en curso desde la pestaña viva del libro. Es la única
 * fuente de pedidos de la web; el historial se arma con lógica propia sobre
 * estos datos, no leyendo las pestañas de meses anteriores.
 */
export const cargarPedidos = cache(async (): Promise<Pedido[]> => {
  const filas = await leerFilas(TAB_MENSUAL);
  return consolidarPedidos([filas]);
});

/** Los casos que quedaron sin cerrar en la jornada anterior. */
export const cargarAyer = cache(async (): Promise<Pedido[]> => {
  const filas = await leerFilas(TAB_AYER);
  return filas.map(parsearPedido).filter((p): p is Pedido => p !== null);
});

/** Los casos que pasaron su fecha y siguen abiertos. */
export const cargarDemorados = cache(async (): Promise<Pedido[]> => {
  const filas = await leerFilas(TAB_DEMORADOS);
  return filas.map(parsearPedido).filter((p): p is Pedido => p !== null);
});

export function estadoFuente(pestanas: number): EstadoFuente {
  return {
    modo: modoDatos(),
    actualizado: new Date().toISOString(),
    pestanas,
  };
}
