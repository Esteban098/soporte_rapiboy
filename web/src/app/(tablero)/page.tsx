import { cargarDemorados, cargarPedidos } from "@/lib/datos";
import {
  antiguedadAbiertos,
  cierre,
  dispersionRepartidores,
  porDia,
  porEstado,
  porVisitas,
  reclamos,
  resumen,
} from "@/lib/metricas";
import { diaCorto, mesLargo, numero, porcentaje, puntos } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PedidosTable } from "@/components/PedidosTable";
import { AntiguedadTable } from "@/components/AntiguedadTable";
import { BarrasSerie } from "@/components/charts/BarrasSerie";
import { LineaSerie } from "@/components/charts/LineaSerie";
import { BarrasTramo } from "@/components/charts/BarrasTramo";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Mes en curso" };

export default async function Resumen() {
  const [pedidos, demorados] = await Promise.all([cargarPedidos(), cargarDemorados()]);
  const total = resumen(pedidos);
  const resolucion = cierre(pedidos);
  const estados = porEstado(pedidos);
  const tienda = reclamos(pedidos);
  const dias = porDia(pedidos);
  const visitas = porVisitas(pedidos);
  const antiguedad = antiguedadAbiertos(pedidos);
  const dispersion = dispersionRepartidores(pedidos);

  const ultimo = dias.at(-1);
  const anterior = dias.at(-2);
  const delta = ultimo && anterior ? ultimo.tasaDevolucion - anterior.tasaDevolucion : null;
  const sinVisita = visitas.find((v) => v.tramo === "0");
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
          titulo="Movimientos por día"
          nota="Cada barra son los casos que cambiaron de estado ese día: entregas, devoluciones, ingresos a depósito. Los valles son domingos."
        >
          <BarrasSerie datos={dias} escala="dia" />
        </Card>

        <Card
          titulo="Tasa de devolución por día"
          nota="De los casos que se movieron cada día, qué porcentaje quedó en devolución. La línea gris es el promedio del mes."
        >
          <LineaSerie datos={dias} promedio={total.tasaDevolucion} escala="dia" />
        </Card>

        <div className={estilos.grid2}>
          <Card
            titulo="Resultado según visitas"
            nota="Cuántas veces el repartidor pasó por el domicilio antes de cerrar el caso. La segunda visita es la que más pedidos salva."
          >
            <BarrasTramo datos={visitas} etiquetaTramo="Visitas" destacarSobre={50} />
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
            {numero(sinVisita.casos)} casos se cerraron con cero visitas al domicilio y{" "}
            {porcentaje(sinVisita.tasaDevolucion)} de ellos terminó devuelto. Es la única variable
            del tablero que, por sí sola, decide el resultado del caso.
          </Callout>
        ) : null}

        <Callout tono="warning" titulo="La brecha entre repartidores es lo más accionable">
          Entre los {numero(dispersion.evaluados)} repartidores con volumen suficiente, la mediana
          de devolución es {porcentaje(dispersion.mediana)}. Los {numero(dispersion.criticos)} que
          superan el 25% concentran {numero(dispersion.casosCriticos)} casos: llevarlos a la mediana
          evitaría {numero(dispersion.devolucionesEvitables)} devoluciones sin tocar nada más de la
          operación.
        </Callout>

        {delta != null && ultimo ? (
          <Callout titulo={`Último día con datos: ${diaCorto(ultimo.clave)}`}>
            {numero(ultimo.casos)} casos con {porcentaje(ultimo.tasaDevolucion)} de devolución,{" "}
            {puntos(delta)} contra el día anterior.
          </Callout>
        ) : null}
      </div>
    </>
  );
}
