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

/**
 * Devuelve las filas de una pestaña como arreglos de celdas, sin interpretar la
 * primera fila como encabezado.
 *
 * Es a propósito: los encabezados de este libro no son confiables. `Junio` no
 * tiene fila de encabezado, el de `Sep` es un bloque de HTML pegado desde
 * WhatsApp, y varios traen saltos de línea en el medio. Las nueve primeras
 * columnas, en cambio, están siempre en el mismo orden, así que se lee por
 * posición y se descarta la fila de encabezado cuando aparece.
 */
export async function leerFilas(tab: string): Promise<string[][]> {
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

/**
 * Ubica las columnas de una pestaña por nombre de encabezado.
 *
 * Solo se usa para `Cancelados`, donde las columnas útiles están intercaladas
 * con auxiliares y la posición no alcanza. Devuelve el índice de cada nombre
 * pedido, o -1 si no está.
 */
export function indicesPorNombre(encabezado: string[], nombres: string[]): number[] {
  const normalizado = encabezado.map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
  return nombres.map((nombre) => normalizado.indexOf(nombre.toLowerCase()));
}
