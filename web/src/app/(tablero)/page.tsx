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
import { mesesOperativos } from "@/lib/periodos";
import { mesLargo, numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PanelCasos } from "@/components/PanelCasos";
import { AntiguedadTable } from "@/components/AntiguedadTable";
import { BarrasVisitas } from "@/components/charts/BarrasVisitas";
import { BarrasDevueltos } from "@/components/charts/BarrasDevueltos";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Mensual" };

export default async function Resumen() {
  const todos = await cargarPedidos();

  // Del 1 al 9 conviven el mes anterior y el actual. Desde el día 10, la
  // rotación ya llevó el anterior a `mensual_historico` y queda solo el actual.
  const periodos = mesesOperativos();
  const pedidos = todos.pedidos.filter((p) => periodos.includes(p.mes));
  const mes = { pedidos, campos: todos.campos };
  const fueraDeOperacion = todos.pedidos.length - pedidos.length;
  const periodo = periodos.map(mesLargo).join(" y ");
  const hayMesAnterior = periodos.length === 2;
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
        eyebrow={`Mensual · ${periodo}`}
        titulo="Entregas fallidas mensual"
        flujo="global"
        dek={`${numero(total.casos)} casos acumulados en ${periodo}. ${hayMesAnterior ? "Hasta el día 9 se muestran juntos el mes anterior y el actual; el día 10 el anterior pasa a Histórico. " : "Los períodos anteriores ya están en Histórico. "}Para ver solo lo pendiente de la jornada anterior, entrá a Ayer.`}
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos abiertos"
          valor={numero(resolucion.abiertos)}
          tono="bad"
          nota={`${porcentaje(resolucion.tasaApertura)} del período sigue sin resolverse`}
        />
        <Kpi
          etiqueta="Casos cerrados"
          valor={porcentaje(resolucion.tasaCierre)}
          tono="good"
          nota={`${numero(resolucion.cerrados)} casos resueltos`}
        />
        <Kpi
          etiqueta="Casos del período"
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
          <Callout tono="warning" titulo={`Todavía no hay casos de ${periodo}`}>
            El período recién empieza o la ingesta de hoy no corrió.{" "}
            {fueraDeOperacion > 0
              ? `Hay ${numero(fueraDeOperacion)} casos fuera de la ventana operativa; revisá que la rotación a Histórico esté activa.`
              : "Todavía no hay ningún caso cargado en la base."}
          </Callout>
        ) : null}

        <Callout
          tono={resolucion.tasaApertura > 20 ? "critical" : "neutral"}
          titulo="Abiertos contra cerrados"
        >
          De los {numero(resolucion.total)} casos del período, {numero(resolucion.cerrados)} están
          resueltos y {numero(resolucion.abiertos)} siguen en la cola. Un caso cierra cuando queda
          en Entregado, Devuelto o Siniestrado.
        </Callout>

        <Card
          titulo="Todos los estados"
          nota="Cada estado en el que puede quedar un caso, con cuántos hay y si cuenta como resuelto."
        >
          <EstadosTable id="mes-estados" titulo="Mensual · todos los estados" filas={estados} />
        </Card>

        <PanelCasos
          editable
          id="mes-casos"
          titulo="Casos del período operativo"
          nota="Todos los casos de Mensual. Del 1 al 9 incluye el mes anterior; desde el 10 queda solo el actual."
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
            {porcentaje(noEntregados.porcentaje)} del período. Son entregas fallidas todavía sin
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
