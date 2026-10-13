import "server-only";
import { cache } from "react";
import { modoDatos } from "./config";
import { consultar, TablaFaltante } from "./supabase";

export type Devolucion = {
  mes: string;
  id: number;
  primera_devolucion: string;
  ultima_devolucion: string;
  fecha_devuelto?: string | null;
  estado: string | null;
  repartidor: string | null;
  tienda: string | null;
  destino: string | null;
  poligono: string | null;
  fecha_programado: string | null;
  visitas: number | null;
  actualizado_en: string;
};

export const cargarDevoluciones = cache(async (): Promise<{ filas: Devolucion[]; sinTabla: boolean; sinMetricas: boolean }> => {
  if (modoDatos() !== "supabase") return { filas: [], sinTabla: false, sinMetricas: false };
  const tabla = process.env.SUPABASE_TABLA_DEVOLUCIONES?.trim() || "devoluciones_mensuales";
  try {
    const filas: Devolucion[] = [];
    for (let offset = 0; ; offset += 1000) {
      const pagina = await consultar<Devolucion>(tabla, {
        select: "*",
        order: "mes.asc,id.asc", limit: "1000", offset: String(offset),
      }, "datos");
      filas.push(...pagina);
      if (pagina.length < 1000) break;
    }
    return { filas, sinTabla: false, sinMetricas: filas.some((fila) => !("fecha_devuelto" in fila)) };
  } catch (error) {
    if (error instanceof TablaFaltante) return { filas: [], sinTabla: true, sinMetricas: false };
    throw error;
  }
});
