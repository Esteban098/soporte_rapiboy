import { PageHead } from "@/components/Shell";
import { Callout } from "@/components/Card";
import { LiveTracker } from "@/components/LiveTracker";
import { FondoCobertura } from "@/components/FondoCobertura";
import { claveTomTom, flujosDe, modoDatos } from "@/lib/config";
import { ventanaProyeccion } from "@/lib/cobertura";
import { diaDePaquetes, diaOperativoAnterior } from "@/lib/tracker";
import { TablaFaltante } from "@/lib/supabase";
import { diaVigente, leerTracker, type DatosDelTracker } from "@/lib/tracker-datos";

export const metadata = { title: "Live tracker" };

/**
 * La pantalla se pinta siempre, incluso sin datos.
 *
 * El primer render sale del servidor para que el mapa esté a la vista sin
 * esperar un `fetch`; a partir de ahí, los botones releen por la API y el
 * componente de cliente reemplaza solo los datos. Sin caché: la jornada cambia
 * entre una lectura y la siguiente, que es el punto de la pantalla.
 */
export const dynamic = "force-dynamic";

export default async function LiveTrackerPage() {
  const modo = modoDatos();

  if (modo !== "supabase") {
    return (
      <>
        <Cabecera />
        <Callout tono="warning" titulo="El live tracker necesita la base">
          Las posiciones y las rutas del día las escribe n8n en Supabase, así que esta pantalla no
          tiene de dónde leer con el origen en «{modo}». Cargá SUPABASE_URL y SUPABASE_SERVICE_KEY,
          o sacá ORIGEN_DATOS.
        </Callout>
      </>
    );
  }

  let datos: DatosDelTracker;
  let datosEstadisticas: DatosDelTracker | undefined;
  try {
    datos = await leerTracker();
    datosEstadisticas = await leerTracker(diaOperativoAnterior(diaDePaquetes()));
  } catch (error) {
    return (
      <>
        <Cabecera />
        <Callout
          tono={error instanceof TablaFaltante ? "warning" : "critical"}
          titulo={
            error instanceof TablaFaltante
              ? "Faltan las tablas del tracker"
              : "No se pudo leer la jornada"
          }
        >
          {error instanceof TablaFaltante
            ? `La tabla «${error.tabla}» todavía no existe. Corré web/supabase/live-tracker.sql en el SQL Editor de Supabase y volvé a entrar.`
            : "La base no respondió. Lo que ya estaba guardado sigue ahí; volvé a intentar en un momento."}
        </Callout>
      </>
    );
  }

  return (
    <>
      <Cabecera datos={datos} />

      <LiveTracker
        inicial={datos}
        estadisticas={datosEstadisticas}
        ventana={ventanaProyeccion()}
        hayFlujoPosiciones={flujosDe("trackerPosiciones").length > 0}
        hayFlujoPaquetes={flujosDe("trackerPaquetes").length > 0}
        claveTomTom={claveTomTom()}
      >
        {/* El contorno de las zonas, dibujado en el servidor: son ~3.500
            puntos que no cambian nunca y no tienen por qué viajar como datos
            ni volver a pintarse al mover el mapa. */}
        <FondoCobertura />
      </LiveTracker>
    </>
  );
}

function Cabecera({ datos }: { datos?: DatosDelTracker }) {
  const diaPosiciones = datos?.diaPosiciones ?? diaVigente();
  const diaPaquetes = datos?.dia ?? diaDePaquetes();
  return (
    <PageHead
      eyebrow={
        diaPaquetes === diaPosiciones
          ? `Ruta del ${diaPaquetes}, hora de México`
          : `Pendientes del ${diaPaquetes} · posiciones del ${diaPosiciones}, hora de México`
      }
      titulo="Live tracker"
      dek="Dónde está cada repartidor y qué le queda por entregar. Las posiciones y las rutas se traen con los dos botones del panel, cada uno por su lado: mover los puntos no rehace las rutas, y rehacer las rutas no espera a que todos los dispositivos reporten."
    />
  );
}
