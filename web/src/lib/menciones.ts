/**
 * Menciones con arroba en los comentarios de seguimiento.
 *
 * Se escribe `@alias`, y el alias es la parte local del correo en minúsculas:
 * `@esteban.larcher` para `esteban.larcher@rapiboy.com`. Es lo que cada persona
 * reconoce como propio y no obliga a tipear el dominio.
 *
 * Si dos correos comparten la parte local, ese alias queda afuera del
 * directorio: avisarle a la persona equivocada es peor que no avisar.
 *
 * Sin `server-only`: lo usan el servidor —para decidir a quién notificar— y el
 * navegador —para el autocompletado y para resaltar las menciones—, y tienen
 * que leer el texto exactamente igual.
 */

export type Mencionable = { email: string; alias: string; nombre: string | null };

/**
 * `@` al principio o después de algo que no sea letra, `@` o punto —así un
 * correo escrito en el texto no cuenta como mención—, y un alias que no
 * termina en punto, para que «avisale a @ana.» mencione a `ana`.
 */
const PATRON_MENCION = /(^|[^\w@.])@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/gi;

export function aliasDeCorreo(email: string): string {
  return (email.split("@")[0] ?? email).trim().toLowerCase();
}

/** Arma el directorio sin repetidos y sin alias ambiguos, ordenado por alias. */
export function armarDirectorio(
  personas: { email: string; nombre?: string | null }[],
): Mencionable[] {
  const porCorreo = new Map<string, Mencionable>();
  for (const persona of personas) {
    const email = persona.email.trim().toLowerCase();
    if (!email.includes("@")) continue;
    const previo = porCorreo.get(email);
    porCorreo.set(email, {
      email,
      alias: aliasDeCorreo(email),
      nombre: previo?.nombre ?? (persona.nombre?.trim() || null),
    });
  }

  const usos = new Map<string, number>();
  for (const { alias } of porCorreo.values()) usos.set(alias, (usos.get(alias) ?? 0) + 1);

  return [...porCorreo.values()]
    .filter(({ alias }) => usos.get(alias) === 1)
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

/** Los alias escritos en el texto, en minúsculas y sin repetir. */
export function aliasMencionados(texto: string): string[] {
  const vistos = new Set<string>();
  for (const coincidencia of texto.matchAll(PATRON_MENCION)) {
    vistos.add(coincidencia[2].toLowerCase());
  }
  return [...vistos];
}

/** Los correos mencionados que existen en el directorio. */
export function correosMencionados(texto: string, directorio: Mencionable[]): string[] {
  const porAlias = new Map(directorio.map((persona) => [persona.alias, persona.email]));
  return aliasMencionados(texto)
    .map((alias) => porAlias.get(alias))
    .filter((email): email is string => Boolean(email));
}

export type Tramo = { texto: string; alias: string | null };

/** Parte el texto en tramos para poder pintar cada mención aparte. */
export function tramosConMenciones(texto: string): Tramo[] {
  const tramos: Tramo[] = [];
  let desde = 0;

  for (const coincidencia of texto.matchAll(PATRON_MENCION)) {
    const inicio = (coincidencia.index ?? 0) + coincidencia[1].length;
    const fin = inicio + 1 + coincidencia[2].length;
    if (inicio > desde) tramos.push({ texto: texto.slice(desde, inicio), alias: null });
    tramos.push({ texto: texto.slice(inicio, fin), alias: coincidencia[2].toLowerCase() });
    desde = fin;
  }

  if (desde < texto.length) tramos.push({ texto: texto.slice(desde), alias: null });
  return tramos;
}

/**
 * El `@algo` que se está escribiendo justo antes del cursor, si hay uno.
 * `inicio` es la posición de la arroba, para reemplazar desde ahí.
 */
export function consultaEnCurso(
  texto: string,
  cursor: number,
): { inicio: number; consulta: string } | null {
  const coincidencia = /(^|[^\w@.])@([a-z0-9._-]*)$/i.exec(texto.slice(0, cursor));
  if (!coincidencia) return null;
  return {
    inicio: coincidencia.index + coincidencia[1].length,
    consulta: coincidencia[2].toLowerCase(),
  };
}
