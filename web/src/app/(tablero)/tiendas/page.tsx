import { PageHead } from "@/components/Shell";
import { Callout, Kpi } from "@/components/Card";
import { MapaTiendas } from "@/components/MapaTiendas";
import { FondoCobertura } from "@/components/FondoCobertura";
import { PanelResponsables } from "@/components/PanelResponsables";
import { claveTomTom, modoDatos } from "@/lib/config";
import { sesionActual } from "@/lib/sesion";
import { esComercial } from "@/lib/permisos";
import { leerPosiciones, type PosicionDriver } from "@/lib/posiciones-datos";
import { ventanaProyeccion } from "@/lib/cobertura";
import { TablaFaltante } from "@/lib/supabase";
import { leerLugares } from "@/lib/tiendas-datos";
import { leerResponsables } from "@/lib/responsables-datos";
import { numero } from "@/lib/formato";
import type { Lugar } from "@/lib/tiendas";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Tiendas" };

/**
 * Sin caché: la tabla se recarga a mano cuando operaciones actualiza el mapa,
 * y ese es justo el momento en que alguien entra a comprobar que el cambio
 * quedó. Una página cacheada le mostraría el mapa viejo.
 */
export const dynamic = "force-dynamic";

export default async function Tiendas() {
  const modo = modoDatos();

  if (modo !== "supabase") {
    return (
      <>
        <Cabecera />
        <Callout tono="warning" titulo="Esta pantalla necesita la base">
          Los puntos salen de la tabla <code>tracker_tiendas</code>, así que no hay de dónde leer
          con el origen en «{modo}». Cargá SUPABASE_URL y SUPABASE_SERVICE_KEY, o sacá
          ORIGEN_DATOS.
        </Callout>
      </>
    );
  }

  /*
   * El mapa, la distribución y las posiciones se leen por separado y cada uno
   * falla solo: que falte una tabla no tiene por qué esconder las otras. Sin
   * posiciones, el mapa de tiendas sale igual, sin esa capa.
   *
   * Las posiciones de los repartidores son del live tracker, y el rol
   * comercial está afuera del live tracker a propósito. Por eso ni se leen
   * para él: no alcanza con esconder la casilla, porque lo que llega al
   * navegador se puede mirar.
   */
  const sesion = await sesionActual();
  const puedeVerPosiciones = sesion !== null && !esComercial(sesion.rol);

  const [lugares, responsables, posiciones] = await Promise.allSettled([
    leerLugares(),
    leerResponsables(),
    puedeVerPosiciones ? leerPosiciones() : Promise.resolve(null),
  ]);

  return (
    <>
      <Cabecera />

      <div className={estilos.stack}>
        {lugares.status === "rejected" ? (
          <Callout
            tono={lugares.reason instanceof TablaFaltante ? "warning" : "critical"}
            titulo={
              lugares.reason instanceof TablaFaltante
                ? "Falta cargar el mapa"
                : "No se pudo leer la tabla"
            }
          >
            {lugares.reason instanceof TablaFaltante
              ? "La tabla «tracker_tiendas» todavía no existe. Corré web/supabase/migracion-06-lugares.sql en el SQL Editor de Supabase y volvé a entrar."
              : "La base no respondió. Volvé a intentar en un momento."}
          </Callout>
        ) : (
          <Mapa
            lugares={lugares.value}
            posiciones={posiciones.status === "fulfilled" ? posiciones.value : null}
          />
        )}

        {responsables.status === "rejected" ? (
          <Callout
            tono={responsables.reason instanceof TablaFaltante ? "warning" : "critical"}
            titulo={
              responsables.reason instanceof TablaFaltante
                ? "Falta cargar la distribución de tiendas"
                : "No se pudo leer la distribución"
            }
          >
            {responsables.reason instanceof TablaFaltante
              ? "La tabla «tiendas_responsables» todavía no existe. Corré web/supabase/migracion-13-tiendas-responsables.sql en el SQL Editor de Supabase y volvé a entrar."
              : "La base no respondió. Volvé a intentar en un momento."}
          </Callout>
        ) : (
          <PanelResponsables filas={responsables.value} />
        )}
      </div>
    </>
  );
}

function Mapa({
  lugares,
  posiciones,
}: {
  lugares: Lugar[];
  posiciones: PosicionDriver[] | null;
}) {
  const cuenta = (tipo: Lugar["tipo"]) => lugares.filter((l) => l.tipo === tipo).length;
  const sinId = lugares.filter((l) => l.id == null).length;
  const compartidos = new Set(lugares.filter((l) => l.compartido).map((l) => l.id)).size;

  return (
    <>
      <div className={estilos.kpis}>
        <Kpi etiqueta="Tiendas" valor={numero(cuenta("TIENDA"))} nota="comercios con punto propio" />
        <Kpi etiqueta="Dropoff" valor={numero(cuenta("DROPOFF"))} nota="puntos de colecta" />
        <Kpi
          etiqueta="Sin ID"
          valor={numero(sinId)}
          nota="están en el mapa, no atados a un comercio"
        />
        <Kpi
          etiqueta="ID repetido"
          valor={numero(compartidos)}
          nota="un mismo comercio con dos sucursales"
        />
      </div>

      {lugares.length === 0 ? (
        <Callout tono="warning" titulo="La tabla está vacía">
          La tabla existe pero no tiene ningún punto. Regenerá el SQL con{" "}
          <code>npx tsx scripts/lugares.mts</code> y corré{" "}
          <code>supabase/migracion-06-lugares.sql</code>.
        </Callout>
      ) : (
        <MapaTiendas
          lugares={lugares}
          ventana={ventanaProyeccion()}
          claveTomTom={claveTomTom()}
          posiciones={posiciones}
        >
          {/* El contorno de las zonas, dibujado en el servidor: son ~3.500
              puntos que no cambian nunca y no tienen por qué viajar como
              datos ni volver a pintarse al mover el mapa. */}
          <FondoCobertura />
        </MapaTiendas>
      )}
    </>
  );
}

function Cabecera() {
  return (
    <PageHead
      eyebrow="Dónde queda cada comercio"
      titulo="Tiendas"
      dek="Las tiendas, los puntos de dropoff y la bodega, sobre las zonas de reparto, y de quién es cada comercio. El mapa lo mantiene operaciones en Google y acá se muestra tal cual; el nombre lleva al punto en Google Maps. La distribución se edita acá abajo y decide el color de cada tienda en todo el tablero: azul Esteban, rosa Candelaria."
    />
  );
}
