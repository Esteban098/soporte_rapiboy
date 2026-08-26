import type { Pedido } from "./normalizar";

export type Resumen = {
  casos: number;
  devoluciones: number;
  entregados: number;
  abiertos: number;
  tasaDevolucion: number;
  visitasPromedio: number;
  desde: string;
  hasta: string;
};

/** Cuántos casos quedaron resueltos y cuántos siguen en la cola. */
export type Cierre = {
  total: number;
  cerrados: number;
  abiertos: number;
  tasaCierre: number;
  tasaApertura: number;
};

export type FilaEstado = {
  estado: string;
  casos: number;
  porcentaje: number;
  cerrado: boolean;
};

/** Un tipo de reclamo de tienda y en qué terminaron esos casos. */
export type FilaReclamo = {
  tipo: string;
  casos: number;
  entregados: number;
  tasaEntrega: number;
  abiertos: number;
};

export type Reclamos = {
  /** Casos donde la tienda pasó datos para concretar la entrega. */
  conReclamo: number;
  sinReclamo: number;
  porcentaje: number;
  /** De los que tienen reclamo, cuántos terminaron entregados. */
  entregadosConReclamo: number;
  tasaEntregaConReclamo: number;
  /** Y cuántos entre los que no tuvieron reclamo, para comparar. */
  tasaEntregaSinReclamo: number;
  avisoPendiente: number;
  avisados: number;
  conUbicacion: number;
  conTelefono: number;
  porTipo: FilaReclamo[];
  porEstado: FilaEstado[];
};

const pct = (parte: number, total: number) => (total === 0 ? 0 : (parte / total) * 100);

function promedio(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export function resumen(pedidos: Pedido[]): Resumen {
  const meses = pedidos.map((p) => p.mes);
  const visitas = pedidos.filter((p) => p.visitas != null).map((p) => p.visitas!);

  return {
    casos: pedidos.length,
    devoluciones: pedidos.filter((p) => p.devuelto).length,
    entregados: pedidos.filter((p) => p.entregado).length,
    abiertos: pedidos.filter((p) => p.abierto).length,
    tasaDevolucion: pct(pedidos.filter((p) => p.devuelto).length, pedidos.length),
    visitasPromedio: promedio(visitas),
    desde: meses.length ? meses.reduce((a, b) => (a < b ? a : b)) : "",
    hasta: meses.length ? meses.reduce((a, b) => (a > b ? a : b)) : "",
  };
}

/** La métrica principal de la operación: resueltos contra pendientes. */
export function cierre(pedidos: Pedido[]): Cierre {
  const cerrados = pedidos.filter((p) => p.cerrado).length;
  const abiertos = pedidos.length - cerrados;
  return {
    total: pedidos.length,
    cerrados,
    abiertos,
    tasaCierre: pct(cerrados, pedidos.length),
    tasaApertura: pct(abiertos, pedidos.length),
  };
}

/** Todos los estados con su volumen, no solo entregado y devuelto. */
export function porEstado(pedidos: Pedido[]): FilaEstado[] {
  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const estado = pedido.estado || "Sin estado";
    const lista = grupos.get(estado);
    if (lista) lista.push(pedido);
    else grupos.set(estado, [pedido]);
  }

  return [...grupos.entries()]
    .map(([estado, lista]) => ({
      estado,
      casos: lista.length,
      porcentaje: pct(lista.length, pedidos.length),
      cerrado: lista[0].cerrado,
    }))
    .sort((a, b) => b.casos - a.casos);
}

/**
 * Casos donde la tienda compartió datos para concretar la entrega. Interesa
 * sobre todo si esa información sirvió: comparamos la tasa de entrega de los
 * casos con reclamo contra la de los que no tuvieron ninguno.
 */
export function reclamos(pedidos: Pedido[]): Reclamos {
  const con = pedidos.filter((p) => p.reclamoTienda !== "");
  const sin = pedidos.filter((p) => p.reclamoTienda === "");
  const entregadosCon = con.filter((p) => p.entregado).length;

  const grupos = new Map<string, Pedido[]>();
  for (const pedido of con) {
    const tipo = pedido.reclamoTienda.toUpperCase();
    const lista = grupos.get(tipo);
    if (lista) lista.push(pedido);
    else grupos.set(tipo, [pedido]);
  }

  const porTipo = [...grupos.entries()]
    .map(([tipo, lista]) => {
      const entregados = lista.filter((p) => p.entregado).length;
      return {
        tipo,
        casos: lista.length,
        entregados,
        tasaEntrega: pct(entregados, lista.length),
        abiertos: lista.filter((p) => !p.cerrado).length,
      };
    })
    .sort((a, b) => b.casos - a.casos);

  return {
    conReclamo: con.length,
    sinReclamo: sin.length,
    porcentaje: pct(con.length, pedidos.length),
    entregadosConReclamo: entregadosCon,
    tasaEntregaConReclamo: pct(entregadosCon, con.length),
    tasaEntregaSinReclamo: pct(sin.filter((p) => p.entregado).length, sin.length),
    avisoPendiente: con.filter((p) => p.avisoPendiente).length,
    avisados: con.filter((p) => p.aviso === "AVISADO").length,
    conUbicacion: con.filter((p) => p.tieneUbicacion).length,
    conTelefono: con.filter((p) => p.tieneTelefono).length,
    porTipo,
    porEstado: porEstado(con),
  };
}

/**
 * Volumen mínimo para entrar en un ranking.
 *
 * Está calibrado para un mes de datos: el comercio con más casos ronda los 150,
 * así que un piso alto vaciaría todas las tablas. Con 30 casos una tasa de
 * devolución todavía arrastra unos 6 puntos de ruido, que es tolerable para
 * ordenar pero no para sacar conclusiones de diferencias chicas.
 */
export const MINIMO_CASOS = 30;

export type FilaRanking = {
  nombre: string;
  casos: number;
  devoluciones: number;
  tasaDevolucion: number;
  visitasPromedio: number;
};

export function ranking(
  pedidos: Pedido[],
  dimension: "repartidor" | "tienda" | "poligono",
  opciones: { minimoCasos?: number; limite?: number; orden?: "peores" | "mejores" | "volumen" } = {},
): FilaRanking[] {
  const { minimoCasos = MINIMO_CASOS, limite = 10, orden = "peores" } = opciones;

  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const nombre = pedido[dimension];
    if (!nombre) continue;
    const lista = grupos.get(nombre);
    if (lista) lista.push(pedido);
    else grupos.set(nombre, [pedido]);
  }

  const filas: FilaRanking[] = [];
  for (const [nombre, lista] of grupos) {
    if (lista.length < minimoCasos) continue;
    const devoluciones = lista.filter((p) => p.devuelto).length;
    const visitas = lista.filter((p) => p.visitas != null).map((p) => p.visitas!);
    filas.push({
      nombre,
      casos: lista.length,
      devoluciones,
      tasaDevolucion: pct(devoluciones, lista.length),
      visitasPromedio: promedio(visitas),
    });
  }

  const comparar =
    orden === "volumen"
      ? (a: FilaRanking, b: FilaRanking) => b.casos - a.casos
      : orden === "mejores"
        ? (a: FilaRanking, b: FilaRanking) => a.tasaDevolucion - b.tasaDevolucion
        : (a: FilaRanking, b: FilaRanking) => b.tasaDevolucion - a.tasaDevolucion;

  return filas.sort(comparar).slice(0, limite);
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export type FilaDiaSemana = { dia: string; devueltos: number };

/**
 * Cuántos paquetes se devolvieron cada día de la semana.
 *
 * Se apoya en la fecha del último movimiento, que para un caso devuelto es
 * justamente el día en que volvió al vendedor. Sirve para ver si las
 * devoluciones se concentran en algún día.
 */
export function devueltosPorDiaSemana(pedidos: Pedido[]): FilaDiaSemana[] {
  const conteo = new Map<number, number>();
  for (const pedido of pedidos) {
    if (!pedido.devuelto || !pedido.ultimoMovimiento) continue;
    const dia = pedido.ultimoMovimiento.getUTCDay();
    conteo.set(dia, (conteo.get(dia) ?? 0) + 1);
  }

  // La semana arranca en lunes, que es como la mira la operación.
  return [1, 2, 3, 4, 5, 6, 0].map((dia) => ({
    dia: DIAS_SEMANA[dia],
    devueltos: conteo.get(dia) ?? 0,
  }));
}

export type FilaVisitas = {
  visitas: string;
  entregados: number;
  devueltos: number;
};

/**
 * Cuántas visitas al domicilio hubo antes de que el caso terminara entregado, y
 * cuántas antes de que terminara devuelto. Son dos distribuciones distintas y
 * conviene leerlas separadas.
 */
export function visitasPorResultado(pedidos: Pedido[]): FilaVisitas[] {
  const conteo = new Map<number, { entregados: number; devueltos: number }>();

  for (const pedido of pedidos) {
    if (pedido.visitas == null) continue;
    if (!pedido.entregado && !pedido.devuelto) continue;
    const tramo = Math.min(pedido.visitas, 5);
    const actual = conteo.get(tramo) ?? { entregados: 0, devueltos: 0 };
    if (pedido.entregado) actual.entregados += 1;
    else actual.devueltos += 1;
    conteo.set(tramo, actual);
  }

  return [...conteo.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tramo, v]) => ({
      visitas: tramo === 5 ? "5 o más" : String(tramo),
      entregados: v.entregados,
      devueltos: v.devueltos,
    }));
}

const TRAMOS_ANTIGUEDAD: { tramo: string; hasta: number }[] = [
  { tramo: "Hoy", hasta: 0 },
  { tramo: "1 día", hasta: 1 },
  { tramo: "2–3 días", hasta: 3 },
  { tramo: "4–7 días", hasta: 7 },
  { tramo: "Más de 7", hasta: Infinity },
];

export type FilaAntiguedad = { tramo: string; casos: number; porcentaje: number };

/**
 * Hace cuánto que no se mueve cada caso abierto.
 *
 * Es la lectura que sí permite la fecha del libro: como se pisa en cada cambio
 * de estado, la distancia hasta hoy dice cuántos días lleva el caso quieto. Un
 * caso abierto y sin movimiento hace una semana es el que hay que empujar.
 */
export function antiguedadAbiertos(pedidos: Pedido[], hoy = new Date()): FilaAntiguedad[] {
  const abiertos = pedidos.filter((p) => !p.cerrado && p.ultimoMovimiento);
  const grupos = new Map<string, number>();

  for (const pedido of abiertos) {
    const dias = Math.floor(
      (hoy.getTime() - pedido.ultimoMovimiento!.getTime()) / (24 * 60 * 60 * 1000),
    );
    const tramo = TRAMOS_ANTIGUEDAD.find((t) => dias <= t.hasta)?.tramo ?? "Más de 7";
    grupos.set(tramo, (grupos.get(tramo) ?? 0) + 1);
  }

  return TRAMOS_ANTIGUEDAD.filter((t) => grupos.has(t.tramo)).map(({ tramo }) => ({
    tramo,
    casos: grupos.get(tramo)!,
    porcentaje: pct(grupos.get(tramo)!, abiertos.length),
  }));
}
