import { Callout, Kpi } from "@/components/Card";
import { PanelEvidencias } from "@/components/PanelEvidencias";
import { PageHead } from "@/components/Shell";
import estilos from "@/components/ui.module.css";
import { modoDatos } from "@/lib/config";
import { cargarPanelEvidencias } from "@/lib/evidencias";
import { esAdmin } from "@/lib/sesion";
import { TablaFaltante } from "@/lib/supabase";

export const metadata = { title: "Evidencias de entrega" };

export default async function Evidencias() {
  if (modoDatos() !== "supabase") return <Callout tono="warning" titulo="Se necesita Supabase">Esta revisión solo funciona con la base activa.</Callout>;
  let panel;
  let admin;
  try {
    [panel, admin] = await Promise.all([cargarPanelEvidencias(), esAdmin()]);
  } catch (error) {
    if (error instanceof TablaFaltante) return <Callout tono="warning" titulo="Falta instalar la migración">Ejecutá <code>web/supabase/migracion-38-evidencias-entrega.sql</code>.</Callout>;
    throw error;
  }
  const sinDriver = panel.pendientesHoy.filter((p) => p.idMotoboy == null).length;
  return <>
    <PageHead eyebrow="Operación México · control de evidencias" titulo="Evidencias de entrega" dek="Revisión asistida de fotografías. El modelo señala falta de contexto o problemas visuales; soporte toma la decisión final." />
    <div className={estilos.kpis}>
      <Kpi etiqueta="Pendientes de hoy" valor={String(panel.pendientesHoy.length)} nota="requieren decisión humana" tono={panel.pendientesHoy.length ? "warning" : "neutral"} />
      <Kpi etiqueta="Anteriores" valor={String(panel.pendientesAnteriores.length)} nota="ocultos hasta abrir el desplegable" tono={panel.pendientesAnteriores.length ? "warning" : "neutral"} />
      <Kpi etiqueta="Driver sin resolver" valor={String(sinDriver)} nota="no entra al score" tono={sinDriver ? "warning" : "neutral"} />
      <Kpi etiqueta="Modo" valor={panel.config.modo === "OBSERVACION" ? "Observación" : "Activo"} nota="alertas y score según configuración" />
    </div>
    <PanelEvidencias pendientesHoy={panel.pendientesHoy} pendientesAnteriores={panel.pendientesAnteriores} revisadasRecientes={panel.revisadasRecientes} scores={panel.scores} config={panel.config} admin={admin} />
  </>;
}
