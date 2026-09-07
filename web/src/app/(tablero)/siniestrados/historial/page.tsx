import { cargarPedidosHistoricos } from "@/lib/datos";
import { mesesDisponibles, resolverRango } from "@/lib/periodos";
import { COLUMNAS_COBRO, siniestradosHistoricos } from "@/lib/siniestrados";
import { modoDatos } from "@/lib/config";
import { mesCorto, mesLargo } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card } from "@/components/Card";
import { PanelCasos } from "@/components/PanelCasos";
import { ResumenSiniestrados } from "@/components/ResumenSiniestrados";
import { SelectorMeses } from "@/components/SelectorMeses";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Siniestrados Historial" };

export default async function SiniestradosHistorial({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { pedidos, campos } = await cargarPedidosHistoricos();
  // Ofrece también meses sin siniestros: un refresco puede cambiar sus estados.
  const disponibles = mesesDisponibles(pedidos.map((pedido) => pedido.mes));
  const rango = resolverRango(await searchParams, disponibles);

  if (!rango) {
    return (
      <>
        <PageHead eyebrow="Meses cerrados" titulo="Siniestrados Historial" />
        <Callout tono="warning" titulo="Todavía no hay meses cargados">
          La rotación del día 10 mueve los períodos cerrados de Mensual a Histórico.
          Sus casos siniestrados aparecerán aquí sin volver a cargarlos.
        </Callout>
      </>
    );
  }

  const filtrados = siniestradosHistoricos(pedidos, rango);
  const periodo = rango.desde === rango.hasta
    ? mesLargo(rango.desde)
    : `${mesCorto(rango.desde)} – ${mesCorto(rango.hasta)}`;

  return (
    <>
      <PageHead
        eyebrow={`Meses cerrados · ${periodo}`}
        titulo="Siniestrados Historial"
        flujo="historico"
        periodo={rango}
        dek="Casos históricos cuyo estado actual es Siniestrado. Actualizar relee los estados y valores del período seleccionado, sin cambiar el mes de creación."
      />
      <Card titulo="Período" nota="Elegí un mes o un rango del Histórico.">
        <SelectorMeses meses={disponibles} desde={rango.desde} hasta={rango.hasta} />
      </Card>
      <ResumenSiniestrados pedidos={filtrados} />
      {modoDatos() === "supabase" && !campos.includes("cobrado") ? (
        <Callout tono="warning" titulo="Falta habilitar los cobros en la base">
          Ejecutá la migración 03 de cobros de siniestrados y actualizá esta pantalla.
          Hasta entonces, el 70% y Cobrado aparecen sin datos y no se pueden editar.
        </Callout>
      ) : null}
      <div className={estilos.stack}>
        <PanelCasos
          id="siniestrados-historial-casos"
          titulo={`Siniestrados históricos · ${periodo}`}
          nota="Valor producto es el importe declarado; Valor al 70% es la bonificación. La lista refleja el estado vigente y puede cambiar al actualizar el período."
          columnasExtra={COLUMNAS_COBRO}
          cobros={modoDatos() === "supabase" && campos.includes("cobrado") ? "historico" : undefined}
          casos={{ pedidos: filtrados, campos: [...new Set([...campos, "valorProducto" as const])] }}
          vacio="No hay paquetes siniestrados en el período seleccionado."
        />
      </div>
    </>
  );
}
