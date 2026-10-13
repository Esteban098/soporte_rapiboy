import "server-only";
import { cache } from "react";
import { modoDatos } from "./config";
import { consultar, TablaFaltante } from "./supabase";

export type Devolucion = {
  mes: string;
  id: number;
  primera_devolucion: string;
  ultima_devolucion: string;
  estado: string | null;
  repartidor: string | null;
  tienda: string | null;
  destino: string | null;
  poligono: string | null;
  fecha_programado: string | null;
  visitas: number | null;
  actualizado_en: string;
};

export const cargarDevoluciones = cache(async (): Promise<{ filas: Devolucion[]; sinTabla: boolean }> => {
  if (modoDatos() !== "supabase") return { filas: [], sinTabla: false };
  const tabla = process.env.SUPABASE_TABLA_DEVOLUCIONES?.trim() || "devoluciones_mensuales";
  try {
    const filas: Devolucion[] = [];
    for (let offset = 0; ; offset += 1000) {
      const pagina = await consultar<Devolucion>(tabla, {
        select: "mes,id,primera_devolucion,ultima_devolucion,estado,repartidor,tienda,destino,poligono,fecha_programado,visitas,actualizado_en",
        order: "mes.asc,id.asc", limit: "1000", offset: String(offset),
      }, "datos");
      filas.push(...pagina);
      if (pagina.length < 1000) break;
    }
    return { filas, sinTabla: false };
  } catch (error) {
    if (error instanceof TablaFaltante) return { filas: [], sinTabla: true };
    throw error;
  }
});
