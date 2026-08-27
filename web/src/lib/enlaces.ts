/** Base del operador de Rapiboy, donde se abre cada viaje. */
const OPERADOR = "https://rapiboy.com/Operador";

/** Link al viaje en el operador, tal como lo abre el equipo desde la planilla. */
export function enlaceViaje(id: string | number): string {
  return `${OPERADOR}?modalidad=5&idviaje=${encodeURIComponent(String(id))}`;
}

/**
 * Foto de la entrega, servida desde `files.rapiboy.com`.
 *
 * La URL tiene que venir dada: el nombre del archivo termina en un sufijo de
 * cuatro caracteres que es aleatorio por archivo, no derivable del viaje. Está
 * comprobado sobre el pedido 30018018, que tiene `-foto-39a2.jpg` (404) y
 * `-foto-57a7.jpg` (la foto real, 26 KB); tampoco coincide con md5, sha1,
 * sha256 ni crc32 del id. Ese sufijo existe para que las fotos no se puedan
 * enumerar probando números, así que cualquier intento de reconstruirlo desde
 * el tablero va a producir links rotos.
 *
 * Por eso acá no se arma nada: se valida lo que traiga el libro y, si no hay
 * nada, la celda queda sin link.
 */
export function enlaceFotoEntrega(url: string): string | null {
  const limpio = url.trim();
  if (!/^https?:\/\//i.test(limpio)) return null;
  return limpio;
}
