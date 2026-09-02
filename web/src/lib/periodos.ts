/**
 * Meses y rangos de meses.
 *
 * Vive aparte porque lo comparten cosas que no se conocen entre sí: los pedidos
 * lo usan para saber a qué mes pertenece un caso, los cancelados para lo mismo
 * con la fecha de colecta, y las pantallas de histórico para leer el rango que
 * viene en la URL. Un solo módulo evita tres definiciones de "agosto".
 *
 * Los meses se escriben `2026-08` a propósito: ordenados como texto quedan
 * ordenados como fechas, así que alcanza con `<` y `>` para compararlos y no
 * hace falta reconstruir un `Date` cada vez.
 */

/** Mes de una fecha, como `2026-08`. Siempre en UTC, como el resto del proyecto. */
export function mesDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * El mes calendario en curso.
 *
 * Se calcula en hora de México y no en la del servidor: en Vercel el servidor
 * corre en UTC, así que del 1 de cada mes hasta las 6 de la mañana de México
 * `new Date()` todavía dice el mes anterior. El equipo entraría al tablero y
 * vería el mes pasado sin ningún aviso.
 */
export function mesEnCurso(hoy = new Date()): string {
  const enMexico = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
  }).format(hoy);
  return enMexico.slice(0, 7);
}

/**
 * Formato `2026-08`, que es lo único que se acepta desde la URL.
 *
 * Recibe `unknown` y no `string` porque también valida lo que llega al servidor
 * desde el navegador, donde nada garantiza que sea texto.
 */
export function esMesValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
}

/**
 * Los meses que realmente tienen datos, del más viejo al más nuevo.
 *
 * El selector se arma con esto y no con un calendario completo: ofrecer meses
 * vacíos invita a elegirlos y a concluir que no pasó nada, cuando lo que pasa
 * es que la ingesta todavía no llegaba tan atrás.
 */
export function mesesDisponibles(meses: string[]): string[] {
  return [...new Set(meses.filter(Boolean))].sort();
}

export type Rango = { desde: string; hasta: string };

/**
 * Qué rango mirar, a partir de lo que pide la URL y de lo que existe.
 *
 * Cualquier cosa que no sea un mes válido y presente se ignora en lugar de
 * vaciar la pantalla: alguien que edita la URL a mano, un link viejo a un mes
 * que ya no está, o `desde` y `hasta` al revés. Sin meses cargados devuelve
 * `null`, que es distinto de un rango vacío y la pantalla lo cuenta distinto.
 */
export function resolverRango(
  pedido: { desde?: string | null; hasta?: string | null },
  disponibles: string[],
): Rango | null {
  if (disponibles.length === 0) return null;

  const primero = disponibles[0];
  const ultimo = disponibles[disponibles.length - 1];

  const acotar = (valor: string) => {
    if (valor < primero) return primero;
    if (valor > ultimo) return ultimo;
    return valor;
  };

  const pidioDesde = esMesValido(pedido.desde);
  const pidioHasta = esMesValido(pedido.hasta);

  // Cada extremo que falta se completa con lo que hace verdadera la frase que
  // el otro empieza: «desde agosto» es hasta el final, «hasta agosto» es desde
  // el principio, y sin ninguno de los dos se muestra el último mes solo, que
  // es lo que casi siempre se viene a ver.
  const desde = pidioDesde ? acotar(pedido.desde!) : pidioHasta ? primero : ultimo;
  const hasta = pidioHasta ? acotar(pedido.hasta!) : pidioDesde ? ultimo : desde;

  // Al revés se da vuelta en lugar de no devolver nada: es un error de tipeo
  // evidente y la intención se entiende igual.
  return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
}

export function enRango(mes: string, rango: Rango): boolean {
  return mes >= rango.desde && mes <= rango.hasta;
}

/** Todos los meses del rango, incluidos los que no tengan datos. */
export function mesesDelRango(rango: Rango): string[] {
  const meses: string[] = [];
  let [anio, mes] = rango.desde.split("-").map(Number);
  const [anioFin, mesFin] = rango.hasta.split("-").map(Number);

  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    meses.push(`${anio}-${String(mes).padStart(2, "0")}`);
    if (mes === 12) {
      mes = 1;
      anio += 1;
    } else {
      mes += 1;
    }
  }
  return meses;
}
