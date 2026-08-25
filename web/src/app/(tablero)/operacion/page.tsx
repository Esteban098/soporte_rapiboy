import { cargarVistasDelDia } from "@/lib/datos";
import { numero } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Card, Kpi } from "@/components/Card";
import { PedidosTable } from "@/components/PedidosTable";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Operación del día" };

export default async function Operacion() {
  const { ayer, demorados, demoradosNoEntregados } = await cargarVistasDelDia();

  const porEstado = new Map<string, number>();
  for (const pedido of ayer) {
    porEstado.set(pedido.estado, (porEstado.get(pedido.estado) ?? 0) + 1);
  }
  const estados = [...porEstado.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHead
        eyebrow="Cola de trabajo"
        titulo="Operación del día"
        dek="Las tres vistas que el equipo vuelve a pegar cada mañana: lo que quedó abierto ayer, lo que ya pasó su fecha y lo que sigue sin entregarse."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Abiertos de ayer"
          valor={numero(ayer.length)}
          nota="casos que cerraron el día sin resolverse"
        />
        <Kpi
          etiqueta="Demorados"
          valor={numero(demorados.length)}
          tono={demorados.length > 0 ? "bad" : "good"}
          nota="pasaron su fecha programada y siguen abiertos"
        />
        <Kpi
          etiqueta="Sin entregar"
          valor={numero(demoradosNoEntregados.length)}
          tono={demoradosNoEntregados.length > 0 ? "bad" : "good"}
          nota="demorados que además están como no entregados"
        />
        <Kpi
          etiqueta="Estado más frecuente"
          valor={estados[0] ? String(estados[0][1]) : "—"}
          nota={estados[0] ? `en ${estados[0][0].toLowerCase()}` : "sin casos abiertos"}
        />
      </div>

      <div className={estilos.stack}>
        <Card
          titulo="Demorados"
          nota="Prioridad del día: cada uno pasó su fecha comprometida. El semáforo usa el mismo criterio que la columna DEMORA de la planilla."
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

        <Card
          titulo="Abiertos de ayer"
          nota="Lo que quedó sin cerrar al final del día anterior. Es el punto de partida del turno."
        >
          <PedidosTable pedidos={ayer} vacio="Ayer cerró sin casos abiertos." />
        </Card>
      </div>
    </>
  );
}
