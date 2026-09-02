import { cargarPedidos } from "@/lib/datos";
import {
  antiguedadAbiertos,
  cierre,
  demorados,
  devueltosPorDiaSemana,
  porEstado,
  visitasPorResultado,
  reclamos,
  resumen,
} from "@/lib/metricas";
import { mesEnCurso } from "@/lib/periodos";
import { mesLargo, numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PanelCasos } from "@/components/PanelCasos";
import { AntiguedadTable } from "@/components/AntiguedadTable";
import { BarrasVisitas } from "@/components/charts/BarrasVisitas";
import { BarrasDevueltos } from "@/components/charts/BarrasDevueltos";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Mes en curso" };

export default async function Resumen() {
  const todos = await cargarPedidos();

  /*
   * Solo el mes en curso. El resto sigue en la misma tabla y se mira desde
   * Histórico: no hay copia mensual ni limpieza, así que no existe un momento
   * del mes en que los datos puedan perderse en el traspaso.
   *
   * El corte es por fecha de creación, así que un caso entra a esta pantalla
   * el día que se creó y sale el 1° del mes siguiente aunque siga abierto. Los
   * que quedaron colgando del mes pasado se trabajan desde Demorados, que no
   * mira el mes.
   */
  const enCurso = mesEnCurso();
  const pedidos = todos.pedidos.filter((p) => p.mes === enCurso);
  const mes = { pedidos, campos: todos.campos };
  const deMesesAnteriores = todos.pedidos.length - pedidos.length;
  const atrasados = demorados(pedidos);
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
        eyebrow={`Mes en curso · ${mesLargo(enCurso)}`}
        titulo="Entregas fallidas mensual"
        flujo="global"
        dek={`${numero(total.casos)} casos acumulados en ${mesLargo(enCurso)}. Para ver solo lo que quedó pendiente del día anterior, entrá a Ayer. Se refiere a entregas que no se realizaron en el dia, que por algun inconveniente no cumplieron la promesa de entrega. `}
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
          valor={numero(atrasados.length)}
          tono={atrasados.length > 0 ? "bad" : "good"}
          nota="más de 2 días sin moverse y sin cerrar"
        />
        <Kpi
          etiqueta="Con datos de la tienda"
          valor={numero(tienda.conReclamo)}
          nota={`la tienda pasó algo con qué trabajar · ${numero(tienda.tipificadosSinDatos)} tipificados sin dato`}
        />
      </div>

      <div className={estilos.stack}>
        {pedidos.length === 0 ? (
          <Callout tono="warning" titulo={`Todavía no hay casos de ${mesLargo(enCurso)}`}>
            El mes recién empieza o la ingesta de hoy no corrió.{" "}
            {deMesesAnteriores > 0
              ? `Los ${numero(deMesesAnteriores)} casos de meses anteriores siguen guardados y se ven desde Histórico.`
              : "Todavía no hay ningún caso cargado en la base."}
          </Callout>
        ) : null}

        <Callout
          tono={resolucion.tasaApertura > 20 ? "critical" : "neutral"}
          titulo="Abiertos contra cerrados"
        >
          De los {numero(resolucion.total)} casos del mes, {numero(resolucion.cerrados)} están
          resueltos y {numero(resolucion.abiertos)} siguen en la cola. Un caso cierra cuando queda
          en Entregado, Devuelto o Siniestrado.
        </Callout>

        <Card
          titulo="Todos los estados"
          nota="Cada estado en el que puede quedar un caso, con cuántos hay y si cuenta como resuelto."
        >
          <EstadosTable id="mes-estados" titulo="Mes en curso · todos los estados" filas={estados} />
        </Card>

        <PanelCasos
          editable
          id="mes-casos"
          titulo="Casos del mes"
          nota="Todos los casos de la pestaña Mensual. Se busca por cualquier columna, se filtra por estado y caso, y se ordena por cualquier encabezado."
          casos={mes}
          vacio="Todavía no hay casos cargados este mes."
        />

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
            <AntiguedadTable id="mes-antiguedad" titulo="Antigüedad de los casos abiertos" filas={antiguedad} />
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
