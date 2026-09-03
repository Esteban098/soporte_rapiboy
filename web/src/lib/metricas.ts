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
  /**
   * Casos donde la tienda pasó algo utilizable. No alcanza con que esté
   * tipificado el reclamo: tiene que haber un dato cargado.
   */
  conReclamo: number;
  sinReclamo: number;
  porcentaje: number;
  /** De los que tienen datos, cuántos terminaron entregados. */
  entregadosConReclamo: number;
  tasaEntregaConReclamo: number;
  /** Y cuántos entre los que no tuvieron ninguno, para comparar. */
  tasaEntregaSinReclamo: number;
  avisoPendiente: number;
  avisados: number;
  /** Tipificados por soporte pero sin ningún dato cargado: no aportan nada. */
  tipificadosSinDatos: number;
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
 * Casos donde la tienda compartió algo que sirve para concretar la entrega.
 *
 * El corte es que haya un dato cargado, sin mirar en qué columna cayó: un
 * teléfono, un link de mapa o una indicación del domicilio sirven igual para
 * trabajar el caso. No se usa RECLAMO TIENDA como criterio porque estar
 * tipificado no significa que haya llegado un dato: hay casos con el reclamo
 * cargado y ningún dato atrás, y contarlos infla la métrica.
 */
export function reclamos(pedidos: Pedido[]): Reclamos {
  const con = pedidos.filter((p) => p.tieneDatosTienda);
  const sin = pedidos.filter((p) => !p.tieneDatosTienda);
  const entregadosCon = con.filter((p) => p.entregado).length;

  const grupos = new Map<string, Pedido[]>();
  for (const pedido of con) {
    const tipo = pedido.reclamoTienda.toUpperCase() || "SIN TIPIFICAR";
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
    tipificadosSinDatos: pedidos.filter((p) => p.reclamoTienda !== "" && !p.tieneDatosTienda).length,
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

/*
 * `diasSinMovimiento` y `DIAS_PARA_DEMORA` viven en `normalizar` porque también
 * los usa el cálculo de la columna «Demora» al parsear, y desde allá no se
 * puede importar este módulo sin un ciclo. Se reexportan para que el resto de
 * la app los siga pidiendo donde siempre: son parte del vocabulario de
 * métricas, no de la normalización.
 */
import { diasSinMovimiento, DIAS_PARA_DEMORA } from "./normalizar";
export { diasSinMovimiento, DIAS_PARA_DEMORA };

/**
 * La cola de escalamiento, derivada de los casos del mes.
 *
 * Un caso está demorado cuando pasaron más de dos días desde su último
 * movimiento y todavía no cerró. Los cerrados quedan afuera aunque sean
 * viejos: un pedido entregado la semana pasada no es algo para empujar.
 *
 * Antes esto se leía de las pestañas `Demorados` y `DemoradoNoEntregado`, que
 * el equipo tenía que volver a pegar cada mañana. Calcularlo sobre `Mensual`
 * da lo mismo sin ese paso manual, y no queda desactualizado durante el día.
 */
export function demorados(pedidos: Pedido[], hoy = Date.now()): Pedido[] {
  return pedidos
    .filter((pedido) => {
      if (pedido.cerrado) return false;
      const dias = diasSinMovimiento(pedido, hoy);
      return dias != null && dias > DIAS_PARA_DEMORA;
    })
    .sort((a, b) => a.ultimoMovimiento!.getTime() - b.ultimoMovimiento!.getTime());
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
    const dias = diasSinMovimiento(pedido, hoy.getTime())!;
    const tramo = TRAMOS_ANTIGUEDAD.find((t) => dias <= t.hasta)?.tramo ?? "Más de 7";
    grupos.set(tramo, (grupos.get(tramo) ?? 0) + 1);
  }

  return TRAMOS_ANTIGUEDAD.filter((t) => grupos.has(t.tramo)).map(({ tramo }) => ({
    tramo,
    casos: grupos.get(tramo)!,
    porcentaje: pct(grupos.get(tramo)!, abiertos.length),
  }));
}

export type FilaConteo = { nombre: string; casos: number; porcentaje: number };

/**
 * Los casos que quedaron sin entregar, agrupados por quien los tenía.
 *
 * Sirve para ver si un día malo se explica por un repartidor, una zona o un
 * comercio puntual, en vez de mirar solo el total. Los que no tienen el dato
 * cargado quedan afuera: sumarlos como "sin asignar" ensucia el ranking.
 */
export function noEntregadosPor(
  pedidos: Pedido[],
  dimension: "repartidor" | "poligono" | "tienda",
): FilaConteo[] {
  const sinEntregar = pedidos.filter((p) => p.estado.toLowerCase() === "pedido no entregado");
  const conteo = new Map<string, number>();

  for (const pedido of sinEntregar) {
    const nombre = pedido[dimension];
    if (!nombre) continue;
    conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  }

  return [...conteo.entries()]
    .map(([nombre, casos]) => ({
      nombre,
      casos,
      porcentaje: pct(casos, sinEntregar.length),
    }))
    .sort((a, b) => b.casos - a.casos);
}

/* ------------------------------------------------------------------------- */
/* Histórico                                                                  */
/* ------------------------------------------------------------------------- */

export type FilaMes = {
  mes: string;
  casos: number;
  cerrados: number;
  entregados: number;
  devueltos: number;
  abiertos: number;
  conDatos: number;
  tasaCierre: number;
  tasaEntrega: number;
  /** Entregados sobre el total de cada grupo. Es la comparación que importa. */
  tasaEntregaConDatos: number;
  tasaEntregaSinDatos: number;
};

/**
 * Un renglón por mes, para ver la serie completa en vez de una foto.
 *
 * Los meses sin casos entran igual, en cero: un hueco en la serie puede ser un
 * mes tranquilo o una ingesta que no corrió, y una línea que salta de julio a
 * septiembre como si fueran consecutivos esconde la diferencia. La lista de
 * meses la decide quien llama, que es el único que sabe qué rango se pidió.
 */
export function porMes(pedidos: Pedido[], meses: string[]): FilaMes[] {
  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const lista = grupos.get(pedido.mes);
    if (lista) lista.push(pedido);
    else grupos.set(pedido.mes, [pedido]);
  }

  return meses.map((mes) => {
    const lista = grupos.get(mes) ?? [];
    const con = lista.filter((p) => p.tieneDatosTienda);
    const sin = lista.filter((p) => !p.tieneDatosTienda);
    const cerrados = lista.filter((p) => p.cerrado).length;
    const entregados = lista.filter((p) => p.entregado).length;

    return {
      mes,
      casos: lista.length,
      cerrados,
      entregados,
      devueltos: lista.filter((p) => p.devuelto).length,
      abiertos: lista.length - cerrados,
      conDatos: con.length,
      tasaCierre: pct(cerrados, lista.length),
      tasaEntrega: pct(entregados, lista.length),
      tasaEntregaConDatos: pct(con.filter((p) => p.entregado).length, con.length),
      tasaEntregaSinDatos: pct(sin.filter((p) => p.entregado).length, sin.length),
    };
  });
}

export type FilaDesenlace = {
  estado: string;
  cerrado: boolean;
  conDatos: number;
  sinDatos: number;
  total: number;
  /** Qué parte de los casos de ese estado tenía datos de la tienda. */
  porcentajeConDatos: number;
};

export type Desenlaces = {
  conDatos: number;
  sinDatos: number;
  filas: FilaDesenlace[];
};

/**
 * En qué terminó cada caso, separando los que tenían datos de la tienda.
 *
 * Es la lectura que justifica pedirle datos a la tienda: si «Entregado» tiene
 * mucho más peso entre los que aportaron algo que entre los que no, el pedido
 * sirve. Puestos uno al lado del otro se ve sin tener que calcular nada.
 *
 * Se muestran los conteos y no solo los porcentajes porque los grupos casi
 * nunca tienen el mismo tamaño: un 100% sobre tres casos y otro sobre
 * trescientos se leen igual de bien en una tabla y no significan lo mismo.
 */
export function desenlaces(pedidos: Pedido[]): Desenlaces {
  const grupos = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const estado = pedido.estado || "Sin estado";
    const lista = grupos.get(estado);
    if (lista) lista.push(pedido);
    else grupos.set(estado, [pedido]);
  }

  const filas = [...grupos.entries()]
    .map(([estado, lista]) => {
      const conDatos = lista.filter((p) => p.tieneDatosTienda).length;
      return {
        estado,
        cerrado: lista[0].cerrado,
        conDatos,
        sinDatos: lista.length - conDatos,
        total: lista.length,
        porcentajeConDatos: pct(conDatos, lista.length),
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    conDatos: pedidos.filter((p) => p.tieneDatosTienda).length,
    sinDatos: pedidos.filter((p) => !p.tieneDatosTienda).length,
    filas,
  };
}
