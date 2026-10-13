import type { Fila } from "@/components/Tabla";

const instante = (valor: unknown) => typeof valor === "string" && valor.trim() && Number.isFinite(Date.parse(valor))
  ? Date.parse(valor) : null;

export function horasDevolucion(inicio: unknown, fin: unknown): number | null {
  const desde = instante(inicio);
  const hasta = instante(fin);
  return desde != null && hasta != null && hasta >= desde ? (hasta - desde) / 3_600_000 : null;
}

export function estadoDevuelto(estado: unknown): boolean {
  return String(estado ?? "").trim().toLocaleLowerCase("es") === "devuelto";
}

export function resumenDevoluciones(filas: Fila[]) {
  const tiempos = filas.flatMap((fila) => typeof fila.horasResolucion === "number" ? [fila.horasResolucion] : [])
    .sort((a, b) => a - b);
  const cerradas = filas.filter((fila) => fila.horasResolucion != null).length;
  const devueltosSinFecha = filas.filter((fila) => estadoDevuelto(fila.estado) && fila.horasResolucion == null).length;
  const pendientes = filas.filter((fila) => !estadoDevuelto(fila.estado) && fila.horasResolucion == null);
  const centro = Math.floor(tiempos.length / 2);
  return {
    registros: filas.length,
    paquetes: new Set(filas.map((fila) => fila.id)).size,
    devueltos: filas.filter((fila) => estadoDevuelto(fila.estado)).length,
    cerradas,
    devueltosSinFecha,
    pendientes: pendientes.length,
    demoradas: pendientes.filter((fila) => typeof fila.horasPendiente === "number" && fila.horasPendiente > 72).length,
    promedio: tiempos.length ? tiempos.reduce((total, horas) => total + horas, 0) / tiempos.length : null,
    mediana: tiempos.length ? (tiempos[centro] + tiempos[Math.floor((tiempos.length - 1) / 2)]) / 2 : null,
    dentro48: tiempos.filter((horas) => horas <= 48).length,
  };
}

export function agruparDevoluciones(filas: Fila[], dimension: string) {
  const grupos = new Map<string, Fila[]>();
  for (const fila of filas) {
    const nombre = String(fila[dimension] ?? "").trim() || "Sin dato";
    const grupo = grupos.get(nombre) ?? [];
    grupo.push(fila);
    grupos.set(nombre, grupo);
  }
  return [...grupos].map(([nombre, grupo]) => ({ nombre, ...resumenDevoluciones(grupo) }))
    .sort((a, b) => b.registros - a.registros || a.nombre.localeCompare(b.nombre, "es"));
}

export function duracionDevolucion(horas: number | null): string {
  if (horas == null) return "—";
  if (horas < 24) return `${horas.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
  return `${(horas / 24).toLocaleString("es-AR", { maximumFractionDigits: 1 })} d`;
}
