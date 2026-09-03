import { cargarCancelados } from "@/lib/datos";
import { resumirCancelados } from "@/lib/cancelados";
import { mesesOperativos } from "@/lib/periodos";
import { duracion, fechaHora, mesLargo, numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { Tabla } from "@/components/Tabla";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Cancelados" };

export default async function Cancelados() {
  const todos = await cargarCancelados();

  const periodos = mesesOperativos();
  const cancelados = todos.filter((c) => periodos.includes(c.mes));
  const fueraDeOperacion = todos.length - cancelados.length;
  const periodo = periodos.map(mesLargo).join(" y ");
  const hayMesAnterior = periodos.length === 2;
  const datos = resumirCancelados(cancelados);

  const filas = [...cancelados]
    .sort((a, b) => (b.colectado?.getTime() ?? 0) - (a.colectado?.getTime() ?? 0))
    .map((c) => ({
      id: c.id,
      idMeli: c.idMeli,
      tienda: c.tienda,
      estadoRbp: c.estadoRbp,
      estadoMeli: c.estadoMeli,
      colectado: fechaHora(c.colectado),
      cancelado: fechaHora(c.cancelado),
      demoro: duracion(c.minutos),
      minutos: c.minutos,
      dia: c.dia,
    }));

  return (
    <>
      <PageHead
        eyebrow={`Cancelaciones tempranas · ${periodo}`}
        titulo="Cancelados"
        flujo="global"
        dek={`Viajes que el cliente canceló el mismo día en que se colectaron, dentro de las 7 horas. ${hayMesAnterior ? "Hasta el día 9 se muestran juntos el mes anterior y el actual; el día 10 el anterior pasa a Cancelados históricos." : "Los períodos anteriores ya están en Cancelados históricos."}`}
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Cancelados"
          valor={numero(datos.total)}
          nota="cancelados el mismo día de la colecta"
        />
        <Kpi
          etiqueta="sellers"
          valor={numero(datos.sellers)}
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
        {cancelados.length === 0 ? (
          <Callout tono="neutral" titulo={`Sin cancelaciones en ${periodo}`}>
            {fueraDeOperacion > 0
              ? `Hay ${numero(fueraDeOperacion)} cancelaciones fuera de la ventana operativa; revisá que la rotación a histórico esté activa.`
              : "Todavía no hay ninguna cancelación cargada en la base."}
          </Callout>
        ) : null}

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
          nota="El detalle de cada cancelación, con la hora de la colecta, la de la cancelación y cuánto pasó entre las dos. Se filtra por seller y por el estado en cada sistema."
        >
          <Tabla
            id="cancelados-detalle"
            titulo="Paquetes cancelados"
            columnas={[
              { clave: "id", titulo: "Viaje", tipo: "viaje" },
              { clave: "idMeli", titulo: "Id Meli", tipo: "texto" },
              { clave: "tienda", titulo: "seller", tipo: "texto" },
              { clave: "estadoRbp", titulo: "Estado nuestro", tipo: "texto" },
              { clave: "estadoMeli", titulo: "Estado Meli", tipo: "texto" },
              { clave: "colectado", titulo: "Colectado", tipo: "texto" },
              { clave: "cancelado", titulo: "Cancelado", tipo: "texto" },
              { clave: "demoro", titulo: "Tardó", tipo: "texto" },
            ]}
            filas={filas}
            filtros={[
              { clave: "tienda", etiqueta: "seller" },
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
          titulo="Por seller"
          nota="Dónde se concentran las cancelaciones. Con pocos casos por seller el orden dice más que las diferencias entre uno y otro."
        >
          <Tabla
            id="cancelados-sellers"
            titulo="Cancelados por seller"
            columnas={[
              { clave: "tienda", titulo: "seller", tipo: "texto" },
              { clave: "casos", titulo: "Cancelados", tipo: "numero" },
              { clave: "demoro", titulo: "Tardó (mediana)", tipo: "texto" },
              { clave: "desincronizados", titulo: "Sin reflejar en Meli", tipo: "numero" },
            ]}
            filas={datos.porseller.map((f) => ({
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
