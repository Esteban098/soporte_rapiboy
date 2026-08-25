import { cargarVistasDelDia } from "@/lib/datos";
import { cierre, porEstado } from "@/lib/metricas";
import { numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PedidosTable } from "@/components/PedidosTable";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Ayer" };

export default async function Operacion() {
  const { ayer, demorados, demoradosNoEntregados } = await cargarVistasDelDia();

  const estadosAyer = porEstado(ayer);
  const resolucionAyer = cierre(ayer);
  const quietos = demorados.filter((p) => diasDesde(p.ultimoMovimiento) > 2).length;

  return (
    <>
      <PageHead
        eyebrow="Cola del día"
        titulo="Ayer"
        dek="Los casos de la pestaña Ayer del libro: lo que quedó sin cerrar en la jornada anterior. Abajo, los demorados. El acumulado del mes está en Mes en curso."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Abiertos de ayer"
          valor={numero(resolucionAyer.abiertos)}
          tono={resolucionAyer.abiertos > 0 ? "bad" : "good"}
          nota="cerraron el día sin resolverse"
        />
        <Kpi
          etiqueta="Demorados"
          valor={numero(demorados.length)}
          tono={demorados.length > 0 ? "bad" : "good"}
          nota="pasaron su fecha y siguen abiertos"
        />
        <Kpi
          etiqueta="Quietos"
          valor={numero(quietos)}
          tono={quietos > 0 ? "bad" : "good"}
          nota="más de 2 días sin ningún cambio de estado"
        />
        <Kpi
          etiqueta="Sin entregar"
          valor={numero(demoradosNoEntregados.length)}
          tono={demoradosNoEntregados.length > 0 ? "bad" : "good"}
          nota="demorados que además están sin entregar"
        />
      </div>

      <div className={estilos.stack}>
        <Callout tono={quietos > 0 ? "critical" : "neutral"} titulo="Por dónde empezar el turno">
          {demorados.length === 0
            ? "No hay pedidos demorados. La cola del día arranca limpia."
            : `${numero(demorados.length)} pedidos están demorados y ${numero(quietos)} llevan más de dos días sin moverse. Esos son los que hay que tocar primero.`}
        </Callout>

        <Card
          titulo="Casos de ayer"
          nota="El detalle completo de la pestaña Ayer. La columna «sin moverse» cuenta los días desde el último cambio de estado del paquete."
        >
          <PedidosTable pedidos={ayer} vacio="Ayer cerró sin casos abiertos." />
        </Card>

        <Card
          titulo="En qué estado quedaron"
          nota="Los casos de ayer agrupados por estado, con cuáles cuentan como resueltos."
        >
          <EstadosTable filas={estadosAyer} />
        </Card>

        <Card
          titulo="Demorados"
          nota="Prioridad del día. La columna «sin moverse» cuenta los días desde el último cambio de estado del paquete."
        >
          <PedidosTable pedidos={demorados} vacio="No hay pedidos demorados. Buen día." />
        </Card>

        <Card
          titulo="Demorados sin entregar"
          nota="El recorte más fino: demorados que además siguen en «Pedido no entregado»."
        >
          <PedidosTable
            pedidos={demoradosNoEntregados}
            vacio="Ningún demorado quedó sin entregar."
          />
        </Card>

      </div>
    </>
  );
}

function diasDesde(fecha: Date | null): number {
  if (!fecha) return 0;
  return Math.floor((Date.now() - fecha.getTime()) / (24 * 60 * 60 * 1000));
}
