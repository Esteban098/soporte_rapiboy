/**
 * Reportes que carga el equipo desde el tablero.
 *
 * Hay una fila por reporte —varias por viaje si hace falta—. `driver` y
 * `seller` son una foto del pedido al momento del alta: así siguen visibles
 * aunque el viaje pase de Mensual a Histórico.
 */

export type EstadoSeguimiento = "abierto" | "cerrado";

export const ESTADOS: EstadoSeguimiento[] = ["abierto", "cerrado"];

export const ETIQUETA_ESTADO: Record<EstadoSeguimiento, string> = {
  abierto: "Abierto",
  cerrado: "Cerrado",
};

export type Seguimiento = {
  id: string;
  creado: Date | null;
  casoId: string;
  driver: string | null;
  seller: string | null;
  comentario: string;
  resumen: string | null;
  archivos: string[];
  estado: EstadoSeguimiento;
  /** Inicio del período abierto actual; se reinicia si el caso se reabre. */
  abiertoEn: Date | null;
  creadoPor: string;
  atendidoPor: string | null;
  atendidoEn: Date | null;
};

/** La fila tal como la devuelve PostgREST. */
export type FilaSeguimiento = {
  id: string;
  created_at: string | null;
  caso_id: string | null;
  driver: string | null;
  seller: string | null;
  comentario_original: string | null;
  resumen_llm: string | null;
  archivos: string[] | null;
  estado: string | null;
  abierto_en: string | null;
  creado_por: string | null;
  atendido_por: string | null;
  atendido_en: string | null;
};

function fecha(valor: string | null): Date | null {
  if (!valor) return null;
  const parseada = new Date(valor);
  return Number.isNaN(parseada.getTime()) ? null : parseada;
}

/**
 * Los `tomado` que todavía pudieran existir antes de aplicar la migración se
 * leen como abiertos. No están resueltos y no deben desaparecer de la cola.
 */
function estado(valor: string | null): EstadoSeguimiento {
  return (valor ?? "").trim().toLowerCase() === "cerrado" ? "cerrado" : "abierto";
}

export function parsearSeguimiento(fila: FilaSeguimiento): Seguimiento {
  return {
    id: fila.id,
    creado: fecha(fila.created_at),
    casoId: (fila.caso_id ?? "").trim(),
    driver: fila.driver?.trim() || null,
    seller: fila.seller?.trim() || null,
    comentario: (fila.comentario_original ?? "").trim(),
    resumen: fila.resumen_llm?.trim() || null,
    archivos: (fila.archivos ?? []).filter(Boolean),
    estado: estado(fila.estado),
    abiertoEn: fecha(fila.abierto_en) ?? fecha(fila.created_at),
    creadoPor: (fila.creado_por ?? "").trim(),
    atendidoPor: fila.atendido_por?.trim() || null,
    atendidoEn: fecha(fila.atendido_en),
  };
}

export function nombreDePersona(correo: string | null): string {
  if (!correo) return "Sin asignar";
  const local = correo.split("@")[0]?.trim();
  return local || correo;
}

export type ResumenSeguimiento = {
  total: number;
  abiertos: number;
  cerrados: number;
  resolucionPromedioMinutos: number | null;
};

/** Minutos desde la última apertura hasta el cierre efectivo. */
export function tiempoResolucionMinutos(reporte: Seguimiento): number | null {
  if (reporte.estado !== "cerrado" || !reporte.abiertoEn || !reporte.atendidoEn) return null;
  const diferencia = reporte.atendidoEn.getTime() - reporte.abiertoEn.getTime();
  return diferencia >= 0 ? Math.round(diferencia / 60_000) : null;
}

export function resumirSeguimientos(reportes: Seguimiento[]): ResumenSeguimiento {
  const tiempos = reportes
    .map(tiempoResolucionMinutos)
    .filter((valor): valor is number => valor !== null);
  return {
    total: reportes.length,
    abiertos: reportes.filter((r) => r.estado === "abierto").length,
    cerrados: reportes.filter((r) => r.estado === "cerrado").length,
    resolucionPromedioMinutos:
      tiempos.length > 0
        ? Math.round(tiempos.reduce((total, minutos) => total + minutos, 0) / tiempos.length)
        : null,
  };
}

export type GrupoSemanaSeguimiento = {
  /** Lunes de la semana operativa, como AAAA-MM-DD. */
  clave: string;
  etiqueta: string;
  reportes: Seguimiento[];
};

const ZONA_OPERATIVA = "America/Mexico_City";
const partesFecha = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ZONA_OPERATIVA,
});
const diaCorto = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const diaLargo = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function fechaLocal(fecha: Date): Date {
  const partes = Object.fromEntries(
    partesFecha.formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  return new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
}

function inicioDeSemana(fecha: Date): Date {
  const local = fechaLocal(fecha);
  const desdeLunes = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - desdeLunes);
  return local;
}

function claveFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function etiquetaSemana(inicio: Date): string {
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 6);
  return `Semana ${diaCorto.format(inicio)} – ${diaLargo.format(fin)}`;
}

/** Agrupa por semanas de lunes a domingo según la fecha de Ciudad de México. */
export function agruparSeguimientosPorSemana(
  reportes: Seguimiento[],
): GrupoSemanaSeguimiento[] {
  const grupos = new Map<string, GrupoSemanaSeguimiento>();

  for (const reporte of reportes) {
    const inicio = reporte.creado ? inicioDeSemana(reporte.creado) : null;
    const clave = inicio ? claveFecha(inicio) : "sin-fecha";
    const grupo = grupos.get(clave) ?? {
      clave,
      etiqueta: inicio ? etiquetaSemana(inicio) : "Sin fecha",
      reportes: [],
    };
    grupo.reportes.push(reporte);
    grupos.set(clave, grupo);
  }

  return [...grupos.values()].sort((a, b) => {
    if (a.clave === "sin-fecha") return 1;
    if (b.clave === "sin-fecha") return -1;
    return b.clave.localeCompare(a.clave);
  });
}
