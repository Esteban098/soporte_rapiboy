import type { Fila } from "@/components/Tabla";
export { duracionHoras as duracionDevolucion } from "./formato";

const instante = (valor: unknown) => typeof valor === "string" && valor.trim() && Number.isFinite(Date.parse(valor))
  ? Date.parse(valor) : null;

const DIA = 86_400_000;
const relojMexico = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function partesMexico(momento: number) {
  const partes = Object.fromEntries(relojMexico.formatToParts(momento).map((parte) => [parte.type, parte.value]));
  return { calendario: Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)),
    reloj: Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute), Number(partes.second)) };
}

function medianocheMexico(calendario: number) {
  let momento = calendario;
  for (let ajuste = 0; ajuste < 2; ajuste++) momento += calendario - partesMexico(momento).reloj;
  return momento;
}

export function horasDevolucion(inicio: unknown, fin: unknown): number | null {
  const desde = instante(inicio);
  const hasta = instante(fin);
  if (desde == null || hasta == null || hasta < desde) return null;
  const primerDia = partesMexico(desde).calendario;
  let domingo = primerDia - new Date(primerDia).getUTCDay() * DIA;
  let laborables = hasta - desde;
  while (medianocheMexico(domingo) < hasta) {
    const inicioDomingo = medianocheMexico(domingo);
    const finDomingo = medianocheMexico(domingo + DIA);
    laborables -= Math.max(0, Math.min(hasta, finDomingo) - Math.max(desde, inicioDomingo));
    domingo += 7 * DIA;
  }
  return laborables / 3_600_000;
}

/** Cantidades de cierres por fecha de México, sin domingos ni IDs repetidos. */
export function devolucionesPorDia(filas: Fila[]) {
  const dias = new Map<string, number>();
  const vistos = new Set<string>();
  const semana = Array.from({ length: 6 }, (_, indice) => ({
    nombre: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][indice], cantidad: 0,
  }));
  let domingos = 0;
  for (const fila of filas) {
    const cierre = instante(fila.fechaDevueltoISO);
    if (cierre == null) continue;
    const calendario = partesMexico(cierre).calendario;
    const dia = new Date(calendario).toISOString().slice(0, 10);
    const clave = `${fila.id}:${dia}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const indice = new Date(calendario).getUTCDay();
    if (indice === 0) { domingos++; continue; }
    dias.set(dia, (dias.get(dia) ?? 0) + 1);
    semana[indice - 1].cantidad++;
  }
  return {
    fechas: [...dias].map(([dia, cantidad]) => ({ dia, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad || b.dia.localeCompare(a.dia)),
    semana, domingos,
  };
}

export function estadoDevuelto(estado: unknown): boolean {
  return String(estado ?? "").trim().toLocaleLowerCase("es") === "devuelto";
}

function estadoResueltoDevolucion(estado: unknown): boolean {
  return ["entregado", "devuelto"].includes(String(estado ?? "").trim().toLocaleLowerCase("es"));
}

export function horasPendientesDevolucion(inicio: unknown, estado: unknown, devuelto: unknown, ahora: unknown): number | null {
  return devuelto || estadoResueltoDevolucion(estado) ? null : horasDevolucion(inicio, ahora);
}

export function resumenDevoluciones(filas: Fila[]) {
  const tiempos = filas.flatMap((fila) => typeof fila.horasResolucion === "number" ? [fila.horasResolucion] : []);
  const cerradas = filas.filter((fila) => fila.horasResolucion != null).length;
  const devueltosSinFecha = filas.filter((fila) => estadoDevuelto(fila.estado) && fila.horasResolucion == null).length;
  const pendientes = filas.filter((fila) => !estadoResueltoDevolucion(fila.estado) && fila.horasResolucion == null);
  return {
    registros: filas.length,
    paquetes: new Set(filas.map((fila) => fila.id)).size,
    devueltos: filas.filter((fila) => estadoDevuelto(fila.estado)).length,
    cerradas,
    devueltosSinFecha,
    pendientes: pendientes.length,
    demoradas: pendientes.filter((fila) => typeof fila.horasPendiente === "number" && fila.horasPendiente > 72).length,
    promedio: tiempos.length ? tiempos.reduce((total, horas) => total + horas, 0) / tiempos.length : null,
    dentro72: tiempos.filter((horas) => horas <= 72).length,
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
