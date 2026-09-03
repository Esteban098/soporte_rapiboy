import { cargarAsignaciones } from "@/lib/datos";
import { cargaPorChofer, resumirAsignaciones } from "@/lib/colectas";
import { numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { Tabla } from "@/components/Tabla";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Colectas · asignación" };

/** Fecha y hora en horario de México. Vacío queda vacío. */
function cuando(fecha: Date | null): string {
  if (!fecha) return "sin datos";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(fecha);
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
  const { filas: todas, sinTabla } = await cargarAsignaciones();

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
  const carga = cargaPorChofer(asignaciones);

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
              { clave: "seller", titulo: "Comercio", tipo: "texto" },
              { clave: "lugar", titulo: "Punto de retiro", tipo: "texto" },
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

        <Card
          titulo="Carga por chofer"
          nota="Cuántos comercios tiene cada uno y en cuántas paradas se resuelven. Casi nunca coinciden: un dropOFF junta varios comercios en una sola parada, así que doce comercios en tres puntos es menos trabajo que seis en seis."
        >
          <Tabla
            id="colectas-carga"
            titulo="Carga por chofer"
            columnas={[
              { clave: "chofer", titulo: "Chofer", tipo: "texto" },
              { clave: "comercios", titulo: "Comercios", tipo: "numero" },
              { clave: "lugares", titulo: "Paradas", tipo: "numero" },
              { clave: "colectas", titulo: "Colectas en la ventana", tipo: "numero" },
            ]}
            filas={carga.map((c) => ({ ...c, id: c.chofer }))}
            ordenInicial={{ clave: "comercios", asc: false }}
            vacio="Todavía no hay choferes con comercios asignados."
          />
        </Card>
      </div>
    </>
  );
}
