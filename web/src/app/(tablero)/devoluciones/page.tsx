import { cargarDevolucionesActuales } from "@/lib/devoluciones-datos";
import { mesEnCurso } from "@/lib/periodos";
import { PageHead } from "@/components/Shell";
import { Callout } from "@/components/Card";
import { PanelDevoluciones } from "@/components/PanelDevoluciones";

export const metadata = { title: "Devoluciones" };

export default async function Devoluciones() {
  const { filas, sinTabla, sinMetricas } = await cargarDevolucionesActuales();
  const actual = mesEnCurso();
  const seleccionadas = filas.filter((fila) => fila.mes.slice(0, 7) === actual);
  return <>
    <PageHead eyebrow="Mes actual" titulo="Devoluciones" flujo="devoluciones" periodo={{ desde: actual, hasta: actual }}
      dek="Paquetes del mes vigente que pasaron por Procesando como devolución, aunque su estado actual haya cambiado." />
    {sinTabla ? <Callout tono="warning" titulo="Falta habilitar Devoluciones">Ejecutá las migraciones 39, 40 y 53 de devoluciones en Supabase.</Callout> : null}
    {sinMetricas ? <Callout tono="warning" titulo="Falta habilitar los tiempos">Ejecutá la migración 40 y actualizá el flujo 17 para cargar la fecha real de Devuelto.</Callout> : null}
    <PanelDevoluciones filas={seleccionadas} />
  </>;
}
