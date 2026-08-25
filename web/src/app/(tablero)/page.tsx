import { cargarPedidos } from "@/lib/datos";
import {
  dispersionRepartidores,
  porDia,
  porDiaSemana,
  porLeadTime,
  porVisitas,
  resumen,
} from "@/lib/metricas";
import { diaCorto, mesLargo, numero, porcentaje, puntos } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { BarrasSerie } from "@/components/charts/BarrasSerie";
import { LineaSerie } from "@/components/charts/LineaSerie";
import { BarrasTramo } from "@/components/charts/BarrasTramo";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Resumen" };

export default async function Resumen() {
  const pedidos = await cargarPedidos();
  const total = resumen(pedidos);
  const dias = porDia(pedidos);
  const visitas = porVisitas(pedidos);
  const lead = porLeadTime(pedidos);
  const semana = porDiaSemana(pedidos);
  const dispersion = dispersionRepartidores(pedidos);

  const ultimo = dias.at(-1);
  const anterior = dias.at(-2);
  const delta = ultimo && anterior ? ultimo.tasaDevolucion - anterior.tasaDevolucion : null;
  const sinVisita = visitas.find((v) => v.tramo === "0");

  return (
    <>
      <PageHead
        eyebrow="Panorama general"
        titulo="Resumen de la operación"
        dek={`${numero(total.casos)} pedidos con incidencia en ${mesLargo(total.hasta)}. Sale de la pestaña viva del libro y se recalcula solo cuando el equipo la actualiza.`}
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos gestionados"
          valor={numero(total.casos)}
          nota="pedidos con incidencia, sin duplicados"
        />
        <Kpi
          etiqueta="Devoluciones"
          valor={porcentaje(total.tasaDevolucion)}
          tono="bad"
          nota={`${numero(total.devoluciones)} paquetes volvieron al vendedor`}
        />
        <Kpi
          etiqueta="Recuperados"
          valor={porcentaje((total.entregados / total.casos) * 100)}
          tono="good"
          nota={`${numero(total.entregados)} casos que soporte logró entregar`}
        />
        <Kpi
          etiqueta={ultimo ? `Tasa del ${diaCorto(ultimo.clave)}` : "Último día"}
          valor={ultimo ? porcentaje(ultimo.tasaDevolucion) : "—"}
          tono={delta == null ? "neutral" : delta > 0 ? "bad" : "good"}
          nota={
            delta == null
              ? "sin día previo para comparar"
              : `${puntos(delta)} contra el día anterior`
          }
        />
      </div>

      <div className={estilos.stack}>
        <Card
          titulo="Casos por día"
          nota="Agrupado por la fecha programada de entrega, dentro del mes en curso."
        >
          <BarrasSerie datos={dias} escala="dia" />
        </Card>

        <Card
          titulo="Tasa de devolución por día"
          nota="Porcentaje de casos que terminaron volviendo al vendedor, sobre el total del día. La línea gris es el promedio del mes."
        >
          <LineaSerie datos={dias} promedio={total.tasaDevolucion} escala="dia" />
        </Card>

        <div className={estilos.grid2}>
          <Card
            titulo="Devolución según visitas"
            nota="Cuántas visitas registró el repartidor antes de cerrar el caso. La segunda visita es la que más pedidos salva."
          >
            <BarrasTramo datos={visitas} etiquetaTramo="Visitas" destacarSobre={50} />
          </Card>

          <Card
            titulo="Devolución según días hasta la entrega"
            nota="Días entre la creación del pedido y su fecha programada. Pasada la primera semana, el caso casi no se recupera."
          >
            <BarrasTramo datos={lead} etiquetaTramo="Demora" destacarSobre={50} />
          </Card>
        </div>

        <Card
          titulo="Devolución por día de la semana"
          nota="Sobre la fecha programada de entrega. Sirve para decidir dónde reforzar dotación."
        >
          <BarrasTramo datos={semana} etiquetaTramo="Día" />
        </Card>

        {sinVisita ? (
          <Callout tono="critical" titulo="Sin visita no hay entrega">
            {numero(sinVisita.casos)} casos se cerraron con cero visitas registradas y{" "}
            {porcentaje(sinVisita.tasaDevolucion)} de ellos terminó devuelto. Es la única variable
            del tablero que, por sí sola, decide el resultado del caso.
          </Callout>
        ) : null}

        <Callout tono="warning" titulo="La brecha entre repartidores es lo más accionable">
          Entre los {numero(dispersion.evaluados)} repartidores con volumen suficiente, la mediana de
          devolución es {porcentaje(dispersion.mediana)}. Los {numero(dispersion.criticos)} que
          superan el 25% concentran {numero(dispersion.casosCriticos)} casos: llevarlos a la mediana
          evitaría {numero(dispersion.devolucionesEvitables)} devoluciones sin tocar nada más de la
          operación.
        </Callout>
      </div>
    </>
  );
}
