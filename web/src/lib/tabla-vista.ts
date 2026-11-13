import type { Columna, Fila, Filtro } from "@/components/Tabla";

export const textoFiltro = (valor: unknown) => String(valor ?? "").trim().replace(/\s+/g, " ");
export const normalizarBusqueda = (valor: unknown) => textoFiltro(valor).toLocaleLowerCase("es").normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Solo se aplican filtros que tienen un control visible en esta tabla. */
export function seleccionVigente(seleccion: Record<string, string[]>, filtros: Filtro[]) {
  return Object.fromEntries(filtros.flatMap(({ clave }) => {
    const valores = [...new Set((seleccion[clave] ?? []).map(textoFiltro).filter(Boolean))];
    return valores.length ? [[clave, valores]] : [];
  }));
}

export function filtrarFilas(filas: Fila[], columnas: Columna[], seleccion: Record<string, string[]>, busqueda: string) {
  const texto = normalizarBusqueda(busqueda);
  return filas.filter((fila) => Object.entries(seleccion).every(([clave, valores]) =>
    valores.includes(textoFiltro(fila[clave]))) && (!texto || columnas.some(({ clave }) =>
    normalizarBusqueda(fila[clave]).includes(texto))));
}

/** Un mismo viaje puede aparecer en varios meses del histórico. */
export function claveFilaTabla(fila: Fila, indice: number) {
  return fila.id == null ? `fila:${indice}` : JSON.stringify([fila.id, fila.mes ?? fila.mesClave ?? null]);
}
