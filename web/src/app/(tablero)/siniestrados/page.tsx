import { cargarPedidos } from "@/lib/datos";
import { mesesOperativos } from "@/lib/periodos";
import { COLUMNAS_COBRO, siniestradosOperativos } from "@/lib/siniestrados";
import { modoDatos } from "@/lib/config";
import { mesLargo } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { PanelCasos } from "@/components/PanelCasos";
import { ResumenSiniestrados } from "@/components/ResumenSiniestrados";
import { Callout } from "@/components/Card";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Siniestrados" };

export default async function Siniestrados() {
  const { pedidos, campos } = await cargarPedidos();
  const hoy = new Date();
  const periodo = mesesOperativos(hoy).map(mesLargo).join(" y ");
  const filtrados = siniestradosOperativos(pedidos, hoy);

  return (
    <>
      <PageHead
        eyebrow={`Mes en curso · ${periodo}`}
        titulo="Siniestrados"
        flujo="global"
        dek="Casos de Mensual cuyo estado actual es Siniestrado. Hasta el día 9 se incluye el mes anterior; el día 10 pasa a Siniestrados Historial con la rotación habitual."
      />
      <ResumenSiniestrados pedidos={filtrados} />
      {modoDatos() === "supabase" && pedidos.length > 0 && !campos.includes("cobrado") ? (
        <Callout tono="warning" titulo="Falta habilitar los cobros en la base">
          Ejecutá la migración 03 de cobros de siniestrados y actualizá esta pantalla.
          Hasta entonces, el 70% y Cobrado aparecen sin datos y no se pueden editar.
        </Callout>
      ) : null}
      <div className={estilos.stack}>
        <PanelCasos
          id="siniestrados-casos"
          titulo={`Siniestrados · ${periodo}`}
          nota="Valor producto es el importe declarado; Valor al 70% es la bonificación calculada por Supabase. Marcá Cobrado cuando se haya cobrado el siniestro."
          columnasExtra={COLUMNAS_COBRO}
          cobros={modoDatos() === "supabase" && campos.includes("cobrado") ? "mensual" : undefined}
          casos={{ pedidos: filtrados, campos: [...new Set([...campos, "valorProducto" as const])] }}
          vacio="No hay paquetes siniestrados en el período operativo."
        />
      </div>
    </>
  );
}
