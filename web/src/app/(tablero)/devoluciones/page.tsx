import { cargarDevoluciones } from "@/lib/devoluciones-datos";
import { enRango, esMesValido, mesEnCurso, mesesDisponibles, resolverRango } from "@/lib/periodos";
import { PageHead } from "@/components/Shell";
import { Card, Callout } from "@/components/Card";
import type { Columna } from "@/components/Tabla";
import { SelectorMeses } from "@/components/SelectorMeses";
import { MetricasDevoluciones } from "@/components/MetricasDevoluciones";
import { horasDevolucion, estadoDevuelto } from "@/lib/devoluciones-metricas";

export const metadata = { title: "Devoluciones" };

const columnas: Columna[] = [
  { clave: "id", titulo: "Viaje", tipo: "viaje" },
  { clave: "primera", titulo: "Primera devolución" },
  { clave: "ultima", titulo: "Última devolución" },
  { clave: "devuelto", titulo: "Fecha Devuelto" },
  { clave: "horasResolucion", titulo: "Tiempo hasta Devuelto (h)", tipo: "decimal" },
  { clave: "horasPendiente", titulo: "Horas pendientes", tipo: "decimal" },
  { clave: "estado", titulo: "Estado actual", tipo: "estado" },
  { clave: "repartidor", titulo: "Driver" },
  { clave: "tienda", titulo: "Seller", tipo: "tienda" },
  { clave: "poligono", titulo: "Polígono" },
  { clave: "destino", titulo: "Destino" },
  { clave: "mes", titulo: "Mes" },
];

function fecha(valor: string | null | undefined) {
  if (!valor) return "—";
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short",
  }).format(fecha) + " hs arg";
}

export default async function Devoluciones({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { filas, sinTabla, sinMetricas } = await cargarDevoluciones();
  const pedido = await searchParams;
  const actual = mesEnCurso();
  const meses = mesesDisponibles([
    actual, ...filas.map((fila) => fila.mes.slice(0, 7)),
    ...(esMesValido(pedido.desde) ? [pedido.desde] : []),
    ...(esMesValido(pedido.hasta) ? [pedido.hasta] : []),
  ]);
  const rango = resolverRango({ desde: pedido.desde ?? actual, hasta: pedido.hasta ?? pedido.desde ?? actual }, meses)!;
  const seleccionadas = filas.filter((fila) => enRango(fila.mes.slice(0, 7), rango));
  const ahora = new Date().toISOString();
  return <>
    <PageHead eyebrow="Registro mensual" titulo="Devoluciones" flujo="devoluciones" periodo={rango}
      dek="Paquetes que pasaron por Procesando como devolución, aunque su estado actual haya cambiado." />
    {sinTabla ? <Callout tono="warning" titulo="Falta habilitar Devoluciones">Ejecutá la migración 39 de devoluciones en Supabase.</Callout> : null}
    {sinMetricas ? <Callout tono="warning" titulo="Falta habilitar los tiempos">Ejecutá la migración 40 y actualizá el flujo 17 para cargar la fecha real de Devuelto.</Callout> : null}
    <Card titulo="Período"><SelectorMeses meses={meses} desde={rango.desde} hasta={rango.hasta} /></Card>
      <MetricasDevoluciones columnas={columnas}
        filtros={[{ clave: "estado", etiqueta: "Estado" }, { clave: "repartidor", etiqueta: "Driver" }, { clave: "tienda", etiqueta: "Seller" }]}
        filas={seleccionadas.map((fila) => ({
          id: fila.id, primera: fecha(fila.primera_devolucion), ultima: fecha(fila.ultima_devolucion),
          devuelto: fecha(fila.fecha_devuelto),
          horasResolucion: horasDevolucion(fila.primera_devolucion, fila.fecha_devuelto),
          horasPendiente: !fila.fecha_devuelto && !estadoDevuelto(fila.estado) ? horasDevolucion(fila.primera_devolucion, ahora) : null,
          estado: fila.estado, repartidor: fila.repartidor, tienda: fila.tienda,
          poligono: fila.poligono, destino: fila.destino, mes: fila.mes.slice(0, 7),
        }))} />
  </>;
}
