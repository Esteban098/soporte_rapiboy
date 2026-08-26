import { cargarDemorados, cargarPedidos } from "@/lib/datos";
import {
  antiguedadAbiertos,
  cierre,
  devueltosPorDiaSemana,
  porEstado,
  visitasPorResultado,
  reclamos,
  resumen,
} from "@/lib/metricas";
import { mesLargo, numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PedidosTable } from "@/components/PedidosTable";
import { AntiguedadTable } from "@/components/AntiguedadTable";
import { BarrasVisitas } from "@/components/charts/BarrasVisitas";
import { BarrasDevueltos } from "@/components/charts/BarrasDevueltos";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Mes en curso" };

export default async function Resumen() {
  const [pedidos, demorados] = await Promise.all([cargarPedidos(), cargarDemorados()]);
  const total = resumen(pedidos);
  const resolucion = cierre(pedidos);
  const estados = porEstado(pedidos);
  const tienda = reclamos(pedidos);
  const devueltosSemana = devueltosPorDiaSemana(pedidos);
  const visitas = visitasPorResultado(pedidos);
  const antiguedad = antiguedadAbiertos(pedidos);

  const sinVisita = visitas.find((v) => v.visitas === "0");
  const noEntregados = estados.find((e) => e.estado.toLowerCase() === "pedido no entregado");

  return (
    <>
      <PageHead
        eyebrow={`Mes en curso · ${mesLargo(total.hasta)}`}
        titulo="Entregas fallidas mensual"
        dek={`${numero(total.casos)} casos acumulados en ${mesLargo(total.hasta)}. Para ver solo lo que quedó pendiente del día anterior, entrá a Operación del día.`}
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos abiertos"
          valor={numero(resolucion.abiertos)}
          tono="bad"
          nota={`${porcentaje(resolucion.tasaApertura)} del mes sigue sin resolverse`}
        />
        <Kpi
          etiqueta="Casos cerrados"
          valor={porcentaje(resolucion.tasaCierre)}
          tono="good"
          nota={`${numero(resolucion.cerrados)} casos resueltos`}
        />
        <Kpi
          etiqueta="Casos del mes"
          valor={numero(resolucion.total)}
          nota="pedidos con incidencia registrados"
        />
        <Kpi
          etiqueta="Demorados"
          valor={numero(demorados.length)}
          tono={demorados.length > 0 ? "bad" : "good"}
          nota="pasaron su fecha y siguen abiertos"
        />
        <Kpi
          etiqueta="Con datos de la tienda"
          valor={numero(tienda.conReclamo)}
          nota={`${numero(tienda.avisoPendiente)} sin avisar al repartidor`}
        />
      </div>

      <div className={estilos.stack}>
        <Callout
          tono={resolucion.tasaApertura > 20 ? "critical" : "neutral"}
          titulo="Abiertos contra cerrados"
        >
          De los {numero(resolucion.total)} casos del mes, {numero(resolucion.cerrados)} están
          resueltos y {numero(resolucion.abiertos)} siguen en la cola. Un caso cierra cuando queda
          en Entregado, Devuelto o Siniestrado; <b>Devolucion no cierra</b>, porque la devolución
          todavía está en curso.
        </Callout>

        <Card
          titulo="Todos los estados"
          nota="Cada estado en el que puede quedar un caso, con cuántos hay y si cuenta como resuelto."
        >
          <EstadosTable filas={estados} />
        </Card>

        <Card
          titulo="Demorados"
          nota="Los casos que pasaron su fecha y siguen abiertos. Es la cola de escalamiento: lo que no se resolvió por el flujo normal."
        >
          <PedidosTable pedidos={demorados} vacio="No hay pedidos demorados." />
        </Card>

        <Card
          titulo="Paquetes devueltos por día de la semana"
          nota="Cuántos paquetes volvieron al vendedor en cada día. Se cuenta el día en que se procesó la devolución."
        >
          <BarrasDevueltos datos={devueltosSemana} />
        </Card>

        <div className={estilos.grid2}>
          <Card
            titulo="Visitas antes de entregar o devolver"
            nota="Cuántas veces se pasó por el domicilio antes de cerrar el caso, separando los que terminaron entregados de los devueltos."
          >
            <BarrasVisitas datos={visitas} />
          </Card>

          <Card
            titulo="Hace cuánto que no se mueven los abiertos"
            nota="De los casos todavía sin resolver, cuántos días llevan sin ningún cambio de estado. Los de más de cuatro días son los que hay que empujar."
          >
            <AntiguedadTable filas={antiguedad} />
          </Card>
        </div>

        {noEntregados ? (
          <Callout tono="warning" titulo="Los que no se pudieron entregar">
            {numero(noEntregados.casos)} casos quedaron en «Pedido no entregado», el{" "}
            {porcentaje(noEntregados.porcentaje)} del mes. Son entregas fallidas todavía sin
            resolver: no volvieron al vendedor, pero tampoco llegaron.
          </Callout>
        ) : null}

        {sinVisita ? (
          <Callout tono="critical" titulo="Sin visita no hay entrega">
            Con cero visitas al domicilio, {numero(sinVisita.devueltos)} casos terminaron devueltos
            contra {numero(sinVisita.entregados)} entregados. Es la única variable del tablero que,
            por sí sola, decide el resultado del caso.
          </Callout>
        ) : null}

      </div>
    </>
  );
}
