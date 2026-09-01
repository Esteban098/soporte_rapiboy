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

/**
 * Las vistas del tablero. Se nombran así, y no por pestaña ni por tabla, porque
 * cada origen las llama distinto: en el libro son las pestañas `Mensual`, `Ayer`
 * y `Cancelados`, y en la base las tablas en minúscula.
 */
export type Vista = "mensual" | "ayer" | "cancelados";

/**
 * Lee una pestaña del Google Sheet como CSV.
 *
 * Se usa `/export` y NO el endpoint `gviz`, aunque gviz sea más cómodo porque
 * acepta el nombre de la pestaña: gviz le asigna un tipo a cada columna mirando
 * los datos, y descarta en silencio toda celda que no encaje. La columna
 * TELEFONO tiene números en la mayoría de las filas, así que gviz la marca como
 * numérica y devuelve vacías las que traen texto —"confirmar si pueden recibir
 * después del horario de cierre" y demás indicaciones—. Eran 52 casos que en el
 * tablero figuraban sin datos y en la planilla estaban completos.
 *
 * `/export` devuelve lo que la celda muestra, sin interpretar nada. Requiere que
 * el documento esté compartido como "cualquiera con el enlace puede ver".
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
 * Devuelve las filas de una vista como arreglos de celdas, con el encabezado
 * primero, venga de la base o del libro.
 *
 * Los dos orígenes entregan la misma forma para que el resto de la app no sepa
 * de dónde salieron los datos: se migra cambiando variables de entorno, y se
 * puede volver atrás igual de rápido si la base falla.
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
