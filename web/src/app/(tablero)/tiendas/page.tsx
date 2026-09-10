import { PageHead } from "@/components/Shell";
import { Callout, Kpi } from "@/components/Card";
import { MapaTiendas } from "@/components/MapaTiendas";
import { FondoCobertura } from "@/components/FondoCobertura";
import { modoDatos } from "@/lib/config";
import { ventanaProyeccion } from "@/lib/cobertura";
import { TablaFaltante } from "@/lib/supabase";
import { leerLugares } from "@/lib/tiendas-datos";
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

  let lugares: Lugar[];
  try {
    lugares = await leerLugares();
  } catch (error) {
    return (
      <>
        <Cabecera />
        <Callout
          tono={error instanceof TablaFaltante ? "warning" : "critical"}
          titulo={
            error instanceof TablaFaltante ? "Falta cargar el mapa" : "No se pudo leer la tabla"
          }
        >
          {error instanceof TablaFaltante
            ? "La tabla «tracker_tiendas» todavía no existe. Corré web/supabase/migracion-06-lugares.sql en el SQL Editor de Supabase y volvé a entrar."
            : "La base no respondió. Volvé a intentar en un momento."}
        </Callout>
      </>
    );
  }

  const cuenta = (tipo: Lugar["tipo"]) => lugares.filter((l) => l.tipo === tipo).length;
  const sinId = lugares.filter((l) => l.id == null).length;
  const compartidos = new Set(lugares.filter((l) => l.compartido).map((l) => l.id)).size;

  return (
    <>
      <Cabecera />

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
        <MapaTiendas lugares={lugares} ventana={ventanaProyeccion()}>
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
      dek="Las tiendas, los puntos de dropoff y la bodega, sobre las zonas de reparto. Es informativo y no depende del live tracker: los mantiene operaciones en un mapa de Google, y acá se muestran tal cual. El nombre lleva al punto en Google Maps."
    />
  );
}
