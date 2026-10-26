export type EstadoGeografico = "NO_EVALUADA" | "DENTRO_DEL_RANGO" | "FUERA_DEL_RANGO"
  | "SIN_COORDENADAS" | "OMITIDA_DATOS_TIENDA" | "NO_ES_ENTREGA";

export const ETIQUETAS_GEOGRAFIA: Record<EstadoGeografico, string> = {
  NO_EVALUADA: "Sin evaluación geográfica",
  DENTRO_DEL_RANGO: "Dentro del rango",
  FUERA_DEL_RANGO: "Fuera del rango · revisar",
  SIN_COORDENADAS: "Sin coordenadas válidas",
  OMITIDA_DATOS_TIENDA: "Omitida por información de tienda",
  NO_ES_ENTREGA: "No aplica: el evento no es una entrega",
};

/** No convierte vacíos, booleanos ni puntos (0, 0) en una ubicación real. */
export function puntoEvidencia(latitud: unknown, longitud: unknown): { lat: number; lon: number } | null {
  const numero = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim()))
    ? Number(v) : NaN;
  const lat = numero(latitud); const lon = numero(longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
      (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

/** Distancia en línea recta; no mide recorrido ni certifica presencia física. */
export function distanciaEvidencia(evento: ReturnType<typeof puntoEvidencia>, destino: ReturnType<typeof puntoEvidencia>): number | null {
  if (!evento || !destino) return null;
  const rad = (n: number) => n * Math.PI / 180;
  const a = Math.sin(rad(destino.lat - evento.lat) / 2) ** 2 +
    Math.cos(rad(evento.lat)) * Math.cos(rad(destino.lat)) * Math.sin(rad(destino.lon - evento.lon) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}
