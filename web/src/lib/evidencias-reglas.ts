import { ZONA_OPERACION_LOGISTICA } from "./zona-horaria";

export const ZONA_MEXICO = ZONA_OPERACION_LOGISTICA;

/** Día calendario de la operación, sin depender de la zona del servidor. */
export function diaEvidencias(fecha = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_MEXICO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

/** La ventana incluye la ejecución de las 23:00, pero no minutos posteriores. */
export function enVentanaEvidencias(fecha = new Date()): boolean {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_MEXICO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const hora = Number(partes.find((parte) => parte.type === "hour")?.value ?? -1);
  const minuto = Number(partes.find((parte) => parte.type === "minute")?.value ?? -1);
  return hora >= 15 && (hora < 23 || (hora === 23 && minuto === 0));
}

export function extensionDeMime(mime: string): "jpg" | "png" | "webp" | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

export function codigoSeguro(error: unknown): string {
  const valor = error instanceof Error ? error.message : "error_desconocido";
  return valor.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) || "error_desconocido";
}
