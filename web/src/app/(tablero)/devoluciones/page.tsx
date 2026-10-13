import { cargarDevoluciones } from "@/lib/devoluciones-datos";
import { enRango, esMesValido, mesEnCurso, mesesDisponibles, resolverRango } from "@/lib/periodos";
import { PageHead } from "@/components/Shell";
import { Card, Callout, Kpi } from "@/components/Card";
import { Tabla, type Columna } from "@/components/Tabla";
import { SelectorMeses } from "@/components/SelectorMeses";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Devoluciones" };

const columnas: Columna[] = [
  { clave: "id", titulo: "Viaje", tipo: "viaje" },
  { clave: "primera", titulo: "Primera devolución" },
  { clave: "ultima", titulo: "Última devolución" },
  { clave: "estado", titulo: "Estado actual", tipo: "estado" },
  { clave: "repartidor", titulo: "Driver" },
  { clave: "tienda", titulo: "Seller", tipo: "tienda" },
  { clave: "poligono", titulo: "Polígono" },
  { clave: "destino", titulo: "Destino" },
  { clave: "mes", titulo: "Mes" },
];

function fecha(valor: string) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short",
  }).format(fecha) + " hs arg";
}

export default async function Devoluciones({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { filas, sinTabla } = await cargarDevoluciones();
  const pedido = await searchParams;
  const actual = mesEnCurso();
  const meses = mesesDisponibles([
    actual, ...filas.map((fila) => fila.mes.slice(0, 7)),
    ...(esMesValido(pedido.desde) ? [pedido.desde] : []),
    ...(esMesValido(pedido.hasta) ? [pedido.hasta] : []),
  ]);
  const rango = resolverRango({ desde: pedido.desde ?? actual, hasta: pedido.hasta ?? pedido.desde ?? actual }, meses)!;
  const seleccionadas = filas.filter((fila) => enRango(fila.mes.slice(0, 7), rango));
  return <>
    <PageHead eyebrow="Registro mensual" titulo="Devoluciones" flujo="devoluciones" periodo={rango}
      dek="Paquetes que pasaron por Procesando como devolución, aunque su estado actual haya cambiado." />
    {sinTabla ? <Callout tono="warning" titulo="Falta habilitar Devoluciones">Ejecutá la migración 39 de devoluciones en Supabase.</Callout> : null}
    <Card titulo="Período"><SelectorMeses meses={meses} desde={rango.desde} hasta={rango.hasta} /></Card>
    <div className={estilos.kpis}>
      <Kpi etiqueta="Paquetes únicos" valor={String(new Set(seleccionadas.map((fila) => fila.id)).size)} />
      <Kpi etiqueta="Sellers" valor={String(new Set(seleccionadas.map((fila) => fila.tienda).filter(Boolean)).size)} />
      <Kpi etiqueta="Drivers" valor={String(new Set(seleccionadas.map((fila) => fila.repartidor).filter(Boolean)).size)} />
    </div>
    <Card titulo="Procesando como devolución" nota="El mes corresponde al movimiento de devolución. Cada paquete aparece una vez por mes.">
      <Tabla id="devoluciones-mensuales" columnas={columnas}
        filtros={[{ clave: "estado", etiqueta: "Estado" }, { clave: "repartidor", etiqueta: "Driver" }, { clave: "tienda", etiqueta: "Seller" }]}
        ordenInicial={{ clave: "id", asc: false }}
        filas={seleccionadas.map((fila) => ({
          id: fila.id, primera: fecha(fila.primera_devolucion), ultima: fecha(fila.ultima_devolucion),
          estado: fila.estado, repartidor: fila.repartidor, tienda: fila.tienda,
          poligono: fila.poligono, destino: fila.destino, mes: fila.mes.slice(0, 7),
        }))} vacio="No hay devoluciones cargadas para este período." />
    </Card>
  </>;
}
