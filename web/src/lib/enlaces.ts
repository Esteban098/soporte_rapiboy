/** Base del operador de Rapiboy, donde se abre cada viaje. */
const OPERADOR = "https://rapiboy.com/Operador";

/** Link al viaje en el operador, tal como lo abre el equipo desde la planilla. */
export function enlaceViaje(id: string | number): string {
  return `${OPERADOR}?modalidad=5&idviaje=${encodeURIComponent(String(id))}`;
}
