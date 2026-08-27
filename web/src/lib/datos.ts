import "server-only";
import { cache } from "react";
import { leerFilas } from "./csv";
import {
  TAB_MENSUAL,
  TAB_AYER,
  TAB_DEMORADOS,
  TAB_DEMORADO_NO_ENTREGADO,
  modoDatos,
} from "./config";
import {
  camposPresentes,
  consolidarPedidos,
  mapearColumnas,
  parsearPedido,
  type CampoPedido,
  type Pedido,
} from "./normalizar";

/**
 * Los casos de una pestaña junto con los campos que esa pestaña trae.
 *
 * Las pestañas no comparten esquema: `Ayer` no tiene visitas y solo `Mensual`
 * trae reclamo, aviso y caso. Cada tabla arma sus columnas con lo que su hoja
 * realmente tiene, en vez de mostrar columnas vacías.
 */
export type Casos = {
  pedidos: Pedido[];
  campos: CampoPedido[];
};

/** Lee una pestaña y devuelve sus casos junto con los campos que trae. */
async function leerCasos(tab: string): Promise<Casos> {
  const [encabezado, ...filas] = await leerFilas(tab);
  const mapa = mapearColumnas(encabezado ?? []);

  return {
    pedidos: filas
      .map((fila) => parsearPedido(fila, mapa))
      .filter((p): p is Pedido => p !== null),
    campos: camposPresentes(mapa),
  };
}

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
export const cargarPedidos = cache(async (): Promise<Casos> => {
  const { pedidos, campos } = await leerCasos(TAB_MENSUAL);
  return { pedidos: consolidarPedidos([pedidos]), campos };
});

/** Los casos que quedaron sin cerrar en la jornada anterior. */
export const cargarAyer = cache(() => leerCasos(TAB_AYER));

/** Los casos que pasaron su fecha y siguen abiertos. */
export const cargarDemorados = cache(() => leerCasos(TAB_DEMORADOS));

/** Los demorados que además siguen sin entregarse. */
export const cargarDemoradosNoEntregados = cache(() => leerCasos(TAB_DEMORADO_NO_ENTREGADO));

export function estadoFuente(pestanas: number): EstadoFuente {
  return {
    modo: modoDatos(),
    actualizado: new Date().toISOString(),
    pestanas,
  };
}
