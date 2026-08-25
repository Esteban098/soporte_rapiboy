import "server-only";
import { cache } from "react";
import { leerTab } from "./csv";
import {
  TABS_PEDIDOS,
  TAB_AYER,
  TAB_CANCELADOS,
  TAB_DEMORADOS,
  TAB_DEMORADO_NO_ENTREGADO,
  modoDatos,
} from "./config";
import {
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
 * Carga el histórico completo de pedidos. `cache` de React evita releer las
 * pestañas cuando varias partes de la misma página piden los datos; el caché
 * entre visitas lo maneja `fetch` con su revalidación.
 */
export const cargarPedidos = cache(async (): Promise<Pedido[]> => {
  const tabs = await Promise.all(TABS_PEDIDOS.map((tab) => leerTab(tab)));
  return consolidarPedidos(tabs);
});

/** Pedidos del mes vivo, que es lo que mira la operación día a día. */
export const cargarMesActual = cache(async (): Promise<Pedido[]> => {
  const filas = await leerTab(TABS_PEDIDOS[0]);
  return filas
    .map(parsearPedido)
    .filter((p): p is Pedido => p !== null)
    .sort((a, b) => b.programado!.getTime() - a.programado!.getTime());
});

export type VistasDelDia = {
  ayer: Pedido[];
  demorados: Pedido[];
  demoradosNoEntregados: Pedido[];
};

/** Las tres pestañas que el equipo vuelve a pegar cada mañana. */
export const cargarVistasDelDia = cache(async (): Promise<VistasDelDia> => {
  const [ayer, demorados, noEntregados] = await Promise.all([
    leerTab(TAB_AYER),
    leerTab(TAB_DEMORADOS),
    leerTab(TAB_DEMORADO_NO_ENTREGADO),
  ]);

  const parsear = (filas: Record<string, string>[]) =>
    filas.map(parsearPedido).filter((p): p is Pedido => p !== null);

  return {
    ayer: parsear(ayer),
    demorados: parsear(demorados),
    demoradosNoEntregados: parsear(noEntregados),
  };
});

export const cargarCancelaciones = cache(async (): Promise<Cancelacion[]> => {
  const filas = await leerTab(TAB_CANCELADOS);
  return filas
    .map(parsearCancelacion)
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
