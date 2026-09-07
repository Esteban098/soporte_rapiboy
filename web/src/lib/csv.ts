import "server-only";
import Papa from "papaparse";
import fs from "node:fs/promises";
import path from "node:path";
import {
  REVALIDAR_SEGUNDOS,
  TABLA_AYER,
  TABLA_CANCELADOS,
  TABLA_MENSUAL,
  TAB_AYER,
  TAB_CANCELADOS,
  TAB_MENSUAL,
  gidDeTab,
  modoDatos,
  sheetId,
} from "./config";
import { leerTabla } from "./supabase";

export type Vista = "mensual" | "ayer" | "cancelados";

/**
 * `/export` conserva texto y números mezclados en una columna; `gviz` puede
 * descartar valores al inferir tipos. Requiere una hoja con enlace de lectura.
 */
function urlDeTab(tab: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId()}/export`;
  return `${base}?format=csv&gid=${encodeURIComponent(gidDeTab(tab))}`;
}

async function leerCrudo(tab: string): Promise<string> {
  if (modoDatos() === "fixture") {
    const archivo = path.join(process.cwd(), "fixtures", `${tab}.csv`);
    return fs.readFile(archivo, "utf8");
  }

  const respuesta = await fetch(urlDeTab(tab), {
    next: { revalidate: REVALIDAR_SEGUNDOS, tags: ["datos"] },
  });

  if (!respuesta.ok) {
    throw new Error(
      `No se pudo leer la pestaña "${tab}" (HTTP ${respuesta.status}). ` +
        `Revisá que el documento esté compartido con enlace de lectura y que el gid siga siendo válido.`,
    );
  }
  return respuesta.text();
}

/** Cómo se llama cada vista en el libro y en la base. */
const TAB: Record<Vista, string> = {
  mensual: TAB_MENSUAL,
  ayer: TAB_AYER,
  cancelados: TAB_CANCELADOS,
};
const TABLA: Record<Vista, string> = {
  mensual: TABLA_MENSUAL,
  ayer: TABLA_AYER,
  cancelados: TABLA_CANCELADOS,
};

/**
 * Unifica las fuentes como filas de celdas, con el encabezado primero.
 */
export async function leerFilas(vista: Vista): Promise<string[][]> {
  if (modoDatos() === "supabase") return leerTabla(TABLA[vista]);

  const tab = TAB[vista];
  const texto = await leerCrudo(tab);
  const { data, errors } = Papa.parse<string[]>(texto, {
    header: false,
    skipEmptyLines: "greedy",
  });

  // Papa reporta filas sueltas mal formadas; el libro tiene varias por las
  // fórmulas arrastradas. Solo cortamos si falló el archivo entero.
  if (errors.length > 0 && errors.length === data.length) {
    throw new Error(`La pestaña "${tab}" no se pudo parsear como CSV`);
  }
  return data.map((fila) => fila.map((celda) => (celda ?? "").replace(/\s+/g, " ").trim()));
}
