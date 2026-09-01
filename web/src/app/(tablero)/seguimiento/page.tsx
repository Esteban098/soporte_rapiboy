import { BUCKET_SEGUIMIENTO, FIRMA_SEGUNDOS, modoDatos } from "@/lib/config";
import { cargarSeguimientos } from "@/lib/datos";
import { contarPorPersona, resumirSeguimientos } from "@/lib/seguimiento";
import { firmarArchivos } from "@/lib/supabase";
import { numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { TablaSeguimiento } from "@/components/TablaSeguimiento";
import { BarrasSeguimiento } from "@/components/charts/BarrasSeguimiento";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Seguimiento" };

export default async function Seguimiento() {
  const { reportes, sinTabla } = await cargarSeguimientos();
  const datos = resumirSeguimientos(reportes);
  const porPersona = contarPorPersona(reportes);

  // Todos los adjuntos de la página se firman de una sola vez, antes de pintar:
  // el bucket es privado y cada URL vale una hora.
  const rutas = reportes.flatMap((reporte) => reporte.archivos);
  const firmadas = await firmarArchivos(BUCKET_SEGUIMIENTO, rutas, FIRMA_SEGUNDOS);

  return (
    <>
      <PageHead
        eyebrow="Reportes del equipo"
        titulo="Seguimiento"
        dek="Lo que el equipo reporta sobre un caso mientras lo trabaja. Se carga desde la pestaña de abajo a la derecha, en cualquier pantalla del tablero, y queda acá hasta que alguien lo toma y lo cierra."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Reportes"
          valor={numero(datos.total)}
          nota="cargados desde el tablero"
        />
        <Kpi
          etiqueta="Sin tomar"
          valor={numero(datos.abiertos)}
          tono={datos.abiertos > 0 ? "bad" : "good"}
          nota="nadie los está atendiendo todavía"
        />
        <Kpi
          etiqueta="En curso"
          valor={numero(datos.tomados)}
          nota="alguien los tomó y siguen abiertos"
        />
        <Kpi
          etiqueta="Cerrados"
          valor={numero(datos.cerrados)}
          tono="good"
          nota="resueltos y fuera de la cola"
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

        {datos.abiertos > 0 ? (
          <Callout tono="warning" titulo="Hay reportes que nadie tomó">
            {numero(datos.abiertos)} de {numero(datos.total)} siguen en abierto. Un reporte sin
            tomar es alguien que escribió lo que pasó y todavía no sabe si alguien lo leyó:
            tomarlo, aunque no se resuelva en el momento, ya le dice a quien reportó que el caso
            tiene dueño.
          </Callout>
        ) : null}

        <Card
          titulo="Cola de reportes"
          nota="El resumen es lo que devolvió el modelo; el comentario completo está a un clic. El estado se cambia acá mismo, y al tomarlo o cerrarlo queda registrado quién fue."
        >
          <TablaSeguimiento reportes={reportes} urls={Object.fromEntries(firmadas)} />
        </Card>

        <Card
          titulo="Quién atiende qué"
          nota="Casos tomados y cerrados por persona. Muchos tomados y pocos cerrados es trabajo empezado que no termina de cerrarse, que suele ser una señal más útil que el total."
        >
          <BarrasSeguimiento datos={porPersona} />
        </Card>
      </div>
    </>
  );
}
