const NUMERO = new Intl.NumberFormat("es-MX");
const DECIMAL = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DOS_DECIMALES = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const numero = (valor: number) => NUMERO.format(Math.round(valor));
export const porcentaje = (valor: number) => `${DECIMAL.format(valor)}%`;
export const decimal = (valor: number) => DOS_DECIMALES.format(valor);

/** Hora visible para operación: siempre Argentina, aunque la lógica use México. */
export function horaArgentina(valor: Date | string | number | null, segundos = false): string {
  if (valor == null) return "—";
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return `${new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    ...(segundos ? { second: "2-digit" } : {}),
    hourCycle: "h23",
  }).format(fecha)} hs arg`;
}

/** Fecha y hora visible para operación, en Argentina. */
export function fechaHoraArgentina(valor: Date | string | number | null): string {
  if (valor == null) return "—";
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return `${new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fecha)} hs arg`;
}

/** Diferencia en puntos porcentuales, con signo: `+2.1 pp`. */
export const puntos = (valor: number) =>
  `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${DECIMAL.format(Math.abs(valor))} pp`;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `2026-08` -> `ago 2026`. */
export function mesCorto(mes: string): string {
  const [anio, numeroMes] = mes.split("-");
  return `${MESES[Number(numeroMes) - 1].slice(0, 3)} ${anio}`;
}

/** `2026-08` -> `agosto de 2026`. */
export function mesLargo(mes: string): string {
  const [anio, numeroMes] = mes.split("-");
  return `${MESES[Number(numeroMes) - 1]} de ${anio}`;
}

/** `2026-08-24` -> `24 ago`. */
export function diaCorto(clave: string): string {
  const [, mes, dia] = clave.split("-").map(Number);
  return `${dia} ${MESES[mes - 1].slice(0, 3)}`;
}

/** `2026-08-24` -> `lunes 24 de agosto`. */
export function diaLargo(clave: string): string {
  const [anio, mes, dia] = clave.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const semana = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" }).format(fecha);
  return `${semana} ${dia} de ${MESES[mes - 1]}`;
}

export function fechaCorta(fecha: Date | null): string {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: "UTC" }).format(fecha);
}

/**
 * Minutos como «2 h 30 m», que se lee mejor que 150 en una tabla.
 *
 * Vive acá y no en la pantalla de cancelados porque la comparten esa y el
 * histórico: dos copias se separan en cuanto alguien retoca una.
 */
export function duracion(minutos: number | null): string {
  if (minutos == null) return "—";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return horas > 0 ? `${horas} h ${String(resto).padStart(2, "0")} m` : `${resto} m`;
}

/**
 * Fecha y hora de las tablas históricas. Esas columnas llegan como reloj de
 * pared de México encapsulado en UTC; para mostrar el reloj argentino se
 * agregan las tres horas de diferencia y se rotula el resultado.
 */
export function fechaHora(fecha: Date | null): string {
  if (!fecha) return "—";
  const argentina = new Date(fecha.getTime() + 3 * 60 * 60 * 1000);
  const dd = String(argentina.getUTCDate()).padStart(2, "0");
  const mm = String(argentina.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(argentina.getUTCFullYear()).slice(-2);
  const hh = String(argentina.getUTCHours()).padStart(2, "0");
  const mi = String(argentina.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi} hs arg`;
}
