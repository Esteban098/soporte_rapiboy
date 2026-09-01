import "server-only";
import { cache } from "react";
import { leerFilas, type Vista } from "./csv";
import { TABLA_SEGUIMIENTO, modoDatos, type ModoDatos } from "./config";
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
import { consultar, TablaFaltante } from "./supabase";
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

/** Lee una vista y devuelve sus casos junto con los campos que trae. */
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

export type EstadoFuente = {
  modo: ModoDatos;
  actualizado: string;
  pestanas: number;
};

/**
 * Carga los casos del mes en curso desde la pestaña viva del libro. Es la única
 * fuente de pedidos de la web; el historial se arma con lógica propia sobre
 * estos datos, no leyendo las pestañas de meses anteriores.
 */
export const cargarPedidos = cache(async (): Promise<Casos> => {
  const { pedidos, campos } = await leerCasos("mensual");
  return { pedidos: consolidarPedidos([pedidos]), campos };
});

/** Los casos que quedaron sin cerrar en la jornada anterior. */
export const cargarAyer = cache(() => leerCasos("ayer"));

/**
 * Los viajes cancelados el mismo día en que se colectaron.
 *
 * Tiene su propio lector porque no comparte esquema con los pedidos: no hay
 * estado que cerrar ni reclamo que trabajar, y sí dos identificadores y dos
 * estados que conviene mirar por separado.
 */
export const cargarCancelados = cache(async (): Promise<Cancelado[]> => {
  const [encabezado, ...filas] = await leerFilas("cancelados");
  const mapa = mapearColumnasCancelados(encabezado ?? []);
  return filas
    .map((fila) => parsearCancelado(fila, mapa))
    .filter((c): c is Cancelado => c !== null);
});

/**
 * Los reportes que cargó el equipo, del más nuevo al más viejo.
 *
 * Con tope: la pantalla es una cola de trabajo, no un archivo histórico, y
 * traer todo haría más lenta cada visita a medida que la tabla crece. Si algún
 * día hace falta mirar más atrás, eso pide una búsqueda por viaje o por fecha,
 * no una lista más larga.
 */
export type ColaSeguimiento = {
  reportes: Seguimiento[];
  /** La tabla todavía no está creada. La pantalla lo explica en vez de fallar. */
  sinTabla: boolean;
};

export const cargarSeguimientos = cache(async (): Promise<ColaSeguimiento> => {
  // Esta sección solo existe contra la base. Con el sheet o los fixtures no hay
  // dónde guardar un reporte, así que devuelve vacío en lugar de reventar por
  // credenciales que en ese modo no tienen por qué estar.
  if (modoDatos() !== "supabase") return { reportes: [], sinTabla: false };

  try {
    const filas = await consultar<FilaSeguimiento>(
      TABLA_SEGUIMIENTO,
      { order: "created_at.desc", limit: "500" },
      "seguimiento",
    );
    return { reportes: filas.map(parsearSeguimiento), sinTabla: false };
  } catch (error) {
    // Solo este caso se traga: cualquier otra falla de la base sigue siendo un
    // error, porque ahí sí hay algo roto que conviene ver.
    if (error instanceof TablaFaltante) return { reportes: [], sinTabla: true };
    throw error;
  }
});

export function estadoFuente(pestanas: number): EstadoFuente {
  return {
    modo: modoDatos(),
    actualizado: new Date().toISOString(),
    pestanas,
  };
}
