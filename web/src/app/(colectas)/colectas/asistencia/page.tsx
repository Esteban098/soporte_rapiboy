import { AsistenciaPanel } from "@/components/AsistenciaPanel";
import { Callout } from "@/components/Card";
import { PageHead } from "@/components/Shell";
import { leerAsistencia } from "@/lib/asistencia-datos";
import { diaDeOperacion } from "@/lib/tracker";
import { TablaFaltante } from "@/lib/supabase";

export const metadata = { title: "Colectas · Asistencia" };

export default async function Asistencia() {
  const hoy = diaDeOperacion();
  const desde = new Date(`${hoy}T12:00:00Z`);
  desde.setUTCFullYear(desde.getUTCFullYear() - 1);

  let datos: Awaited<ReturnType<typeof leerAsistencia>> | null = null;
  let faltaTabla = false;
  try {
    datos = await leerAsistencia(desde.toISOString().slice(0, 10), hoy);
  } catch (error) {
    if (error instanceof TablaFaltante) faltaTabla = true;
    else throw error;
  }

  if (faltaTabla) return <>
      <PageHead eyebrow="Colectas · México" titulo="Asistencia" />
      <Callout tono="warning" titulo="Falta instalar la tabla de asistencia">Corré <code>web/supabase/migracion-27-asistencia.sql</code> en el SQL Editor de Supabase. La pantalla no usa Google Sheets.</Callout>
    </>;

  if (!datos) throw new Error("No se pudieron cargar los datos de asistencia.");
  return <>
    <PageHead eyebrow="Colectas · México" titulo="Asistencia" dek="Votos de los repartidores para la jornada. Se guardan en Supabase por IdMotoboy; las colectas y los sellers no se fuerzan como una relación que no existe." />
    <AsistenciaPanel hoy={hoy} {...datos} />
  </>;
}
