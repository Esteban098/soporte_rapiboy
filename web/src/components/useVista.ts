"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  guardarEfimero,
  guardarPreferencia,
  leerEfimero,
  leerPreferencia,
  parsearFiltros,
  sinPreferencias,
  suscribirPreferencias,
} from "@/lib/preferencias";
import type { Columna, Fila, Filtro } from "./Tabla";

/**
 * Filtrado compartido entre una tabla y sus gráficos.
 *
 * Los dos llaman a este hook con el mismo `id`, y el estado vive en el store de
 * preferencias, que avisa a todos sus suscriptores cuando algo cambia. Por eso
 * el gráfico se recalcula al tocar un filtro de la tabla sin que haga falta un
 * contexto que los envuelva ni pasar props entre medio.
 */
export function useVista({
  id,
  filas,
  columnas,
  filtros,
}: {
  id: string;
  filas: Fila[];
  columnas: Columna[];
  filtros: Filtro[];
}) {
  const filtrosCrudos = useSyncExternalStore(
    suscribirPreferencias,
    () => leerPreferencia(id, "filtros"),
    sinPreferencias,
  );
  const seleccion = useMemo(() => parsearFiltros(filtrosCrudos), [filtrosCrudos]);

  const busqueda = useSyncExternalStore(
    suscribirPreferencias,
    () => leerEfimero(id, "busqueda"),
    sinPreferencias,
  );

  const opcionesPorFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    for (const filtro of filtros) {
      const opciones =
        filtro.opciones ??
        [...new Set(filas.map((f) => String(f[filtro.clave] ?? "")).filter(Boolean))].sort();

      // Un filtro guardado puede apuntar a un valor que hoy no está en los
      // datos. Se agrega igual para que se vea qué está filtrando y se pueda
      // sacar, en vez de dejar la tabla vacía sin explicación.
      const guardados = seleccion[filtro.clave] ?? [];
      const faltantes = guardados.filter((v) => !opciones.includes(v));
      mapa[filtro.clave] = faltantes.length > 0 ? [...opciones, ...faltantes] : opciones;
    }
    return mapa;
  }, [filtros, filas, seleccion]);

  const filtradas = useMemo(() => {
    const activos = Object.entries(seleccion);
    const texto = normalizar(busqueda);

    return filas.filter((fila) => {
      for (const [clave, valores] of activos) {
        if (!valores.includes(String(fila[clave] ?? ""))) return false;
      }
      if (!texto) return true;
      return columnas.some((columna) =>
        normalizar(String(fila[columna.clave] ?? "")).includes(texto),
      );
    });
  }, [filas, seleccion, busqueda, columnas]);

  function alternarValor(clave: string, valor: string) {
    const actuales = seleccion[clave] ?? [];
    const proximos = actuales.includes(valor)
      ? actuales.filter((v) => v !== valor)
      : [...actuales, valor];

    const proximo = { ...seleccion };
    if (proximos.length === 0) delete proximo[clave];
    else proximo[clave] = proximos;
    guardarPreferencia(id, "filtros", proximo);
  }

  function limpiarFiltro(clave: string) {
    const proximo = { ...seleccion };
    delete proximo[clave];
    guardarPreferencia(id, "filtros", proximo);
  }

  function limpiarTodo() {
    guardarPreferencia(id, "filtros", {});
    guardarEfimero(id, "busqueda", "");
  }

  return {
    seleccion,
    busqueda,
    setBusqueda: (valor: string) => guardarEfimero(id, "busqueda", valor),
    opcionesPorFiltro,
    filtradas,
    alternarValor,
    limpiarFiltro,
    limpiarTodo,
    hayFiltros: Object.keys(seleccion).length > 0 || busqueda !== "",
  };
}

/** Compara sin acentos ni mayúsculas, que es como busca la gente. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
