import "server-only";
import { cache } from "react";
import { leerFilas, type Vista } from "./csv";
import {
  TABLA_CANCELADOS_HISTORICO,
  TABLA_COLECTAS,
  TABLA_COLECTAS_ASIGNACION,
  TABLA_MENSUAL_HISTORICO,
  TABLA_SEGUIMIENTO,
  modoDatos,
} from "./config";
import {
  mapearColumnasCancelados,
  parsearCancelado,
  type Cancelado,
} from "./cancelados";
import {
  parsearSeguimiento,
  type FilaSeguimiento,
  type Seguimiento,
} from "./seguimiento";
import { consultar, leerTabla, TablaFaltante } from "./supabase";
import {
  parsearAsignaciones,
  parsearColectas,
  type Asignacion,
  type Colecta,
} from "./colectas";
import {
  camposPresentes,
  consolidarPedidos,
  mapearColumnas,
  parsearPedido,
  type CampoPedido,
  type Pedido,
} from "./normalizar";

/** Los campos disponibles determinan qué columnas muestra cada vista. */
export type Casos = {
  pedidos: Pedido[];
  campos: CampoPedido[];
};

async function leerCasos(vista: Vista): Promise<Casos> {
  const [encabezado, ...filas] = await leerFilas(vista);
  const mapa = mapearColumnas(encabezado ?? []);

  return {
    pedidos: filas
      .map((fila) => parsearPedido(fila, mapa))
      .filter((p): p is Pedido => p !== null),
    campos: camposPresentes(mapa),
  };
}

/** Lee pedidos directamente de una tabla con el esquema de `mensual`. */
async function leerCasosDeTabla(tabla: string): Promise<Casos> {
  const [encabezado, ...filas] = await leerTabla(tabla);
  const mapa = mapearColumnas(encabezado ?? []);

  return {
    pedidos: consolidarPedidos([
      filas
        .map((fila) => parsearPedido(fila, mapa))
        .filter((p): p is Pedido => p !== null),
    ]),
    campos: camposPresentes(mapa),
  };
}

/** Carga los casos que todavía pertenecen a la ventana operativa. */
export const cargarPedidos = cache(async (): Promise<Casos> => {
  const { pedidos, campos } = await leerCasos("mensual");
  return { pedidos: consolidarPedidos([pedidos]), campos };
});

/**
 * Lee el histórico físico; usa Mensual como fallback si falta la migración
 * `supabase/historico.sql` o la fuente es Sheet/fixtures.
 */
export const cargarPedidosHistoricos = cache(async (): Promise<Casos> => {
  if (modoDatos() !== "supabase") return cargarPedidos();

  try {
    return await leerCasosDeTabla(TABLA_MENSUAL_HISTORICO);
  } catch (error) {
    if (error instanceof TablaFaltante) return cargarPedidos();
    throw error;
  }
});

/** Casos nuevos de la jornada, según el filtro de la ingesta. */
export const cargarAyer = cache(() => leerCasos("ayer"));

/** Viajes cancelados el mismo día de la colecta; tienen un esquema propio. */
export const cargarCancelados = cache(async (): Promise<Cancelado[]> => {
  const [encabezado, ...filas] = await leerFilas("cancelados");
  const mapa = mapearColumnasCancelados(encabezado ?? []);
  return filas
    .map((fila) => parsearCancelado(fila, mapa))
    .filter((c): c is Cancelado => c !== null);
});

/** Cancelaciones de períodos cerrados, separadas de la tabla operativa. */
export const cargarCanceladosHistoricos = cache(async (): Promise<Cancelado[]> => {
  if (modoDatos() !== "supabase") return cargarCancelados();

  try {
    const [encabezado, ...filas] = await leerTabla(TABLA_CANCELADOS_HISTORICO);
    const mapa = mapearColumnasCancelados(encabezado ?? []);
    return filas
      .map((fila) => parsearCancelado(fila, mapa))
      .filter((c): c is Cancelado => c !== null);
  } catch (error) {
    if (error instanceof TablaFaltante) return cargarCancelados();
    throw error;
  }
});

/** Cola limitada a los 500 reportes más recientes. */
export type ColaSeguimiento = {
  reportes: Seguimiento[];
  /** La tabla todavía no está creada. La pantalla lo explica en vez de fallar. */
  sinTabla: boolean;
};

export const cargarSeguimientos = cache(async (): Promise<ColaSeguimiento> => {
  // Los reportes solo están disponibles en Supabase.
  if (modoDatos() !== "supabase") return { reportes: [], sinTabla: false };

  try {
    const filas = await consultar<FilaSeguimiento>(
      TABLA_SEGUIMIENTO,
      { order: "created_at.desc", limit: "500" },
      "seguimiento",
    );
    return { reportes: filas.map(parsearSeguimiento), sinTabla: false };
  } catch (error) {
    if (error instanceof TablaFaltante) return { reportes: [], sinTabla: true };
    throw error;
  }
});

/**
 * Colectas y asignaciones, disponibles solo en Supabase.
 * `sinTabla` distingue una migración pendiente de una tabla vacía.
 */
export type DatosColectas<T> = { filas: T[]; sinTabla: boolean };

async function leerColectas<T>(
  tabla: string,
  orden: string,
  parsear: (filas: string[][]) => T[],
): Promise<DatosColectas<T>> {
  if (modoDatos() !== "supabase") return { filas: [], sinTabla: false };

  try {
    return { filas: parsear(await leerTabla(tabla, orden)), sinTabla: false };
  } catch (error) {
    if (error instanceof TablaFaltante) return { filas: [], sinTabla: true };
    throw error;
  }
}

export const cargarAsignaciones = cache(
  (): Promise<DatosColectas<Asignacion>> =>
    leerColectas(TABLA_COLECTAS_ASIGNACION, "id_usuario.asc", parsearAsignaciones),
);

// Orden único para evitar duplicados u omisiones entre páginas.
export const cargarColectas = cache(
  (): Promise<DatosColectas<Colecta>> => leerColectas(TABLA_COLECTAS, "id.asc", parsearColectas),
);
