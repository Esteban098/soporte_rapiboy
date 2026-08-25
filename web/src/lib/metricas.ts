import type { Cancelacion, Pedido } from "./normalizar";

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

/** Un punto de una serie temporal: sirve tanto para días como para meses. */
export type PuntoSerie = {
  /** Clave ordenable: `2026-08-24` para días, `2026-08` para meses. */
  clave: string;
  casos: number;
  devoluciones: number;
  tasaDevolucion: number;
  visitasPromedio: number;
};

export type FilaRanking = {
  nombre: string;
  casos: number;
  devoluciones: number;
  tasaDevolucion: number;
  visitasPromedio: number;
};

export type Tramo = { tramo: string; casos: number; tasaDevolucion: number };

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

function agrupar(pedidos: Pedido[], clave: (pedido: Pedido) => string): PuntoSerie[] {
  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const k = clave(pedido);
    const lista = grupos.get(k);
    if (lista) lista.push(pedido);
    else grupos.set(k, [pedido]);
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, lista]) => {
      const devoluciones = lista.filter((p) => p.devuelto).length;
      const visitas = lista.filter((p) => p.visitas != null).map((p) => p.visitas!);
      return {
        clave: k,
        casos: lista.length,
        devoluciones,
        tasaDevolucion: pct(devoluciones, lista.length),
        visitasPromedio: promedio(visitas),
      };
    });
}

/**
 * Serie día a día por fecha del último movimiento: cuántos casos se tocaron
 * cada día y cuántos de esos quedaron en devolución.
 */
export function porDia(pedidos: Pedido[]): PuntoSerie[] {
  return agrupar(pedidos, (pedido) => pedido.ultimoMovimiento!.toISOString().slice(0, 10));
}

/** Serie mes a mes. Útil solo si alguna vez se carga más de un mes. */
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
    conUbicacion: con.filter((p) => p.tieneUbicacion).length,
    conTelefono: con.filter((p) => p.tieneTelefono).length,
    porTipo,
    porEstado: porEstado(con),
  };
}

export function porMes(pedidos: Pedido[]): PuntoSerie[] {
  return agrupar(pedidos, (pedido) => pedido.mes);
}

/**
 * Ranking por una dimensión del pedido. `minimoCasos` evita que un repartidor
 * con seis entregas aparezca primero por una casualidad.
 */
export function ranking(
  pedidos: Pedido[],
  dimension: "repartidor" | "tienda" | "poligono",
  opciones: { minimoCasos?: number; limite?: number; orden?: "peores" | "mejores" | "volumen" } = {},
): FilaRanking[] {
  const { minimoCasos = 200, limite = 10, orden = "peores" } = opciones;

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

/** Tasa de devolución según cuántas visitas registró el repartidor. */
export function porVisitas(pedidos: Pedido[]): Tramo[] {
  const conVisitas = pedidos.filter((p) => p.visitas != null);
  const tramos = new Map<number, Pedido[]>();

  for (const pedido of conVisitas) {
    const tramo = Math.min(pedido.visitas!, 5);
    const lista = tramos.get(tramo);
    if (lista) lista.push(pedido);
    else tramos.set(tramo, [pedido]);
  }

  return [...tramos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tramo, lista]) => ({
      tramo: tramo === 5 ? "5 o más" : String(tramo),
      casos: lista.length,
      tasaDevolucion: pct(lista.filter((p) => p.devuelto).length, lista.length),
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

export type DispersionRepartidores = {
  evaluados: number;
  mediana: number;
  criticos: number;
  casosCriticos: number;
  /** Devoluciones de más que generan los críticos respecto de la mediana. */
  devolucionesEvitables: number;
  puntos: { nombre: string; casos: number; tasaDevolucion: number; visitasPromedio: number }[];
};

/** Umbral a partir del cual un repartidor entra en revisión individual. */
export const UMBRAL_CRITICO = 25;

export function dispersionRepartidores(pedidos: Pedido[], minimoCasos = 200): DispersionRepartidores {
  const filas = ranking(pedidos, "repartidor", { minimoCasos, limite: Infinity, orden: "volumen" });
  const medianaTasa = mediana(filas.map((f) => f.tasaDevolucion));
  const criticos = filas.filter((f) => f.tasaDevolucion > UMBRAL_CRITICO);

  const evitables = criticos.reduce(
    (total, f) => total + (f.devoluciones - (f.casos * medianaTasa) / 100),
    0,
  );

  return {
    evaluados: filas.length,
    mediana: medianaTasa,
    criticos: criticos.length,
    casosCriticos: criticos.reduce((total, f) => total + f.casos, 0),
    devolucionesEvitables: Math.round(evitables),
    puntos: filas.map((f) => ({
      nombre: f.nombre,
      casos: f.casos,
      tasaDevolucion: f.tasaDevolucion,
      visitasPromedio: f.visitasPromedio,
    })),
  };
}

export type ResumenCancelaciones = {
  casos: number;
  conMinutos: number;
  medianaMinutos: number;
  masDeDosHoras: number;
  porTienda: { nombre: string; casos: number; medianaMinutos: number }[];
};

export function resumenCancelaciones(cancelaciones: Cancelacion[]): ResumenCancelaciones {
  const minutos = cancelaciones.map((c) => c.minutos).filter((m): m is number => m != null);

  const grupos = new Map<string, number[]>();
  for (const c of cancelaciones) {
    if (!c.tienda) continue;
    const lista = grupos.get(c.tienda) ?? [];
    if (c.minutos != null) lista.push(c.minutos);
    grupos.set(c.tienda, lista);
  }

  const porTienda = [...grupos.entries()]
    .map(([nombre, lista]) => ({
      nombre,
      casos: cancelaciones.filter((c) => c.tienda === nombre).length,
      medianaMinutos: mediana(lista),
    }))
    .sort((a, b) => b.casos - a.casos)
    .slice(0, 10);

  return {
    casos: cancelaciones.length,
    conMinutos: minutos.length,
    medianaMinutos: mediana(minutos),
    masDeDosHoras: minutos.filter((m) => m > 120).length,
    porTienda,
  };
}
