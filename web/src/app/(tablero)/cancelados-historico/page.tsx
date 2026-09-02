import { cargarCancelados } from "@/lib/datos";
import { canceladosPorMes, resumirCancelados } from "@/lib/cancelados";
import {
  enRango,
  mesesDelRango,
  mesesDisponibles,
  mesEnCurso,
  resolverRango,
} from "@/lib/periodos";
import { duracion, fechaHora, mesCorto, mesLargo, numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { Tabla } from "@/components/Tabla";
import { SelectorMeses } from "@/components/SelectorMeses";
import { BarrasCanceladosMes } from "@/components/charts/BarrasCanceladosMes";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Cancelados históricos" };

/**
 * Las cancelaciones tempranas de meses ya pasados.
 *
 * Misma idea que el histórico de pedidos: una sola tabla, filtrada por el mes
 * de la colecta. El botón de esta pantalla vuelve a preguntar por el estado de
 * esos viajes en los dos sistemas, que es lo que puede cambiar después de que
 * el mes cerró —sobre todo del lado de Meli, que a veces tarda en reflejar la
 * cancelación.
 */
export default async function CanceladosHistoricos({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const cancelados = await cargarCancelados();
  const disponibles = mesesDisponibles(cancelados.map((c) => c.mes));
  const rango = resolverRango(await searchParams, disponibles);

  if (!rango) {
    return (
      <>
        <PageHead
          eyebrow="Meses cerrados"
          titulo="Cancelados históricos"
          dek="Las cancelaciones tempranas de cada mes."
        />
        <Callout tono="warning" titulo="Todavía no hay meses cargados">
          Esta pantalla se arma con las cancelaciones que ya están en la base, agrupadas por el mes
          de la colecta. En cuanto la ingesta diaria cargue la primera, se llena sola.
        </Callout>
      </>
    );
  }

  const delRango = cancelados.filter((c) => enRango(c.mes, rango));
  const meses = mesesDelRango(rango);
  const serie = canceladosPorMes(delRango, meses);
  const datos = resumirCancelados(delRango);

  const unSoloMes = rango.desde === rango.hasta;
  const periodo = unSoloMes
    ? mesLargo(rango.desde)
    : `${mesCorto(rango.desde)} – ${mesCorto(rango.hasta)}`;
  const incluyeMesEnCurso = enRango(mesEnCurso(), rango);

  const filas = [...delRango]
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
      mes: mesCorto(c.mes),
    }));

  return (
    <>
      <PageHead
        eyebrow={`Meses cerrados · ${periodo}`}
        titulo="Cancelados históricos"
        flujo="canceladosHistorico"
        periodo={rango}
        dek="Viajes que el cliente canceló el mismo día de la colecta, agrupados por el mes en que se colectaron. El recorte de «mismo día y menos de 7 horas» vive en la consulta que los trae, así que esto son cancelaciones tempranas y no el total de cancelaciones."
      />

      <Card
        titulo="Período"
        nota="Elegí un mes o un rango. Solo aparecen los meses que tienen cancelaciones cargadas."
      >
        <SelectorMeses meses={disponibles} desde={rango.desde} hasta={rango.hasta} />
      </Card>

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Cancelados"
          valor={numero(datos.total)}
          nota={unSoloMes ? "colectados y cancelados en el mes" : `en ${periodo}`}
        />
        <Kpi
          etiqueta="Comercios"
          valor={numero(datos.comercios)}
          nota="distintos en todo el período"
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
          nota={`${porcentaje((datos.desincronizados / (datos.total || 1)) * 100)} del período`}
        />
      </div>

      <div className={estilos.stack}>
        {incluyeMesEnCurso ? (
          <Callout tono="warning" titulo="El rango incluye el mes en curso">
            {mesLargo(mesEnCurso())} todavía está abierto, así que su total va a seguir subiendo.
            Compararlo contra meses completos hace parecer que las cancelaciones cayeron.
          </Callout>
        ) : null}

        {datos.desincronizados > 0 ? (
          <Callout tono="warning" titulo="Los dos sistemas no dicen lo mismo">
            {numero(datos.desincronizados)} de {numero(datos.total)} figuran cancelados de nuestro
            lado y en Meli el envío sigue con otro estado. En meses ya cerrados esto es más grave
            que en el día: significa que la diferencia quedó fija y nadie la resolvió. El botón de
            arriba vuelve a preguntar por estos casos, que es la forma de ver si se acomodaron.
          </Callout>
        ) : null}

        <Card
          titulo="Mes a mes"
          nota="Cancelaciones por mes, con la mediana de cuánto tardó el cliente en dar marcha atrás. La cantidad de comercios no se puede sumar entre meses: uno que canceló en dos meses es un solo comercio."
        >
          <Tabla
            id="cancelados-historico-meses"
            titulo={`Cancelados · ${periodo}`}
            columnas={[
              { clave: "etiqueta", titulo: "Mes", tipo: "texto" },
              { clave: "casos", titulo: "Cancelados", tipo: "numero" },
              { clave: "comercios", titulo: "Comercios", tipo: "numero" },
              { clave: "demoro", titulo: "Tardó (mediana)", tipo: "texto" },
              { clave: "desincronizados", titulo: "Sin reflejar en Meli", tipo: "numero" },
            ]}
            filas={serie.map((f) => ({
              id: f.mes,
              etiqueta: mesCorto(f.mes),
              casos: f.casos,
              comercios: f.comercios,
              demoro: duracion(f.minutosMediana),
              desincronizados: f.desincronizados,
            }))}
            ordenInicial={{ clave: "etiqueta", asc: true }}
            vacio="No hay meses en este rango."
          />
        </Card>

        <Card
          titulo="Volumen por mes"
          nota="Cuántas cancelaciones tempranas hubo cada mes y cuántas de ellas siguen sin reflejarse en Meli."
        >
          <BarrasCanceladosMes datos={serie} />
        </Card>

        <Card
          titulo="Por comercio"
          nota="Dónde se concentran las cancelaciones en todo el período. Con pocos casos por comercio el orden dice más que las diferencias entre uno y otro."
        >
          <Tabla
            id="cancelados-historico-comercios"
            titulo={`Cancelados por comercio · ${periodo}`}
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
            vacio="No hay cancelaciones en este período."
          />
        </Card>

        <Card
          titulo="Detalle"
          nota="Cada cancelación del período, con la hora de la colecta, la de la cancelación y cuánto pasó entre las dos."
        >
          <Tabla
            id="cancelados-historico-detalle"
            titulo={`Detalle · ${periodo}`}
            columnas={[
              { clave: "id", titulo: "Viaje", tipo: "viaje" },
              { clave: "idMeli", titulo: "Id Meli", tipo: "texto" },
              { clave: "mes", titulo: "Mes", tipo: "texto" },
              { clave: "tienda", titulo: "Comercio", tipo: "texto" },
              { clave: "estadoRbp", titulo: "Estado nuestro", tipo: "texto" },
              { clave: "estadoMeli", titulo: "Estado Meli", tipo: "texto" },
              { clave: "colectado", titulo: "Colectado", tipo: "texto" },
              { clave: "cancelado", titulo: "Cancelado", tipo: "texto" },
              { clave: "demoro", titulo: "Tardó", tipo: "texto" },
            ]}
            filas={filas}
            filtros={[
              { clave: "mes", etiqueta: "Mes" },
              { clave: "tienda", etiqueta: "Comercio" },
              { clave: "estadoMeli", etiqueta: "Estado Meli" },
            ]}
            ordenInicial={{ clave: "colectado", asc: false }}
            limite={30}
            vacio="No hay cancelaciones en este período."
          />
        </Card>
      </div>
    </>
  );
}
