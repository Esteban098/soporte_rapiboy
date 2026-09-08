import { BUCKET_SEGUIMIENTO, FIRMA_SEGUNDOS, modoDatos } from "@/lib/config";
import { cargarSeguimientos } from "@/lib/datos";
import { resumirSeguimientos } from "@/lib/seguimiento";
import { firmarArchivos } from "@/lib/supabase";
import { duracion, numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { TablaSeguimiento } from "@/components/TablaSeguimiento";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Seguimiento" };

export default async function Seguimiento() {
  const { reportes, sinTabla } = await cargarSeguimientos();
  const datos = resumirSeguimientos(reportes);

  // Todos los adjuntos de la página se firman de una sola vez, antes de pintar:
  // el bucket es privado y cada URL vale una hora.
  const rutas = reportes.flatMap((reporte) => reporte.archivos);
  const firmadas = await firmarArchivos(BUCKET_SEGUIMIENTO, rutas, FIRMA_SEGUNDOS);

  return (
    <>
      <PageHead
        eyebrow="Reportes del equipo"
        titulo="Seguimiento"
        dek="Lo que el equipo reporta sobre un caso mientras lo trabaja. La cola abre con los pendientes y los separa por semana para que sea fácil ver qué quedó atrás."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Reportes"
          valor={numero(datos.total)}
          nota="cargados desde el tablero"
        />
        <Kpi
          etiqueta="Abiertos"
          valor={numero(datos.abiertos)}
          tono="bad"
          relleno
          nota="pendientes en la cola"
        />
        <Kpi
          etiqueta="Cerrados"
          valor={numero(datos.cerrados)}
          tono="good"
          relleno
          nota="resueltos y fuera de la cola"
        />
        <Kpi
          etiqueta="Resolución promedio"
          valor={duracion(datos.resolucionPromedioMinutos)}
          nota="desde la última apertura al cierre"
        />
      </div>

      <div className={estilos.stack}>
        {sinTabla ? (
          <Callout tono="critical" titulo="Falta crear la tabla">
            La base todavía no tiene <code>seguimiento</code>. Está el script listo en{" "}
            <code>web/supabase/seguimiento.sql</code>: se pega entero en el SQL Editor de Supabase
            y se corre una vez. Crea la tabla, sus índices y el bucket privado de adjuntos.
          </Callout>
        ) : null}

        {modoDatos() !== "supabase" ? (
          <Callout tono="critical" titulo="El tablero no está leyendo la base">
            Los reportes se guardan en Supabase y ahora mismo la fuente de datos es otra, así que
            esta sección queda vacía y la pestaña de carga no aparece. Vuelve sola al configurar
            SUPABASE_URL y SUPABASE_SERVICE_KEY, o sacando ORIGEN_DATOS.
          </Callout>
        ) : null}

        <Card
          titulo="Cola de reportes"
          nota="Abre mostrando los casos abiertos y los agrupa de lunes a domingo. El estado se cambia acá mismo; al cerrarlo queda registrado quién fue."
        >
          <TablaSeguimiento reportes={reportes} urls={Object.fromEntries(firmadas)} />
        </Card>
      </div>
    </>
  );
}
