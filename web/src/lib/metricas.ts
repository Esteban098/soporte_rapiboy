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

export type PuntoMes = {
  mes: string;
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

export function porMes(pedidos: Pedido[]): PuntoMes[] {
  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const lista = grupos.get(pedido.mes);
    if (lista) lista.push(pedido);
    else grupos.set(pedido.mes, [pedido]);
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, lista]) => {
      const devoluciones = lista.filter((p) => p.devuelto).length;
      const visitas = lista.filter((p) => p.visitas != null).map((p) => p.visitas!);
      return {
        mes,
        casos: lista.length,
        devoluciones,
        tasaDevolucion: pct(devoluciones, lista.length),
        visitasPromedio: promedio(visitas),
      };
    });
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

const TRAMOS_LEAD: { tramo: string; hasta: number }[] = [
  { tramo: "0–1 d", hasta: 1 },
  { tramo: "2–3 d", hasta: 3 },
  { tramo: "4–7 d", hasta: 7 },
  { tramo: "8–14 d", hasta: 14 },
  { tramo: "15–30 d", hasta: 30 },
];

/** Tasa de devolución según los días entre creación y fecha programada. */
export function porLeadTime(pedidos: Pedido[]): Tramo[] {
  const grupos = new Map<string, Pedido[]>();

  for (const pedido of pedidos) {
    const dias = pedido.leadTime;
    if (dias == null || dias < 0 || dias > 30) continue;
    const tramo = TRAMOS_LEAD.find((t) => dias <= t.hasta)?.tramo;
    if (!tramo) continue;
    const lista = grupos.get(tramo);
    if (lista) lista.push(pedido);
    else grupos.set(tramo, [pedido]);
  }

  return TRAMOS_LEAD.filter((t) => grupos.has(t.tramo)).map(({ tramo }) => {
    const lista = grupos.get(tramo)!;
    return {
      tramo,
      casos: lista.length,
      tasaDevolucion: pct(lista.filter((p) => p.devuelto).length, lista.length),
    };
  });
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function porDiaSemana(pedidos: Pedido[]): Tramo[] {
  const grupos = new Map<number, Pedido[]>();
  for (const pedido of pedidos) {
    const dia = pedido.programado!.getUTCDay();
    const lista = grupos.get(dia);
    if (lista) lista.push(pedido);
    else grupos.set(dia, [pedido]);
  }

  // Empezamos la semana en lunes, que es como la mira la operación.
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden
    .filter((dia) => grupos.has(dia))
    .map((dia) => {
      const lista = grupos.get(dia)!;
      return {
        tramo: DIAS[dia],
        casos: lista.length,
        tasaDevolucion: pct(lista.filter((p) => p.devuelto).length, lista.length),
      };
    });
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
