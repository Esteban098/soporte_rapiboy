import "server-only";
import Papa from "papaparse";
import fs from "node:fs/promises";
import path from "node:path";
import { REVALIDAR_SEGUNDOS, modoDatos, sheetId } from "./config";

/**
 * Lee una pestaña del Google Sheet como CSV.
 *
 * Se usa el endpoint gviz porque permite pedir la pestaña por nombre, sin tener
 * que averiguar el gid de cada una. Requiere que el documento esté compartido
 * como "cualquiera con el enlace puede ver".
 */
function urlDeTab(tab: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId()}/gviz/tq`;
  return `${base}?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

async function leerCrudo(tab: string): Promise<string> {
  if (modoDatos() === "fixture") {
    const archivo = path.join(process.cwd(), "fixtures", `${tab}.csv`);
    return fs.readFile(archivo, "utf8");
  }

  const respuesta = await fetch(urlDeTab(tab), {
    next: { revalidate: REVALIDAR_SEGUNDOS, tags: ["sheet"] },
  });

  if (!respuesta.ok) {
    throw new Error(
      `No se pudo leer la pestaña "${tab}" (HTTP ${respuesta.status}). ` +
        `Revisá que el documento esté compartido con enlace de lectura y que la pestaña exista.`,
    );
  }
  return respuesta.text();
}

/** Devuelve las filas de una pestaña como objetos, con los encabezados como claves. */
export async function leerTab(tab: string): Promise<Record<string, string>[]> {
  const texto = await leerCrudo(tab);
  const { data, errors } = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/\s+/g, " ").trim(),
  });

  // Papa reporta filas sueltas mal formadas; el libro tiene varias por las
  // fórmulas arrastradas. Solo cortamos si falló el archivo entero.
  if (errors.length > 0 && errors.length === data.length) {
    throw new Error(`La pestaña "${tab}" no se pudo parsear como CSV`);
  }
  return data;
}
