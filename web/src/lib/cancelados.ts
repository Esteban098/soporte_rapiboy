/**
 * Viajes cancelados el mismo día en que se colectaron, dentro de las 7 horas.
 *
 * No son entregas fallidas: el paquete nunca llegó a intentarse porque el
 * cliente dio marcha atrás. Por eso viven aparte de `mensual` y no comparten su
 * esquema — no tienen reclamo, ni aviso, ni caso que cerrar.
 *
 * El recorte de "mismo día y menos de 7 horas" vive en la consulta de n8n, así
 * que esta tabla es de cancelaciones tempranas y no del total. Vale tenerlo
 * presente antes de calcular una tasa sobre estos números.
 */

import { mesDe } from "./periodos";

export type Cancelado = {
  id: number;
  /** Id del envío en Meli. Es texto: no es un número nuestro. */
  idMeli: string;
  tienda: string;
  /** Estado en nuestro sistema y en el de Meli, sin unificar. */
  estadoRbp: string;
  estadoMeli: string;
  colectado: Date | null;
  cancelado: Date | null;
  /** Cuánto tardó el cliente en cancelar, desde que se colectó. */
  minutos: number | null;
  /** Día de la colecta, como `2026-08-31`. */
  dia: string;
  /**
   * Mes al que pertenece, como `2026-08`. Sale de la colecta y no de la
   * cancelación: las dos ocurren el mismo día por definición de esta tabla,
   * pero la colecta es la que ordena el resto del tablero.
   */
  mes: string;
  /**
   * Meli todavía no registró la cancelación.
   *
   * Nuestro sistema pasa el viaje a devolución apenas se cancela, pero del otro
   * lado el envío puede seguir figurando como pendiente de colecta. Mientras
   * los dos no coincidan, el caso puede volver a aparecer en una ruta.
   */
  desincronizado: boolean;
};

const ALIAS: Record<string, string[]> = {
  id: ["id"],
  idMeli: ["id_meli", "id meli"],
  tienda: ["tienda"],
  estadoRbp: ["estado_rbp", "estado rbp"],
  estadoMeli: ["estado_meli", "estado meli"],
  colectado: ["fecha_colectado", "fecha_colectadomex", "fecha colectado"],
  cancelado: ["fecha_cancelado", "fecha_canceladomex", "fecha cancelado"],
};

export type MapaCancelados = Partial<Record<keyof typeof ALIAS, number>>;

export function mapearColumnasCancelados(encabezado: string[]): MapaCancelados {
  const normalizado = encabezado.map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
  const mapa: MapaCancelados = {};
  for (const [campo, nombres] of Object.entries(ALIAS)) {
    const indice = normalizado.findIndex((c) => nombres.includes(c));
    if (indice >= 0) mapa[campo] = indice;
  }
  return mapa;
}

function celda(fila: string[], indice: number | undefined): string {
  if (indice == null) return "";
  return String(fila[indice] ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Lee una marca de tiempo conservando el reloj de pared.
 *
 * Las fechas llegan sin zona horaria porque la consulta ya les restó tres horas
 * para dejarlas en hora de México. Se arman en UTC a propósito: si se dejara
 * que `new Date` las interprete como hora local, el servidor volvería a
 * correrlas y los horarios quedarían mal por segunda vez.
 */
export function parsearMarca(valor: string): Date | null {
  const m = valor.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
}

const MINUTO_MS = 60 * 1000;

export function parsearCancelado(fila: string[], mapa: MapaCancelados): Cancelado | null {
  const id = Number(celda(fila, mapa.id));
  if (!Number.isFinite(id) || id <= 0) return null;

  const colectado = parsearMarca(celda(fila, mapa.colectado));
  const cancelado = parsearMarca(celda(fila, mapa.cancelado));
  const estadoMeli = celda(fila, mapa.estadoMeli);

  return {
    id,
    idMeli: celda(fila, mapa.idMeli),
    tienda: celda(fila, mapa.tienda),
    estadoRbp: celda(fila, mapa.estadoRbp),
    estadoMeli,
    colectado,
    cancelado,
    minutos:
      colectado && cancelado
        ? Math.round((cancelado.getTime() - colectado.getTime()) / MINUTO_MS)
        : null,
    dia: colectado ? colectado.toISOString().slice(0, 10) : "",
    mes: colectado ? mesDe(colectado) : "",
    desincronizado: estadoMeli !== "" && estadoMeli.toLowerCase() !== "cancelado",
  };
}

export type ResumenCancelados = {
  total: number;
  comercios: number;
  /** Mediana de minutos hasta la cancelación. Mediana y no promedio: con pocos
   *  casos, uno tardío corre el promedio y deja de describir al resto. */
  minutosMediana: number | null;
  desincronizados: number;
  porComercio: FilaComercioCancelado[];
};

export type FilaComercioCancelado = {
  tienda: string;
  casos: number;
  minutosMediana: number | null;
  desincronizados: number;
};

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : Math.round((orden[medio - 1] + orden[medio]) / 2);
}

export function resumirCancelados(cancelados: Cancelado[]): ResumenCancelados {
  const grupos = new Map<string, Cancelado[]>();
  for (const c of cancelados) {
    const nombre = c.tienda || "Sin comercio";
    const lista = grupos.get(nombre);
    if (lista) lista.push(c);
    else grupos.set(nombre, [c]);
  }

  const porComercio = [...grupos.entries()]
    .map(([tienda, lista]) => ({
      tienda,
      casos: lista.length,
      minutosMediana: mediana(lista.filter((c) => c.minutos != null).map((c) => c.minutos!)),
      desincronizados: lista.filter((c) => c.desincronizado).length,
    }))
    .sort((a, b) => b.casos - a.casos || a.tienda.localeCompare(b.tienda));

  return {
    total: cancelados.length,
    comercios: grupos.size,
    minutosMediana: mediana(cancelados.filter((c) => c.minutos != null).map((c) => c.minutos!)),
    desincronizados: cancelados.filter((c) => c.desincronizado).length,
    porComercio,
  };
}

export type FilaMesCancelados = {
  mes: string;
  casos: number;
  comercios: number;
  minutosMediana: number | null;
  desincronizados: number;
};

/**
 * Un renglón por mes, para ver si las cancelaciones tempranas suben o bajan.
 *
 * Los meses sin casos entran en cero, igual que en el histórico de pedidos: un
 * hueco puede ser un mes tranquilo o una ingesta que no corrió, y una serie que
 * salta de julio a septiembre como si fueran seguidos esconde la diferencia.
 *
 * `comercios` cuenta distintos por mes y por eso no se puede sumar entre meses:
 * un comercio que canceló en agosto y en septiembre es uno solo, no dos.
 */
export function canceladosPorMes(
  cancelados: Cancelado[],
  meses: string[],
): FilaMesCancelados[] {
  const grupos = new Map<string, Cancelado[]>();
  for (const c of cancelados) {
    const lista = grupos.get(c.mes);
    if (lista) lista.push(c);
    else grupos.set(c.mes, [c]);
  }

  return meses.map((mes) => {
    const lista = grupos.get(mes) ?? [];
    return {
      mes,
      casos: lista.length,
      comercios: new Set(lista.map((c) => c.tienda || "Sin comercio")).size,
      minutosMediana: mediana(lista.filter((c) => c.minutos != null).map((c) => c.minutos!)),
      desincronizados: lista.filter((c) => c.desincronizado).length,
    };
  });
}
