import { cargarCancelados } from "@/lib/datos";
import { resumirCancelados } from "@/lib/cancelados";
import { numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { Tabla } from "@/components/Tabla";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Cancelados" };

/** Minutos como «2 h 30 m», que se lee mejor que 150 en una tabla. */
function duracion(minutos: number | null): string {
  if (minutos == null) return "—";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return horas > 0 ? `${horas} h ${String(resto).padStart(2, "0")} m` : `${resto} m`;
}

/** La hora tal como quedó guardada, sin reinterpretar la zona. */
function hora(fecha: Date | null): string {
  if (!fecha) return "—";
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(fecha.getUTCHours()).padStart(2, "0");
  const mi = String(fecha.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

export default async function Cancelados() {
  const cancelados = await cargarCancelados();
  const datos = resumirCancelados(cancelados);

  const filas = [...cancelados]
    .sort((a, b) => (b.colectado?.getTime() ?? 0) - (a.colectado?.getTime() ?? 0))
    .map((c) => ({
      id: c.id,
      idMeli: c.idMeli,
      tienda: c.tienda,
      estadoRbp: c.estadoRbp,
      estadoMeli: c.estadoMeli,
      colectado: hora(c.colectado),
      cancelado: hora(c.cancelado),
      demoro: duracion(c.minutos),
      minutos: c.minutos,
      dia: c.dia,
    }));

  return (
    <>
      <PageHead
        eyebrow="Cancelaciones tempranas"
        titulo="Cancelados"
        dek="Viajes que el cliente canceló el mismo día en que se colectaron, dentro de las 7 horas. No son entregas fallidas: el paquete nunca llegó a intentarse, así que no cuentan como incidencia de la operación."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Cancelados"
          valor={numero(datos.total)}
          nota="cancelados el mismo día de la colecta"
        />
        <Kpi
          etiqueta="Comercios"
          valor={numero(datos.comercios)}
          nota="distintos, entre los casos cancelados"
        />
        <Kpi
          etiqueta="Tardaron en cancelar"
          valor={duracion(datos.minutosMediana)}
          nota="mediana desde la colecta hasta la cancelación"
        />
        <Kpi
          etiqueta="Sin reflejar en Meli"
          valor={numero(datos.desincronizados)}
          tono={datos.desincronizados > 0 ? "bad" : "good"}
          nota="nuestro sistema los canceló y Meli todavía no"
        />
      </div>

      <div className={estilos.stack}>
        {datos.desincronizados > 0 ? (
          <Callout tono="warning" titulo="Los dos sistemas no dicen lo mismo">
            {numero(datos.desincronizados)} de {numero(datos.total)} figuran cancelados de nuestro
            lado, pero en Meli el envío sigue con otro estado. Mientras no coincidan, el paquete
            puede volver a aparecer en una ruta y sumar una visita que no correspondía. Es la
            razón por la que esta tabla guarda los dos estados en vez de unificarlos.
          </Callout>
        ) : null}

        <Card
          titulo="Paquetes cancelados"
          nota="El detalle de cada cancelación, con la hora de la colecta, la de la cancelación y cuánto pasó entre las dos. Se filtra por comercio y por el estado en cada sistema."
        >
          <Tabla
            id="cancelados-detalle"
            titulo="Paquetes cancelados"
            columnas={[
              { clave: "id", titulo: "Viaje", tipo: "viaje" },
              { clave: "idMeli", titulo: "Id Meli", tipo: "texto" },
              { clave: "tienda", titulo: "Comercio", tipo: "texto" },
              { clave: "estadoRbp", titulo: "Estado nuestro", tipo: "texto" },
              { clave: "estadoMeli", titulo: "Estado Meli", tipo: "texto" },
              { clave: "colectado", titulo: "Colectado", tipo: "texto" },
              { clave: "cancelado", titulo: "Cancelado", tipo: "texto" },
              { clave: "demoro", titulo: "Tardó", tipo: "texto" },
            ]}
            filas={filas}
            filtros={[
              { clave: "tienda", etiqueta: "Comercio" },
              { clave: "estadoRbp", etiqueta: "Estado nuestro" },
              { clave: "estadoMeli", etiqueta: "Estado Meli" },
              { clave: "dia", etiqueta: "Día" },
            ]}
            ordenInicial={{ clave: "colectado", asc: false }}
            limite={30}
            vacio="Todavía no hay cancelaciones cargadas."
          />
        </Card>

        <Card
          titulo="Por comercio"
          nota="Dónde se concentran las cancelaciones. Con pocos casos por comercio el orden dice más que las diferencias entre uno y otro."
        >
          <Tabla
            id="cancelados-comercios"
            titulo="Cancelados por comercio"
            columnas={[
              { clave: "tienda", titulo: "Comercio", tipo: "texto" },
              { clave: "casos", titulo: "Cancelados", tipo: "numero" },
              { clave: "demoro", titulo: "Tardó (mediana)", tipo: "texto" },
              { clave: "desincronizados", titulo: "Sin reflejar en Meli", tipo: "numero" },
            ]}
            filas={datos.porComercio.map((f) => ({
              id: f.tienda,
              tienda: f.tienda,
              casos: f.casos,
              demoro: duracion(f.minutosMediana),
              desincronizados: f.desincronizados,
            }))}
            ordenInicial={{ clave: "casos", asc: false }}
            vacio="Todavía no hay cancelaciones cargadas."
          />
        </Card>
      </div>
    </>
  );
}
