import { cargarDevolucionesHistoricas } from "@/lib/devoluciones-datos";
import { enRango, mesesDisponibles, resolverRango } from "@/lib/periodos";
import { PageHead } from "@/components/Shell";
import { Card, Callout } from "@/components/Card";
import { SelectorMeses } from "@/components/SelectorMeses";
import { PanelDevoluciones } from "@/components/PanelDevoluciones";

export const metadata = { title: "Histórico de devoluciones" };

export default async function DevolucionesHistorial({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { filas, sinTabla, sinMetricas } = await cargarDevolucionesHistoricas();
  const meses = mesesDisponibles(filas.map((fila) => fila.mes.slice(0, 7)));
  const rango = resolverRango(await searchParams, meses);

  if (sinTabla) return <>
    <PageHead eyebrow="Meses cerrados" titulo="Histórico de devoluciones" />
    <Callout tono="warning" titulo="Falta habilitar el histórico">Ejecutá la migración 53 de devoluciones en Supabase.</Callout>
  </>;

  if (!rango) return <>
    <PageHead eyebrow="Meses cerrados" titulo="Histórico de devoluciones" />
    <Callout tono="warning" titulo="Todavía no hay meses cerrados">Al comenzar un mes, el flujo 17 archiva aquí las devoluciones de meses anteriores.</Callout>
  </>;

  const seleccionadas = filas.filter((fila) => enRango(fila.mes.slice(0, 7), rango));
  return <>
    <PageHead eyebrow="Meses cerrados" titulo="Histórico de devoluciones" flujo="devoluciones" periodo={rango}
      dek="Archivo acumulativo de devoluciones. Elegí un mes o un rango para consultar métricas y casos anteriores." />
    {sinMetricas ? <Callout tono="warning" titulo="Falta habilitar los tiempos">Ejecutá la migración 40 y actualizá el flujo 17.</Callout> : null}
    <Card titulo="Período"><SelectorMeses meses={meses} desde={rango.desde} hasta={rango.hasta} /></Card>
    <PanelDevoluciones id="devoluciones-historial" filas={seleccionadas} />
  </>;
}
