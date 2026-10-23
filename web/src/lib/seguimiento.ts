/**
 * Reportes que carga el equipo desde el tablero.
 *
 * Hay una fila por reporte —varias por viaje si hace falta—. `driver` y
 * `seller` son una foto del pedido al momento del alta: así siguen visibles
 * aunque el viaje pase de Mensual a Histórico.
 */

/** Lo que guarda la columna `estado`. Tomar un reporte no lo saca de abierto. */
export type EstadoSeguimiento = "abierto" | "cerrado";

export const ESTADOS: EstadoSeguimiento[] = ["abierto", "cerrado"];

/**
 * Lo que ve el equipo: el estado más si alguien tomó el reporte.
 *
 * `tomado` no es un valor de la base sino `tomado_por` puesto sobre un reporte
 * abierto. Así un tomado sigue siendo abierto para todo lo que cuenta —la cola,
 * los totales, el tiempo de resolución— sin que cada cálculo tenga que
 * acordarse de sumar dos estados.
 */
export type EtapaSeguimiento = "abierto" | "tomado" | "cerrado";

export const ETAPAS: EtapaSeguimiento[] = ["abierto", "tomado", "cerrado"];

export const ETIQUETA_ETAPA: Record<EtapaSeguimiento, string> = {
  abierto: "Abierto",
  tomado: "Tomado",
  cerrado: "Cerrado",
};

export type Seguimiento = {
  id: string;
  creado: Date | null;
  casoId: string;
  driver: string | null;
  seller: string | null;
  comentario: string;
  archivos: string[];
  estado: EstadoSeguimiento;
  /** Inicio del período abierto actual; se reinicia si el caso se reabre. */
  abiertoEn: Date | null;
  creadoPor: string;
  /** Última modificación real del texto, distinta de cambios de estado o responsable. */
  comentarioActualizadoPor: string | null;
  comentarioActualizadoEn: Date | null;
  tomadoPor: string | null;
  tomadoEn: Date | null;
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
  archivos: string[] | null;
  estado: string | null;
  abierto_en: string | null;
  creado_por: string | null;
  /** Opcionales hasta aplicar `migracion-47-seguimiento-actualizaciones.sql`. */
  comentario_actualizado_por?: string | null;
  comentario_actualizado_en?: string | null;
  /** Opcionales: no existen hasta correr `migracion-11-seguimiento-tomado.sql`. */
  tomado_por?: string | null;
  tomado_en?: string | null;
  atendido_por: string | null;
  atendido_en: string | null;
};

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const parseada = new Date(valor);
  return Number.isNaN(parseada.getTime()) ? null : parseada;
}

/**
 * Los `tomado` que todavía pudieran existir en la columna `estado` se leen
 * como abiertos. No están resueltos y no deben desaparecer de la cola.
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
    archivos: (fila.archivos ?? []).filter(Boolean),
    estado: estado(fila.estado),
    abiertoEn: fecha(fila.abierto_en) ?? fecha(fila.created_at),
    creadoPor: (fila.creado_por ?? "").trim(),
    comentarioActualizadoPor: fila.comentario_actualizado_por?.trim() || null,
    comentarioActualizadoEn: fecha(fila.comentario_actualizado_en),
    tomadoPor: fila.tomado_por?.trim() || null,
    tomadoEn: fecha(fila.tomado_en),
    atendidoPor: fila.atendido_por?.trim() || null,
    atendidoEn: fecha(fila.atendido_en),
  };
}

/**
 * Extrae los responsables de la respuesta autenticada del flujo 11.
 *
 * Seller es la tienda vigente del viaje. Driver es el último repartidor no
 * vacío del historial, que el flujo devuelve en orden cronológico. No se usan
 * datos de otra localidad o modalidad aunque RapiboyData encuentre el viaje.
 */
export function responsablesDesdeRapiboyData(crudo: unknown): {
  driver: string | null;
  seller: string | null;
} {
  const datos = crudo && typeof crudo === "object" ? crudo as Record<string, unknown> : {};
  if (datos.encontrado !== true) return { driver: null, seller: null };

  const viaje = datos.viaje && typeof datos.viaje === "object"
    ? datos.viaje as Record<string, unknown>
    : {};
  if (Number(viaje.id_modalidad) !== 5 || Number(viaje.id_localidad) !== 9) {
    return { driver: null, seller: null };
  }

  const texto = (valor: unknown) =>
    typeof valor === "string" && valor.trim() ? valor.trim() : null;
  const historial = Array.isArray(datos.historial) ? datos.historial : [];
  let driver: string | null = null;
  for (const movimiento of historial) {
    if (!movimiento || typeof movimiento !== "object") continue;
    driver = texto((movimiento as Record<string, unknown>).repartidor) ?? driver;
  }

  return { driver, seller: texto(viaje.tienda) };
}

export function etapaDe(reporte: Seguimiento): EtapaSeguimiento {
  if (reporte.estado === "cerrado") return "cerrado";
  return reporte.tomadoPor ? "tomado" : "abierto";
}

export function nombreDePersona(correo: string | null): string {
  if (!correo) return "Sin asignar";
  const local = correo.split("@")[0]?.trim();
  return local || correo;
}

export type GrupoResponsableSeguimiento = {
  clave: string;
  etiqueta: string;
  responsable: string | null;
  reportes: Seguimiento[];
};

/**
 * Agrupa sin perder el orden que decidió la vista.
 *
 * Los pendientes se atribuyen a quien los tomó y los cerrados a quien los
 * cerró. Son responsabilidades distintas y en Lista conservan grupos separados
 * aunque las dos acciones las haya realizado la misma persona.
 */
export function agruparPorResponsableSeguimiento(
  reportes: Seguimiento[],
): GrupoResponsableSeguimiento[] {
  const grupos = new Map<string, GrupoResponsableSeguimiento>();
  for (const reporte of reportes) {
    const cerrado = reporte.estado === "cerrado";
    const correo = (cerrado ? reporte.atendidoPor : reporte.tomadoPor)?.trim() || null;
    const accion = cerrado ? "cierre" : "toma";
    const clave = correo ? `${accion}:${correo.toLowerCase()}` : `__sin_${accion}__`;
    const etiqueta = correo
      ? `${cerrado ? "Cerrado" : "Tomado"} por ${nombreDePersona(correo)}`
      : cerrado ? "Sin cierre registrado" : "Sin tomar";
    const grupo = grupos.get(clave) ?? { clave, etiqueta, responsable: correo, reportes: [] };
    grupo.reportes.push(reporte);
    grupos.set(clave, grupo);
  }

  const prioridad = (clave: string) =>
    clave === "__sin_toma__" ? 0 : clave === "__sin_cierre__" ? 2 : 1;
  return [...grupos.values()].sort((a, b) =>
    prioridad(a.clave) - prioridad(b.clave)
      || a.etiqueta.localeCompare(b.etiqueta, "es", { sensitivity: "base" }),
  );
}

/** `esteban.larcher@…` -> `EL`. Para el avatar de las tarjetas. */
export function inicialesDePersona(correo: string | null): string {
  if (!correo) return "?";
  const nombre = nombreDePersona(correo);
  const partes = nombre.split(/[._\-\s]+/).filter(Boolean);
  const letras = partes.length > 1 ? partes[0][0] + partes[1][0] : nombre.slice(0, 2);
  return letras.toUpperCase();
}

/** Tonos oscuros a propósito: llevan texto blanco en tema claro y oscuro. */
const COLORES_PERSONA = [
  "#5856d6",
  "#af52de",
  "#c9184a",
  "#b25000",
  "#0e7c86",
  "#248a3d",
  "#0062c4",
  "#7f6545",
];

/**
 * El color sale del correo y no del orden en pantalla: así cada persona
 * conserva el suyo en todas las tarjetas y en todos los filtros.
 */
export function colorDePersona(correo: string): string {
  const local = correo.trim().toLowerCase().split("@")[0] ?? "";
  if (/^esteban(?:[._-]|$)/.test(local)) return "var(--persona-esteban, #45a3ff)";
  if (/^(?:candelaria|cande)(?:[._-]|$)/.test(local)) return "var(--persona-candelaria, #ff4fb2)";

  let hash = 0;
  for (const caracter of correo) hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0;
  return COLORES_PERSONA[hash % COLORES_PERSONA.length];
}

export type ResumenSeguimiento = {
  total: number;
  /** Incluye los tomados: un tomado todavía no está resuelto. */
  abiertos: number;
  sinTomar: number;
  tomados: number;
  cerrados: number;
  resolucionPromedioMinutos: number | null;
};

/** Minutos desde la última apertura hasta el cierre efectivo. */
export function tiempoResolucionMinutos(reporte: Seguimiento): number | null {
  if (reporte.estado !== "cerrado" || !reporte.abiertoEn || !reporte.atendidoEn) return null;
  const diferencia = reporte.atendidoEn.getTime() - reporte.abiertoEn.getTime();
  return diferencia >= 0 ? Math.round(diferencia / 60_000) : null;
}

/** Minutos que lleva pendiente un reporte, desde su última apertura. */
export function minutosAbierto(reporte: Seguimiento, ahora: number): number | null {
  if (reporte.estado === "cerrado" || !reporte.abiertoEn) return null;
  return Math.max(0, Math.floor((ahora - reporte.abiertoEn.getTime()) / 60_000));
}

/** A partir de cuándo se avisa a quien tiene tomado un seguimiento abierto. */
export const DIAS_PARA_ALERTA_SEGUIMIENTO = 3;

/** Un aviso vencido solo tiene destinatario si el reporte fue tomado. */
export function seguimientoVencido(reporte: Seguimiento, ahora = Date.now()): boolean {
  return reporte.estado === "abierto" &&
    Boolean(reporte.tomadoPor) &&
    Boolean(reporte.abiertoEn) &&
    ahora - reporte.abiertoEn!.getTime() > DIAS_PARA_ALERTA_SEGUIMIENTO * 24 * 60 * 60 * 1000;
}

export function resumirSeguimientos(reportes: Seguimiento[]): ResumenSeguimiento {
  const tiempos = reportes
    .map(tiempoResolucionMinutos)
    .filter((valor): valor is number => valor !== null);
  const etapas = reportes.map(etapaDe);
  const sinTomar = etapas.filter((etapa) => etapa === "abierto").length;
  const tomados = etapas.filter((etapa) => etapa === "tomado").length;
  return {
    total: reportes.length,
    abiertos: sinTomar + tomados,
    sinTomar,
    tomados,
    cerrados: etapas.filter((etapa) => etapa === "cerrado").length,
    resolucionPromedioMinutos:
      tiempos.length > 0
        ? Math.round(tiempos.reduce((total, minutos) => total + minutos, 0) / tiempos.length)
        : null,
  };
}

export type Agrupacion = "semana" | "mes";
export type PeriodoSeguimiento = Agrupacion | "todos";

export function clavePeriodo(fecha: Date, por: Agrupacion): string {
  const inicio = por === "mes" ? inicioDeMes(fecha) : inicioDeSemana(fecha);
  return inicio.toISOString().slice(0, por === "mes" ? 7 : 10);
}

export function periodoActual(por: Agrupacion, ahora = new Date()): string {
  return clavePeriodo(ahora, por);
}

export function periodoValido(por: Agrupacion, clave: string): boolean {
  if (por === "mes") return /^\d{4}-(0[1-9]|1[0-2])$/.test(clave);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) return false;
  const fecha = new Date(`${clave}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === clave && fecha.getUTCDay() === 1;
}

export function moverPeriodo(por: Agrupacion, clave: string, cantidad: number): string {
  const fecha = new Date(`${por === "mes" ? `${clave}-01` : clave}T00:00:00Z`);
  if (por === "mes") fecha.setUTCMonth(fecha.getUTCMonth() + cantidad);
  else fecha.setUTCDate(fecha.getUTCDate() + cantidad * 7);
  return fecha.toISOString().slice(0, por === "mes" ? 7 : 10);
}

export function etiquetaPeriodo(por: Agrupacion, clave: string): string {
  const inicio = new Date(`${por === "mes" ? `${clave}-01` : clave}T00:00:00Z`);
  return por === "mes" ? etiquetaMes(inicio) : etiquetaSemana(inicio);
}

export type GrupoSeguimiento = {
  /** Lunes de la semana (AAAA-MM-DD) o mes (AAAA-MM), según la agrupación. */
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
const mesLargo = new Intl.DateTimeFormat("es-MX", {
  month: "long",
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

function inicioDeMes(fecha: Date): Date {
  const local = fechaLocal(fecha);
  local.setUTCDate(1);
  return local;
}

function etiquetaSemana(inicio: Date): string {
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 6);
  return `Semana ${diaCorto.format(inicio)} – ${diaLargo.format(fin)}`;
}

function etiquetaMes(inicio: Date): string {
  const texto = mesLargo.format(inicio);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Agrupa por semanas de lunes a domingo, o por mes calendario, según la fecha
 * de Ciudad de México. Los grupos van del más reciente al más viejo.
 */
export function agruparSeguimientos(
  reportes: Seguimiento[],
  por: Agrupacion = "semana",
): GrupoSeguimiento[] {
  const grupos = new Map<string, GrupoSeguimiento>();

  for (const reporte of reportes) {
    const inicio = reporte.creado
      ? por === "mes"
        ? inicioDeMes(reporte.creado)
        : inicioDeSemana(reporte.creado)
      : null;
    const clave = inicio ? clavePeriodo(reporte.creado!, por) : "sin-fecha";
    const grupo = grupos.get(clave) ?? {
      clave,
      etiqueta: inicio ? (por === "mes" ? etiquetaMes(inicio) : etiquetaSemana(inicio)) : "Sin fecha",
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
