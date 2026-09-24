import { cargarAsignaciones } from "@/lib/datos";
import { resumirAsignaciones } from "@/lib/colectas";
import { leerColectasDelDia } from "@/lib/colectas-vivo-datos";
import { fechaHoraArgentina, numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { Tabla } from "@/components/Tabla";
import { ColectasHoy } from "@/components/ColectasHoy";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Colectas · asignación" };

/** Fecha y hora visible en Argentina. Vacío queda vacío. */
function cuando(fecha: Date | null): string {
  return fecha ? fechaHoraArgentina(fecha) : "sin datos";
}

/**
 * Quién colecta cada comercio.
 *
 * No es una asignación declarada por nadie: sale de rankear los últimos 30 días
 * y quedarse con el chofer que más veces fue. Por eso la columna se llama «más
 * frecuente» y no «asignado» —el tablero constata, no manda— y por eso importa
 * mirar cuántas veces fue: dos visitas no definen una ruta.
 */
export default async function Colectas() {
  const [{ filas: todas, sinTabla }, hoy] = await Promise.all([
    cargarAsignaciones(),
    // Esta pantalla no necesita revelar posiciones: solo la jornada y su lógica operativa.
    leerColectasDelDia({ sinPosiciones: true }).catch(() => null),
  ]);

  /*
   * Solo los comercios que alguien está colectando.
   *
   * Los que no registran ninguna colecta en la ventana son la mayoría —altas
   * que nunca operaron, o que dejaron de hacerlo sin darse de baja— y llenaban
   * la tabla de filas que no describen ninguna ruta. Sin ellos, lo que queda es
   * el reparto real.
   */
  const asignaciones = todas.filter((a) => !a.sinAsignar);
  const datos = resumirAsignaciones(asignaciones);

  if (sinTabla) {
    return (
      <>
        <PageHead eyebrow="Colectas" titulo="Asignación" />
        <Callout tono="warning" titulo="Falta crear las tablas">
          Las tablas de colectas todavía no existen en la base. El script está en
          <code> web/supabase/colectas.sql</code>: se corre una vez desde el SQL Editor de
          Supabase, y después el flujo <code>06-colectas</code> las llena solo.
        </Callout>
      </>
    );
  }

  const filas = asignaciones.map((a) => ({
    id: a.idUsuario,
    seller: a.seller,
    lugar: a.lugarColecta,
    tipo: a.esDropOff ? "dropOFF" : "Comercio",
    chofer: a.chofer,
    veces: a.cantidadColectas,
    historicos: a.cantidadHistorica,
  }));

  return (
    <>
      <PageHead
        eyebrow={`Colectas · última corrida ${cuando(datos.actualizado)}`}
        titulo="Asignación"
        flujo="colectas"
        dek="Qué chofer retira la mercadería en cada comercio. Sale de mirar los últimos 30 días y quedarse con el que más veces fue, así que describe lo que viene pasando, no lo que alguien decidió. Cuando varios comercios comparten un punto de retiro, el ranking se calcula por ese punto: el chofer va una vez y levanta todo. Los comercios que nadie colectó en la ventana no se listan."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Comercios"
          valor={numero(datos.comercios)}
          nota="con chofer que los colecta"
        />
        <Kpi
          etiqueta="Choferes"
          valor={numero(datos.choferes)}
          nota="distintos, con al menos un comercio"
        />
        <Kpi
          etiqueta="Puntos de retiro"
          valor={numero(datos.lugares)}
          nota={`${numero(datos.enDropOff)} comercios entregan en un dropOFF`}
        />
      </div>

      <div className={estilos.stack}>
        <Card
          titulo="Comercios y su chofer"
          nota="Un renglón por comercio. «Veces» es cuántas colectas hizo ese chofer en ese punto durante la ventana: con una o dos, el orden todavía no dice mucho."
        >
          <Tabla
            id="colectas-asignacion"
            titulo="Colectas · asignación"
            columnas={[
              { clave: "seller", titulo: "Comercio", tipo: "tienda" },
              { clave: "lugar", titulo: "Punto de retiro", tipo: "tienda" },
              { clave: "tipo", titulo: "Tipo", tipo: "texto" },
              { clave: "chofer", titulo: "Chofer más frecuente", tipo: "texto" },
              { clave: "veces", titulo: "Veces", tipo: "numero" },
              { clave: "historicos", titulo: "Viajes que respaldan", tipo: "numero" },
            ]}
            filas={filas}
            filtros={[
              { clave: "chofer", etiqueta: "Chofer" },
              { clave: "tipo", etiqueta: "Tipo", opciones: ["Comercio", "dropOFF"] },
              { clave: "lugar", etiqueta: "Punto de retiro" },
            ]}
            ordenInicial={{ clave: "seller", asc: true }}
            limite={40}
            vacio="Todavía no hay asignaciones cargadas."
          />
        </Card>

        {hoy ? <ColectasHoy dia={hoy} /> : (
          <Callout tono="warning" titulo="No se pudo leer la jornada de hoy">
            La asignación histórica sigue disponible. Volvé a intentar en un momento para cargar la foto de colectas en vivo.
          </Callout>
        )}
      </div>
    </>
  );
}
