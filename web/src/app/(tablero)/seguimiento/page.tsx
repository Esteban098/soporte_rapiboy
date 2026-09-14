import { BUCKET_SEGUIMIENTO, FIRMA_SEGUNDOS, modoDatos } from "@/lib/config";
import { cargarSeguimientos } from "@/lib/datos";
import { operadorActual } from "@/lib/sesion";
import { firmarArchivos } from "@/lib/supabase";
import { PageHead } from "@/components/Shell";
import { Callout } from "@/components/Card";
import { TableroSeguimiento } from "@/components/TableroSeguimiento";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Seguimiento" };

export default async function Seguimiento({
  searchParams,
}: {
  /** `?reporte=<id>`: lo usa la campana para abrir el reporte que te menciona. */
  searchParams: Promise<{ reporte?: string | string[] }>;
}) {
  const [{ reportes, sinTabla }, operador, parametros] = await Promise.all([
    cargarSeguimientos(),
    operadorActual(),
    searchParams,
  ]);
  const foco = typeof parametros.reporte === "string" ? parametros.reporte : null;

  // Todos los adjuntos de la página se firman de una sola vez, antes de pintar:
  // el bucket es privado y cada URL vale una hora.
  const rutas = reportes.flatMap((reporte) => reporte.archivos);
  const firmadas = await firmarArchivos(BUCKET_SEGUIMIENTO, rutas, FIRMA_SEGUNDOS);

  return (
    <>
      <PageHead
        eyebrow="Reportes del equipo"
        titulo="Seguimiento"
        dek="Tomá un caso para que se sepa quién lo está trabajando. Un tomado sigue contando como abierto hasta que alguien lo cierra."
      />

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

        <TableroSeguimiento
          reportes={reportes}
          urls={Object.fromEntries(firmadas)}
          yo={operador?.email ?? null}
          admin={operador?.rol === "admin"}
          foco={foco}
        />

        {foco && !reportes.some((reporte) => reporte.id === foco) ? (
          <Callout titulo="Ese reporte ya no está">
            La notificación apunta a un reporte que fue borrado o que quedó fuera de los últimos
            500.
          </Callout>
        ) : null}
      </div>
    </>
  );
}
