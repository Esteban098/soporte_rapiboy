/**
 * Tipos seguros que las pantallas reciben del directorio operativo.
 *
 * Las filas crudas de Supabase no salen de la capa de datos. Esto importa
 * especialmente para la etapa siguiente de WAHA: el JID del grupo queda en el
 * servidor y la pantalla recibe solo el nombre que necesita mostrar.
 */

export type SellerDirectorio = {
  id: number;
  nombre: string;
  horaCorte: string;
  direccion: string;
  fechaActivacion: string;
  celular: string;
  comercial: string;
  email: string;
  llevaBodega: boolean;
  llevaDropoff: boolean;
  pagaColecta: boolean;
  topeMaximo: number | null;
  grupoWhatsapp: string | null;
  labelsWaha: { id?: string | number; name?: string; color?: string }[];
  ubicacionManual: string;
  latitudManual: number | null;
  longitudManual: number | null;
  asignacion: "AUTOMATICO" | "MANUAL" | null;
  soporteAsignado: "CANDE" | "ESTEBAN" | null;
  actualizadoEn: string;
};

export type DriverDirectorio = {
  id: number;
  nombre: string;
  condicion: string;
  flotilla: string;
  ultimaReserva: string;
  grupoWhatsapp: string | null;
  asignacion: "AUTOMATICO" | "MANUAL" | null;
  actualizadoEn: string;
};

export type ResumenDirectorio = {
  total: number;
  vinculados: number;
  manuales: number;
  pendientes: number;
};

export function resumirDirectorio(
  filas: { grupoWhatsapp: string | null; asignacion: string | null }[],
): ResumenDirectorio {
  const vinculados = filas.filter((fila) => Boolean(fila.grupoWhatsapp)).length;
  const manuales = filas.filter((fila) => fila.asignacion === "MANUAL").length;
  return {
    total: filas.length,
    vinculados,
    manuales,
    pendientes: filas.length - vinculados,
  };
}

/** Fecha y hora para operación, siempre en el reloj de Ciudad de México. */
export function fechaHoraMexico(valor: string): string {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(fecha);
}

/** Una fecha SQL `AAAA-MM-DD`, sin correrla de día por zona horaria. */
export function fechaCalendario(valor: string): string {
  const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}
