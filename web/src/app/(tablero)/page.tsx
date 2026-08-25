import { cargarPedidos } from "@/lib/datos";
import {
  dispersionRepartidores,
  porDiaSemana,
  porLeadTime,
  porMes,
  porVisitas,
  resumen,
} from "@/lib/metricas";
import { mesLargo, numero, porcentaje, puntos } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { BarrasMes } from "@/components/charts/BarrasMes";
import { LineaTasa } from "@/components/charts/LineaTasa";
import { BarrasTramo } from "@/components/charts/BarrasTramo";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Resumen" };

export default async function Resumen() {
  const pedidos = await cargarPedidos();
  const total = resumen(pedidos);
  const meses = porMes(pedidos);
  const visitas = porVisitas(pedidos);
  const lead = porLeadTime(pedidos);
  const dias = porDiaSemana(pedidos);
  const dispersion = dispersionRepartidores(pedidos);

  const ultimo = meses.at(-1);
  const anterior = meses.at(-2);
  const delta = ultimo && anterior ? ultimo.tasaDevolucion - anterior.tasaDevolucion : null;
  const sinVisita = visitas.find((v) => v.tramo === "0");

  return (
    <>
      <PageHead
        eyebrow="Panorama general"
        titulo="Resumen de la operación"
        dek={`${numero(total.casos)} pedidos con incidencia entre ${mesLargo(total.desde)} y ${mesLargo(total.hasta)}. Todo lo que sigue se recalcula solo cuando el equipo actualiza el sheet.`}
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
          etiqueta={ultimo ? `Tasa en ${mesLargo(ultimo.mes)}` : "Último mes"}
          valor={ultimo ? porcentaje(ultimo.tasaDevolucion) : "—"}
          tono={delta == null ? "neutral" : delta > 0 ? "bad" : "good"}
          nota={
            delta == null
              ? "sin mes previo para comparar"
              : `${puntos(delta)} contra el mes anterior`
          }
        />
      </div>

      <div className={estilos.stack}>
        <Card
          titulo="Volumen de casos por mes"
          nota="Agrupado por la fecha programada de entrega. Los meses que el libro no tiene cargados no aparecen en la serie."
        >
          <BarrasMes datos={meses} />
        </Card>

        <Card
          titulo="Tasa de devolución por mes"
          nota="Porcentaje de casos que terminaron volviendo al vendedor, sobre el total gestionado en cada mes."
        >
          <LineaTasa datos={meses} promedio={total.tasaDevolucion} />
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
          <BarrasTramo datos={dias} etiquetaTramo="Día" />
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
