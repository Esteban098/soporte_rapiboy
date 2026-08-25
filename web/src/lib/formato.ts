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

export function fechaCorta(fecha: Date | null): string {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: "UTC" }).format(fecha);
}

/** 148 -> `2 h 28 min`. */
export function duracion(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = Math.round(minutos % 60);
  if (horas === 0) return `${resto} min`;
  return `${horas} h ${String(resto).padStart(2, "0")} min`;
}
