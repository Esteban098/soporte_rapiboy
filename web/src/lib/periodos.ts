/**
 * Meses en formato `AAAA-MM`: su orden alfabético coincide con el cronológico.
 */

/** Mes de una fecha de datos, interpretada en UTC. */
export function mesDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mes calendario de México, independiente de la zona horaria del servidor. */
export function mesEnCurso(hoy = new Date()): string {
  const enMexico = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
  }).format(hoy);
  return enMexico.slice(0, 7);
}

/** El mes inmediatamente anterior a uno escrito como `AAAA-MM`. */
export function mesAnterior(mes: string): string {
  const [anio, numeroMes] = mes.split("-").map(Number);
  return numeroMes === 1
    ? `${anio - 1}-12`
    : `${anio}-${String(numeroMes - 1).padStart(2, "0")}`;
}

/**
 * Ventana operativa en hora de México: mes anterior y actual hasta el día 9;
 * solo el actual desde el 10.
 */
export function mesesOperativos(hoy = new Date()): string[] {
  const actual = mesEnCurso(hoy);
  const dia = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      day: "2-digit",
    }).format(hoy),
  );

  return dia < 10 ? [mesAnterior(actual), actual] : [actual];
}

export function esMesValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
}

/** Meses con datos, sin duplicados y del más viejo al más nuevo. */
export function mesesDisponibles(meses: string[]): string[] {
  return [...new Set(meses.filter(Boolean))].sort();
}

export type Rango = { desde: string; hasta: string };

/**
 * Acota el rango pedido a los extremos disponibles y corrige el orden.
 * Sin meses cargados devuelve `null`; sin selección muestra el último mes.
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

  // Una selección parcial se extiende al primer o último mes disponible.
  const desde = pidioDesde ? acotar(pedido.desde!) : pidioHasta ? primero : ultimo;
  const hasta = pidioHasta ? acotar(pedido.hasta!) : pidioDesde ? ultimo : desde;

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
