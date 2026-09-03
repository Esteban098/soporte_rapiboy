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
  type ModoDatos,
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

export type EstadoFuente = {
  modo: ModoDatos;
  actualizado: string;
  pestanas: number;
};

/** Carga los casos que todavía pertenecen a la ventana operativa. */
export const cargarPedidos = cache(async (): Promise<Casos> => {
  const { pedidos, campos } = await leerCasos("mensual");
  return { pedidos: consolidarPedidos([pedidos]), campos };
});

/**
 * Los períodos cerrados viven en una tabla física aparte.
 *
 * El fallback mantiene funcionando una publicación hecha antes de correr
 * `supabase/historico.sql`; una vez creada la tabla, Supabase toma siempre el
 * camino separado. Sheet y fixtures conservan el comportamiento anterior.
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

/**
 * Las colectas: quién tiene asignado cada seller y qué pasó cada día.
 *
 * Solo existen contra la base. Con el sheet o los fixtures devuelven vacío en
 * lugar de reventar por credenciales que en ese modo no tienen por qué estar,
 * igual que hace `cargarSeguimientos`.
 *
 * `sinTabla` distingue «todavía no corriste colectas.sql» de «la tabla existe y
 * está vacía». Son dos situaciones con arreglos distintos y la pantalla las
 * cuenta distinto.
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

// Se pagina por `id`, que es la clave: ordenar por `fecha` dejaría empates —hay
// decenas de colectas por día— y entre páginas se repetirían unas y se
// saltearían otras.
export const cargarColectas = cache(
  (): Promise<DatosColectas<Colecta>> => leerColectas(TABLA_COLECTAS, "id.asc", parsearColectas),
);
