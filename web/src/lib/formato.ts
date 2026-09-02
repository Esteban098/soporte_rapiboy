const NUMERO = new Intl.NumberFormat("es-MX");
const DECIMAL = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DOS_DECIMALES = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const numero = (valor: number) => NUMERO.format(Math.round(valor));
export const porcentaje = (valor: number) => `${DECIMAL.format(valor)}%`;
export const decimal = (valor: number) => DOS_DECIMALES.format(valor);

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
 * Fecha y hora tal como quedaron guardadas, sin reinterpretar la zona.
 *
 * Se leen los componentes UTC a propósito: la consulta ya dejó estas marcas en
 * hora de México, así que formatearlas con la zona del servidor las correría
 * por segunda vez.
 */
export function fechaHora(fecha: Date | null): string {
  if (!fecha) return "—";
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(fecha.getUTCHours()).padStart(2, "0");
  const mi = String(fecha.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}
