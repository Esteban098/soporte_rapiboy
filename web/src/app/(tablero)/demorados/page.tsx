import { cargarPedidos } from "@/lib/datos";
import { DIAS_PARA_DEMORA, demorados, diasSinMovimiento, porEstado } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PedidosTable } from "@/components/PedidosTable";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Demorados" };

export default async function Demorados() {
  const mes = await cargarPedidos();
  const atrasados = demorados(mes.pedidos);

  const estados = porEstado(atrasados);
  const dias = atrasados.map((pedido) => diasSinMovimiento(pedido) ?? 0);
  const masViejo = dias.reduce((peor, d) => Math.max(peor, d), 0);
  const unaSemana = dias.filter((d) => d > 7).length;
  const sinEntregar = atrasados.filter(
    (pedido) => pedido.estado.toLowerCase() === "pedido no entregado",
  ).length;

  return (
    <>
      <PageHead
        eyebrow="Cola de escalamiento"
        titulo="Demorados"
        dek={`Los casos del mes que llevan más de ${DIAS_PARA_DEMORA} días sin ningún cambio de estado y todavía no cerraron. Se calculan sobre la pestaña Mensual, así que la lista está siempre al día.`}
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Demorados"
          valor={numero(atrasados.length)}
          tono={atrasados.length > 0 ? "bad" : "good"}
          nota={`${porcentaje((atrasados.length / (mes.pedidos.length || 1)) * 100)} de los casos del mes`}
        />
        <Kpi
          etiqueta="Sin entregar"
          valor={numero(sinEntregar)}
          tono={sinEntregar > 0 ? "bad" : "good"}
          nota="demorados que además están sin entregar"
        />
        <Kpi
          etiqueta="Más de una semana"
          valor={numero(unaSemana)}
          tono={unaSemana > 0 ? "bad" : "good"}
          nota="llevan más de 7 días parados"
        />
        <Kpi
          etiqueta="El más viejo"
          valor={masViejo > 0 ? `${numero(masViejo)} d` : "—"}
          tono={masViejo > 7 ? "bad" : "neutral"}
          nota="días sin moverse del caso más rezagado"
        />
      </div>

      <div className={estilos.stack}>
        <Callout tono={atrasados.length > 0 ? "critical" : "neutral"} titulo="Por dónde empezar">
          {atrasados.length === 0
            ? "No hay casos demorados. La cola de escalamiento está limpia."
            : `${numero(atrasados.length)} casos llevan más de ${DIAS_PARA_DEMORA} días sin moverse y siguen abiertos. Vienen ordenados del más viejo al más nuevo: los de arriba son los que más tiempo llevan parados.`}
        </Callout>

        <Card
          titulo="Casos demorados"
          nota="Los mismos datos de Mes en curso, acotados a los que están frenados. Se busca por cualquier columna, se filtra por estado y se ordena por cualquier encabezado."
        >
          <PedidosTable
            id="demorados-casos"
            titulo="Casos demorados"
            casos={{ pedidos: atrasados, campos: mes.campos }}
            vacio="No hay casos demorados."
          />
        </Card>

        <Card
          titulo="En qué estado están frenados"
          nota="Dónde se traban los casos que no avanzan. Es la lectura que dice qué hay que destrabar, más que cuántos hay."
        >
          <EstadosTable id="demorados-estados" titulo="Demorados · en qué estado están" filas={estados} />
        </Card>
      </div>
    </>
  );
}
