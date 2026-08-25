import { cargarPedidos } from "@/lib/datos";
import { dispersionRepartidores, ranking, resumen, UMBRAL_CRITICO } from "@/lib/metricas";
import { decimal, numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { RankingTable } from "@/components/RankingTable";
import { DispersionRepartidores } from "@/components/charts/DispersionRepartidores";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Repartidores" };

/** Volumen mínimo para que un repartidor entre en los rankings. */
const MINIMO_CASOS = 200;

export default async function Repartidores() {
  const pedidos = await cargarPedidos();
  const total = resumen(pedidos);
  const dispersion = dispersionRepartidores(pedidos, MINIMO_CASOS);

  const peores = ranking(pedidos, "repartidor", { minimoCasos: MINIMO_CASOS, limite: 12 });
  const mejores = ranking(pedidos, "repartidor", {
    minimoCasos: MINIMO_CASOS,
    limite: 8,
    orden: "mejores",
  });

  const correlacion = correlacionVisitas(dispersion.puntos);

  return (
    <>
      <PageHead
        eyebrow="Desempeño individual"
        titulo="Repartidores"
        dek={`${numero(dispersion.evaluados)} repartidores con ${MINIMO_CASOS} casos o más. La comparación es válida porque todos trabajan sobre el mismo tipo de zonas y el mismo mix de comercios.`}
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Mediana del equipo"
          valor={porcentaje(dispersion.mediana)}
          nota="tasa de devolución del repartidor típico"
        />
        <Kpi
          etiqueta="En revisión"
          valor={numero(dispersion.criticos)}
          tono="bad"
          nota={`superan el ${UMBRAL_CRITICO}% de devolución`}
        />
        <Kpi
          etiqueta="Casos que concentran"
          valor={numero(dispersion.casosCriticos)}
          nota={`${porcentaje((dispersion.casosCriticos / total.casos) * 100)} de todo el volumen`}
        />
        <Kpi
          etiqueta="Devoluciones evitables"
          valor={numero(dispersion.devolucionesEvitables)}
          tono="bad"
          nota="si los críticos llegaran a la mediana"
        />
      </div>

      <div className={estilos.stack}>
        <Card
          titulo="Cada punto es un repartidor"
          nota="Eje horizontal: visitas promedio por caso. Eje vertical: porcentaje de casos devueltos. El tamaño del punto es el volumen gestionado."
        >
          <DispersionRepartidores
            datos={dispersion.puntos}
            umbralCritico={UMBRAL_CRITICO}
            mediana={dispersion.mediana}
          />
        </Card>

        {correlacion != null ? (
          <Callout tono="warning" titulo="Los que más devuelven son los que menos visitan">
            La correlación entre tasa de devolución y visitas promedio es {decimal(correlacion)}. No
            es un problema de zonas difíciles: es cantidad de intentos. Antes de mover a nadie de
            ruta, conviene mirar por qué esos casos se cierran con tan pocas visitas.
          </Callout>
        ) : null}

        <Card
          titulo="Mayor tasa de devolución"
          nota="Ordenado por porcentaje de casos devueltos. La columna de visitas casi siempre explica el resto."
        >
          <RankingTable filas={peores} etiquetaDimension="Repartidor" />
        </Card>

        <Card
          titulo="Referencia del equipo"
          nota="Mismo tipo de zonas y volumen comparable, con tasas muy por debajo de la mediana. Son la prueba de que el techo no lo pone la geografía."
        >
          <RankingTable
            filas={mejores}
            etiquetaDimension="Repartidor"
          />
        </Card>
      </div>
    </>
  );
}

/** Correlación de Pearson entre visitas promedio y tasa de devolución. */
function correlacionVisitas(
  puntos: { visitasPromedio: number; tasaDevolucion: number }[],
): number | null {
  if (puntos.length < 3) return null;

  const n = puntos.length;
  const mediaX = puntos.reduce((a, p) => a + p.visitasPromedio, 0) / n;
  const mediaY = puntos.reduce((a, p) => a + p.tasaDevolucion, 0) / n;

  let covarianza = 0;
  let varX = 0;
  let varY = 0;
  for (const punto of puntos) {
    const dx = punto.visitasPromedio - mediaX;
    const dy = punto.tasaDevolucion - mediaY;
    covarianza += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return null;
  return covarianza / Math.sqrt(varX * varY);
}
