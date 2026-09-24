import { PageHead } from "@/components/Shell";
import { Callout, Kpi } from "@/components/Card";
import { MapaTiendas } from "@/components/MapaTiendas";
import { FondoCobertura } from "@/components/FondoCobertura";
import { claveTomTom, flujosDe, modoDatos } from "@/lib/config";
import { sesionActual } from "@/lib/sesion";
import { esComercial } from "@/lib/permisos";
import { leerPosiciones, type PosicionDriver } from "@/lib/posiciones-datos";
import { leerColectasDelDia } from "@/lib/colectas-vivo-datos";
import type { ColectasDelDia } from "@/lib/colectas-vivo";
import { ResumenColectasVivo } from "@/components/ColectasEnVivo";
import { ventanaProyeccion } from "@/lib/cobertura";
import { TablaFaltante } from "@/lib/supabase";
import { leerLugares } from "@/lib/tiendas-datos";
import { numero } from "@/lib/formato";
import type { Lugar } from "@/lib/tiendas";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Ruta" };

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

  /*
   * Las colectas de hoy las ven todos los que entran a Tiendas, comercial
   * incluido; las coordenadas de los repartidores se sacan en el servidor para
   * quien no ve el live tracker.
   */
  const [lugares, posiciones, colectas] = await Promise.allSettled([
    leerLugares(),
    puedeVerPosiciones ? leerPosiciones() : Promise.resolve(null),
    leerColectasDelDia({ sinPosiciones: !puedeVerPosiciones }),
  ]);
  const colectasDelDia = colectas.status === "fulfilled" ? colectas.value : null;

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
            colectas={colectasDelDia}
          />
        )}

        {colectas.status === "rejected" ? (
          <Callout
            tono={colectas.reason instanceof TablaFaltante ? "warning" : "critical"}
            titulo={
              colectas.reason instanceof TablaFaltante
                ? "Falta cargar las colectas en vivo"
                : "No se pudieron leer las colectas de hoy"
            }
          >
            {colectas.reason instanceof TablaFaltante
              ? "Las tablas «colectas_vivo» y «colectas_vivo_drivers» todavía no existen. Corré web/supabase/migracion-15-colectas-vivo.sql en el SQL Editor de Supabase e importá el flujo n8n/12-colectas-vivo.json."
              : "La base no respondió. El mapa de tiendas sigue funcionando; volvé a intentar en un momento."}
          </Callout>
        ) : colectasDelDia ? (
          <ResumenColectasVivo dia={colectasDelDia} />
        ) : null}

      </div>
    </>
  );
}

function Mapa({
  lugares,
  posiciones,
  colectas,
}: {
  lugares: Lugar[];
  posiciones: PosicionDriver[] | null;
  colectas: ColectasDelDia | null;
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
          colectas={colectas}
          hayFlujoColectas={flujosDe("colectasVivo").length > 0}
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
      eyebrow="Colectas · Ruta"
      titulo="Ruta"
      dek="Las colectas de hoy en vivo —qué repartidor va a qué tienda, en qué estado está cada una y dónde anda cada repartidor— sobre las zonas de reparto."
    />
  );
}
