import { cargarPedidos } from "@/lib/datos";
import { ranking, resumen } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { RankingTable } from "@/components/RankingTable";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Comercios y zonas" };

const MINIMO_CASOS = 200;

export default async function Comercios() {
  const pedidos = await cargarPedidos();
  const total = resumen(pedidos);

  const tiendasVolumen = ranking(pedidos, "tienda", { minimoCasos: 1, limite: 10, orden: "volumen" });
  const tiendasPeores = ranking(pedidos, "tienda", { minimoCasos: MINIMO_CASOS, limite: 10 });
  const zonasPeores = ranking(pedidos, "poligono", { minimoCasos: MINIMO_CASOS, limite: 10 });
  const zonasVolumen = ranking(pedidos, "poligono", { minimoCasos: 1, limite: 10, orden: "volumen" });

  const concentracion = concentracionDevoluciones(pedidos.filter((p) => p.devuelto).map((p) => p.tienda));

  return (
    <>
      <PageHead
        eyebrow="Origen y destino"
        titulo="Comercios y zonas"
        dek="De dónde salen los casos y a dónde van. Sirve para separar los problemas de dirección en el alta del pedido de los problemas de reparto en la calle."
      />

      <div className={estilos.kpis}>
        <Kpi etiqueta="Comercios activos" valor={numero(contarDistintos(pedidos.map((p) => p.tienda)))} nota="con al menos un caso en el período" />
        <Kpi etiqueta="Zonas de reparto" valor={numero(contarDistintos(pedidos.map((p) => p.poligono)))} nota="polígonos con casos registrados" />
        <Kpi
          etiqueta="Concentración"
          valor={porcentaje(concentracion)}
          nota="de las devoluciones sale del 20% de los comercios"
        />
        <Kpi
          etiqueta="Tasa general"
          valor={porcentaje(total.tasaDevolucion)}
          nota="referencia para leer las tablas de abajo"
        />
      </div>

      <div className={estilos.stack}>
        <Callout titulo="La zona pesa menos que el comercio y el repartidor">
          El rango entre la mejor y la peor zona es mucho más estrecho que el que hay entre
          repartidores. Cuando una zona aparece arriba en esta lista, casi siempre es porque un
          comercio o un repartidor concentran su volumen ahí.
        </Callout>

        <div className={estilos.grid2}>
          <Card
            titulo="Comercios con mayor devolución"
            nota={`Solo comercios con ${MINIMO_CASOS} casos o más. Un porcentaje alto suele indicar direcciones o teléfonos incompletos en el alta.`}
          >
            <RankingTable filas={tiendasPeores} etiquetaDimension="Comercio" />
          </Card>

          <Card
            titulo="Comercios por volumen"
            nota="Los que más casos generan. Sirve para dimensionar el impacto: un punto de mejora acá vale más que en la lista de al lado."
          >
            <RankingTable filas={tiendasVolumen} etiquetaDimension="Comercio" />
          </Card>
        </div>

        <div className={estilos.grid2}>
          <Card
            titulo="Zonas con mayor devolución"
            nota={`Polígonos con ${MINIMO_CASOS} casos o más, ordenados por porcentaje de devolución.`}
          >
            <RankingTable filas={zonasPeores} etiquetaDimension="Zona" />
          </Card>

          <Card
            titulo="Zonas por volumen"
            nota="Dónde se concentra la operación. Los nombres salen tal cual están cargados en el sheet."
          >
            <RankingTable filas={zonasVolumen} etiquetaDimension="Zona" />
          </Card>
        </div>
      </div>
    </>
  );
}

function contarDistintos(valores: string[]): number {
  return new Set(valores.filter(Boolean)).size;
}

/** Qué porcentaje de las devoluciones aporta el 20% de comercios más pesado. */
function concentracionDevoluciones(tiendas: string[]): number {
  const conteo = new Map<string, number>();
  for (const tienda of tiendas) {
    if (!tienda) continue;
    conteo.set(tienda, (conteo.get(tienda) ?? 0) + 1);
  }
  if (conteo.size === 0) return 0;

  const orden = [...conteo.values()].sort((a, b) => b - a);
  const total = orden.reduce((a, b) => a + b, 0);
  const corte = Math.max(1, Math.round(orden.length * 0.2));
  const cabeza = orden.slice(0, corte).reduce((a, b) => a + b, 0);
  return (cabeza / total) * 100;
}
