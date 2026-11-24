import { cargarPedidos } from "@/lib/datos";
import { mesesOperativos } from "@/lib/periodos";
import { COLUMNAS_COBRO, COLUMNAS_INICIALES_SINIESTRADOS, TITULOS_COLUMNAS_SINIESTRADOS, siniestradosOperativos } from "@/lib/siniestrados";
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
      {modoDatos() === "supabase" && pedidos.length > 0 && (!campos.includes("cobrado") || !campos.includes("siniestroAvisado")) ? (
        <Callout tono="warning" titulo="Falta habilitar la gestión de siniestros en la base">
          Ejecutá las migraciones 03 y 56 y actualizá esta pantalla.
          Hasta entonces, Avisado o Cobrado pueden aparecer sin datos y no se pueden editar.
        </Callout>
      ) : null}
      <div className={estilos.stack}>
        <PanelCasos
          editable
          id="siniestrados-casos-v2"
          titulo={`Siniestrados · ${periodo}`}
          nota="Monto es el importe declarado y Monto 70% es la bonificación calculada. El circuito válido es pendiente → avisado → cobrado."
          columnasExtra={COLUMNAS_COBRO}
          cobros={modoDatos() === "supabase" && campos.includes("cobrado") && campos.includes("siniestroAvisado") ? "mensual" : undefined}
          dimensionInicial="repartidor"
          tablaDebajo
          compacta
          columnasIniciales={COLUMNAS_INICIALES_SINIESTRADOS}
          titulosColumnas={TITULOS_COLUMNAS_SINIESTRADOS}
          casos={{ pedidos: filtrados, campos: [...new Set([...campos, "valorProducto" as const])] }}
          vacio="No hay paquetes siniestrados en el período operativo."
        />
      </div>
    </>
  );
}
