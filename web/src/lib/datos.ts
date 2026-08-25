import "server-only";
import { cache } from "react";
import { indicesPorNombre, leerFilas } from "./csv";
import {
  TAB_MENSUAL,
  TAB_AYER,
  TAB_CANCELADOS,
  TAB_DEMORADOS,
  TAB_DEMORADO_NO_ENTREGADO,
  modoDatos,
} from "./config";
import {
  COLUMNAS_CANCELADOS,
  consolidarPedidos,
  parsearCancelacion,
  parsearPedido,
  type Cancelacion,
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

export type VistasDelDia = {
  ayer: Pedido[];
  demorados: Pedido[];
  demoradosNoEntregados: Pedido[];
};

/** Las tres pestañas que el equipo vuelve a pegar cada mañana. */
export const cargarVistasDelDia = cache(async (): Promise<VistasDelDia> => {
  const [ayer, demorados, noEntregados] = await Promise.all([
    leerFilas(TAB_AYER),
    leerFilas(TAB_DEMORADOS),
    leerFilas(TAB_DEMORADO_NO_ENTREGADO),
  ]);

  const parsear = (filas: string[][]) =>
    filas.map(parsearPedido).filter((p): p is Pedido => p !== null);

  return {
    ayer: parsear(ayer),
    demorados: parsear(demorados),
    demoradosNoEntregados: parsear(noEntregados),
  };
});

export const cargarCancelaciones = cache(async (): Promise<Cancelacion[]> => {
  const [encabezado, ...filas] = await leerFilas(TAB_CANCELADOS);
  const indices = indicesPorNombre(encabezado ?? [], COLUMNAS_CANCELADOS);

  return filas
    .map((fila) => parsearCancelacion(fila, indices))
    .filter((c): c is Cancelacion => c !== null)
    .sort((a, b) => (b.colectado?.getTime() ?? 0) - (a.colectado?.getTime() ?? 0));
});

export function estadoFuente(pestanas: number): EstadoFuente {
  return {
    modo: modoDatos(),
    actualizado: new Date().toISOString(),
    pestanas,
  };
}
