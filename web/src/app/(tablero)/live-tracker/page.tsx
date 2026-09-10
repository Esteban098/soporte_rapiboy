import { PageHead } from "@/components/Shell";
import { Callout } from "@/components/Card";
import { LiveTracker } from "@/components/LiveTracker";
import { FondoCobertura } from "@/components/FondoCobertura";
import { diasAtrasDelTracker, flujosDe, modoDatos } from "@/lib/config";
import { ventanaProyeccion } from "@/lib/cobertura";
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
  try {
    datos = await leerTracker();
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
      <Cabecera />

      {/*
        Con el tracker corrido a un día anterior, esto va antes que el mapa y no
        como una nota al pie. Alguien que mire posiciones de ayer creyendo que
        son de ahora va a llamar a un repartidor para preguntarle por qué está
        parado, y el aviso tiene que llegarle antes que el mapa.
      */}
      {datos.diasAtras > 0 ? (
        <Callout tono="warning" titulo={`Estás viendo el ${datos.dia}, no hoy`}>
          El tracker está corrido {datos.diasAtras}{" "}
          {datos.diasAtras === 1 ? "día" : "días"} hacia atrás por{" "}
          <code>TRACKER_DIAS_ATRAS</code>. Los repartidores y los paquetes son los de esa jornada, y
          las posiciones son las últimas que se supieron ese día: no son de ahora. Para volver a la
          jornada en curso, sacá la variable y recargá.
        </Callout>
      ) : null}

      <LiveTracker
        inicial={datos}
        ventana={ventanaProyeccion()}
        hayFlujoPosiciones={flujosDe("trackerPosiciones").length > 0}
        hayFlujoPaquetes={flujosDe("trackerPaquetes").length > 0}
      >
        {/* El contorno de las zonas, dibujado en el servidor: son ~3.500
            puntos que no cambian nunca y no tienen por qué viajar como datos
            ni volver a pintarse al mover el mapa. */}
        <FondoCobertura />
      </LiveTracker>
    </>
  );
}

function Cabecera() {
  return (
    <PageHead
      eyebrow={
        diasAtrasDelTracker() > 0
          ? `Jornada del ${diaVigente()} · no es hoy`
          : `Jornada del ${diaVigente()}`
      }
      titulo="Live tracker"
      dek="Dónde está cada repartidor y qué le queda por entregar. Las posiciones y las rutas se traen con los dos botones del panel, cada uno por su lado: mover los puntos no rehace las rutas, y rehacer las rutas no espera a que todos los dispositivos reporten."
    />
  );
}
