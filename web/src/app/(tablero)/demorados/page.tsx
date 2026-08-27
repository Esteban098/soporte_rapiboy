import { cargarDemorados, cargarDemoradosNoEntregados } from "@/lib/datos";
import { cierre, porEstado } from "@/lib/metricas";
import { numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PedidosTable } from "@/components/PedidosTable";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Demorados" };

export default async function Demorados() {
  const [casosDemorados, casosSinEntregar] = await Promise.all([
    cargarDemorados(),
    cargarDemoradosNoEntregados(),
  ]);
  const demorados = casosDemorados.pedidos;
  const sinEntregar = casosSinEntregar.pedidos;

  const estados = porEstado(demorados);
  const resolucion = cierre(demorados);
  const quietos = demorados.filter((p) => diasDesde(p.ultimoMovimiento) > 2).length;
  const masViejo = demorados.reduce(
    (peor, p) => Math.max(peor, diasDesde(p.ultimoMovimiento)),
    0,
  );

  return (
    <>
      <PageHead
        eyebrow="Cola de escalamiento"
        titulo="Demorados"
        dek="Los casos de las pestañas Demorados y DemoradoNoEntregado: lo que pasó su fecha y no se resolvió por el flujo normal."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Demorados"
          valor={numero(demorados.length)}
          tono={demorados.length > 0 ? "bad" : "good"}
          nota="pasaron su fecha y siguen abiertos"
        />
        <Kpi
          etiqueta="Sin entregar"
          valor={numero(sinEntregar.length)}
          tono={sinEntregar.length > 0 ? "bad" : "good"}
          nota="demorados que además están sin entregar"
        />
        <Kpi
          etiqueta="Quietos"
          valor={numero(quietos)}
          tono={quietos > 0 ? "bad" : "good"}
          nota="más de 2 días sin ningún cambio de estado"
        />
        <Kpi
          etiqueta="El más viejo"
          valor={masViejo > 0 ? `${numero(masViejo)} d` : "—"}
          tono={masViejo > 7 ? "bad" : "neutral"}
          nota="días sin moverse del caso más rezagado"
        />
      </div>

      <div className={estilos.stack}>
        <Callout tono={quietos > 0 ? "critical" : "neutral"} titulo="Por dónde empezar">
          {demorados.length === 0
            ? "No hay pedidos demorados. La cola de escalamiento está limpia."
            : `${numero(demorados.length)} pedidos están demorados y ${numero(quietos)} llevan más de dos días sin moverse. Ordená por «sin moverse» para atacar los más rezagados primero.`}
        </Callout>

        <Card
          titulo="Demorados"
          nota="Todos los casos de la pestaña Demorados. Se puede filtrar por estado y ordenar por cualquier columna."
        >
          <PedidosTable casos={casosDemorados} vacio="No hay pedidos demorados." />
        </Card>

        <Card
          titulo="Demorados sin entregar"
          nota="El recorte más fino: los que además siguen sin entregarse."
        >
          <PedidosTable
            casos={casosSinEntregar}
            vacio="Ningún demorado quedó sin entregar."
          />
        </Card>

        <Card
          titulo="En qué estado están los demorados"
          nota={`Los ${numero(demorados.length)} casos agrupados por estado. ${numero(resolucion.abiertos)} siguen abiertos.`}
        >
          <EstadosTable filas={estados} />
        </Card>
      </div>
    </>
  );
}

function diasDesde(fecha: Date | null): number {
  if (!fecha) return 0;
  return Math.floor((Date.now() - fecha.getTime()) / (24 * 60 * 60 * 1000));
}
