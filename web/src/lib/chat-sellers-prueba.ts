import { telefonoAsistencia } from "./asistencia";

/** Resuelve una excepción explícita de teléfono de prueba a un seller ID. */
export function sellerIdDeTelefonoPrueba(
  telefono: string,
  entorno: Record<string, string | undefined> = process.env,
): number | null {
  const telefonoPrueba = telefonoAsistencia(entorno.WHATSAPP_SELLER_PRUEBA_TELEFONO);
  const sellerId = Number(entorno.WHATSAPP_SELLER_PRUEBA_ID);
  if (!telefonoPrueba || telefono !== telefonoPrueba) return null;
  if (!Number.isSafeInteger(sellerId) || sellerId <= 0) return null;
  return sellerId;
}
