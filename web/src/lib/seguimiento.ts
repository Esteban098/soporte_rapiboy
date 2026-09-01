/**
 * Reportes que carga el equipo desde el tablero.
 *
 * Es lo único que la web escribe por su cuenta y nadie más toca: `mensual` y
 * `ayer` las rehace n8n cada mañana, así que un comentario guardado ahí duraría
 * hasta la próxima corrida. Acá hay una fila por reporte —varias por viaje si
 * hace falta— con quién lo escribió, quién lo tomó y en qué quedó.
 *
 * Este módulo es puro a propósito: no lee la base ni importa `server-only`,
 * porque los tipos y las etiquetas también los usa la tabla del navegador. La
 * lectura vive en `datos.ts` y la escritura en `app/seguimiento.ts`.
 */

/** En qué mano está el reporte. Es el enum `estado_seguimiento` de la base. */
export type EstadoSeguimiento = "abierto" | "tomado" | "cerrado";

export const ESTADOS: EstadoSeguimiento[] = ["abierto", "tomado", "cerrado"];

export const ETIQUETA_ESTADO: Record<EstadoSeguimiento, string> = {
  abierto: "Abierto",
  tomado: "Tomado",
  cerrado: "Cerrado",
};

export type Seguimiento = {
  id: string;
  creado: Date | null;
  /** Id del viaje al que se refiere, tal como lo escribieron. */
  casoId: string;
  comentario: string;
  /** Lo que resumió el modelo, o `null` si no hubo resumen. */
  resumen: string | null;
  /** Rutas dentro del bucket privado, no URLs: las firma quien las muestra. */
  archivos: string[];
  estado: EstadoSeguimiento;
  creadoPor: string;
  atendidoPor: string | null;
  atendidoEn: Date | null;
};

/** La fila tal como la devuelve PostgREST. */
export type FilaSeguimiento = {
  id: string;
  created_at: string | null;
  caso_id: string | null;
  comentario_original: string | null;
  resumen_llm: string | null;
  archivos: string[] | null;
  estado: string | null;
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
 * Un valor desconocido en `estado` cae en `abierto`, que es lo seguro: el
 * reporte sigue apareciendo en la cola en vez de desaparecer de la vista de
 * todos por un dato mal escrito.
 */
function estado(valor: string | null): EstadoSeguimiento {
  const limpio = (valor ?? "").trim().toLowerCase();
  return limpio === "tomado" || limpio === "cerrado" ? limpio : "abierto";
}

export function parsearSeguimiento(fila: FilaSeguimiento): Seguimiento {
  return {
    id: fila.id,
    creado: fecha(fila.created_at),
    casoId: (fila.caso_id ?? "").trim(),
    comentario: (fila.comentario_original ?? "").trim(),
    resumen: fila.resumen_llm?.trim() || null,
    archivos: (fila.archivos ?? []).filter(Boolean),
    estado: estado(fila.estado),
    creadoPor: (fila.creado_por ?? "").trim(),
    atendidoPor: fila.atendido_por?.trim() || null,
    atendidoEn: fecha(fila.atendido_en),
  };
}

/**
 * Cómo se muestra a una persona: lo que va antes del arroba.
 *
 * El correo entero no entra en el eje de un gráfico y además repite el dominio
 * en todas las barras, que es justo lo que no distingue a nadie.
 */
export function nombreDePersona(correo: string | null): string {
  if (!correo) return "Sin asignar";
  const local = correo.split("@")[0]?.trim();
  return local || correo;
}

export type ConteoPersona = {
  persona: string;
  correo: string;
  tomados: number;
  cerrados: number;
  total: number;
};

/**
 * Cuántos casos tomó y cuántos cerró cada persona.
 *
 * Los `abierto` quedan afuera porque todavía no los atendió nadie: contarlos
 * pediría una barra "sin asignar" que no habla del trabajo de ninguna persona.
 * Se ordena por total para que el eje arranque por quien más movió.
 */
export function contarPorPersona(reportes: Seguimiento[]): ConteoPersona[] {
  const grupos = new Map<string, ConteoPersona>();

  for (const reporte of reportes) {
    if (!reporte.atendidoPor) continue;
    if (reporte.estado !== "tomado" && reporte.estado !== "cerrado") continue;

    const correo = reporte.atendidoPor;
    const actual =
      grupos.get(correo) ??
      { persona: nombreDePersona(correo), correo, tomados: 0, cerrados: 0, total: 0 };

    if (reporte.estado === "tomado") actual.tomados += 1;
    else actual.cerrados += 1;
    actual.total += 1;

    grupos.set(correo, actual);
  }

  return [...grupos.values()].sort((a, b) => b.total - a.total);
}

export type ResumenSeguimiento = {
  total: number;
  abiertos: number;
  tomados: number;
  cerrados: number;
  /** Cuántos tienen al menos un archivo adjunto. */
  conAdjuntos: number;
};

export function resumirSeguimientos(reportes: Seguimiento[]): ResumenSeguimiento {
  return {
    total: reportes.length,
    abiertos: reportes.filter((r) => r.estado === "abierto").length,
    tomados: reportes.filter((r) => r.estado === "tomado").length,
    cerrados: reportes.filter((r) => r.estado === "cerrado").length,
    conAdjuntos: reportes.filter((r) => r.archivos.length > 0).length,
  };
}
