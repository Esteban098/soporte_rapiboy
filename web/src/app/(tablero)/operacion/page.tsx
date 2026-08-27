import { cargarAyer } from "@/lib/datos";
import { cierre, noEntregadosPor, porEstado } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PedidosTable } from "@/components/PedidosTable";
import { ConteoTable } from "@/components/ConteoTable";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Ayer" };

export default async function Ayer() {
  const casos = await cargarAyer();
  const ayer = casos.pedidos;
  const estados = porEstado(ayer);
  const resolucion = cierre(ayer);
  const masFrecuente = estados[0];

  const porRepartidor = noEntregadosPor(ayer, "repartidor");
  const porPoligono = noEntregadosPor(ayer, "poligono");
  const porTienda = noEntregadosPor(ayer, "tienda");
  const sinEntregar = porRepartidor.reduce((total, f) => total + f.casos, 0);

  return (
    <>
      <PageHead
        eyebrow="Cola del día"
        titulo="Ayer"
        dek="Los casos de la pestaña Ayer: lo que quedó sin cerrar en la jornada anterior. El acumulado del mes está en Mes en curso."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos de ayer"
          valor={numero(ayer.length)}
          nota="arrastrados de la jornada anterior"
        />
        <Kpi
          etiqueta="Sin resolver"
          valor={numero(resolucion.abiertos)}
          tono={resolucion.abiertos > 0 ? "bad" : "good"}
          nota={`${porcentaje(resolucion.tasaApertura)} de la lista sigue abierta`}
        />
        <Kpi
          etiqueta="Sin entregar"
          valor={numero(sinEntregar)}
          tono={sinEntregar > 0 ? "bad" : "good"}
          nota="quedaron en «Pedido no entregado»"
        />
        <Kpi
          etiqueta="Estado más frecuente"
          valor={masFrecuente ? numero(masFrecuente.casos) : "—"}
          nota={masFrecuente ? `en ${masFrecuente.estado.toLowerCase()}` : "sin casos"}
        />
      </div>

      <div className={estilos.stack}>
        <Callout
          tono={resolucion.abiertos > 0 ? "critical" : "neutral"}
          titulo="Por dónde empezar el turno"
        >
          {ayer.length === 0
            ? "Ayer cerró sin casos abiertos. La cola arranca limpia."
            : `${numero(resolucion.abiertos)} casos de ayer siguen sin resolverse, y ${numero(sinEntregar)} quedaron directamente sin entregar.`}
        </Callout>

        <Card
          titulo="Casos de ayer"
          nota="El detalle completo de la pestaña Ayer. La columna «sin moverse» cuenta los días desde el último cambio de estado del paquete."
        >
          <PedidosTable id="ayer-casos" casos={casos} vacio="Ayer cerró sin casos abiertos." />
        </Card>

        <Card
          titulo="En qué estado quedaron"
          nota="Los casos de ayer agrupados por estado, con cuáles cuentan como resueltos."
        >
          <EstadosTable id="ayer-estados" filas={estados} />
        </Card>

        <Card
          titulo="Dónde se concentran los no entregados"
          nota="Los casos que quedaron en «Pedido no entregado», mirados por repartidor, zona y comercio. Sirve para ver si un día malo se explica por uno solo de los tres."
        >
          <div className={estilos.grid3}>
            <div>
              <h3 className={estilos.subtitulo}>Por repartidor</h3>
              <ConteoTable id="ayer-ne-repartidor" filas={porRepartidor} etiqueta="Repartidor" />
            </div>
            <div>
              <h3 className={estilos.subtitulo}>Por zona</h3>
              <ConteoTable id="ayer-ne-poligono" filas={porPoligono} etiqueta="Zona" />
            </div>
            <div>
              <h3 className={estilos.subtitulo}>Por comercio</h3>
              <ConteoTable id="ayer-ne-tienda" filas={porTienda} etiqueta="Comercio" />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
