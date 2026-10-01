import { cargarAyer } from "@/lib/datos";
import { cierre, noEntregadosPor, porEstado } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PanelCasos } from "@/components/PanelCasos";
import { ConteoTable } from "@/components/ConteoTable";
import estilos from "@/components/ui.module.css";
import { modoDatos } from "@/lib/config";
import { diaDePaquetes, diaOperativoAnterior } from "@/lib/tracker";
import { leerTracker, type DatosDelTracker } from "@/lib/tracker-datos";

export const metadata = { title: "Última jornada" };

export default async function Ayer() {
  const [casos, tracker] = await Promise.all([
    cargarAyer(),
    modoDatos() === "supabase"
      ? leerTracker(diaOperativoAnterior(diaDePaquetes())).catch((error) => {
          // El resumen mejora Ayer, pero una tabla de tracker ausente no puede
          // impedir abrir la cola que viene de la ingesta diaria.
          console.error("No se pudo leer el resumen de ruta para Ayer", error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const ayer = casos.pedidos;
  const estados = porEstado(ayer);
  const resolucion = cierre(ayer);

  const porRepartidor = noEntregadosPor(ayer, "repartidor");
  const porPoligono = noEntregadosPor(ayer, "poligono");
  const porTienda = noEntregadosPor(ayer, "tienda");
  const sinEntregar = porRepartidor.reduce((total, f) => total + f.casos, 0);

  return (
    <>
      <PageHead
        eyebrow="Cola del día"
        titulo="Última jornada"
        flujo="global"
        dek="Los casos que entraron nuevos en la jornada anterior: los que no estaban ya en Mensual ni en Cancelados. Un caso aparece acá una sola vez, el día que falló por primera vez; si sigue abierto después, se lo sigue en Mes en curso."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos de la jornada"
          valor={numero(ayer.length)}
          nota="entraron nuevos en la jornada anterior"
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
          tono="bad"
          relleno
          nota="quedaron en «Pedido no entregado»"
        />
        <Kpi
          etiqueta="Paquetes Cerrados"
          valor={numero(resolucion.cerrados)}
          tono="good"
          relleno
          nota={`${porcentaje(resolucion.tasaCierre)} de los casos de la jornada`}
        />
      </div>

      <div className={estilos.stack}>
        {tracker ? <PulsoRuta datos={tracker} /> : null}

        <Callout
          tono={resolucion.abiertos > 0 ? "critical" : "neutral"}
          titulo="Por dónde empezar el turno"
        >
          {ayer.length === 0
            ? "La última jornada cerró sin casos abiertos. La cola arranca limpia."
            : `${numero(resolucion.abiertos)} casos de la última jornada siguen sin resolverse, y ${numero(sinEntregar)} quedaron directamente sin entregar.`}
        </Callout>

        <PanelCasos
          id="ayer-casos"
          titulo="Casos de la última jornada"
          nota="Los casos nuevos de la jornada anterior. La columna «Sin mov» cuenta los días desde el último cambio de estado del paquete."
          tituloGrafico="Cómo se reparten los casos de la última jornada"
          casos={casos}
          vacio="La última jornada cerró sin casos abiertos."
        />

        <Card
          titulo="En qué estado quedaron"
          nota="Los casos de la última jornada agrupados por estado, con cuáles cuentan como resueltos."
        >
          <EstadosTable id="ayer-estados" titulo="Última jornada · en qué estado quedaron" filas={estados} />
        </Card>

        <Card
          titulo="Dónde se concentran los no entregados"
          nota="Los casos que quedaron en «Pedido no entregado», mirados por repartidor, zona y comercio. Sirve para ver si un día malo se explica por uno solo de los tres."
        >
          <div className={estilos.grid3}>
            <div>
              <h3 className={estilos.subtitulo}>Por repartidor</h3>
              <ConteoTable id="ayer-ne-repartidor" titulo="No entregados por repartidor" filas={porRepartidor} etiqueta="Repartidor" />
            </div>
            <div>
              <h3 className={estilos.subtitulo}>Por zona</h3>
              <ConteoTable id="ayer-ne-poligono" titulo="No entregados por zona" filas={porPoligono} etiqueta="Zona" />
            </div>
            <div>
              <h3 className={estilos.subtitulo}>Por comercio</h3>
              <ConteoTable id="ayer-ne-tienda" titulo="No entregados por comercio" filas={porTienda} etiqueta="Comercio" tiendas />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Foto compacta de la ruta cerrada: las mismas clasificaciones del tracker. */
function PulsoRuta({ datos }: { datos: DatosDelTracker }) {
  const paquetes = [...datos.drivers.flatMap((driver) => driver.paquetes), ...datos.huerfanos];
  const entregados = paquetes.filter((paquete) => paquete.clasificacion === "VISITADO_ENTREGADO").length;
  const noEntregados = paquetes.filter((paquete) => paquete.clasificacion === "VISITADO_NO_ENTREGADO").length;
  /* `PROXIMO` es también un paquete sin visita: solo se distingue en el mapa
     para resaltar la siguiente parada del recorrido. */
  const noVisitados = paquetes.filter(
    (paquete) =>
      paquete.clasificacion === "PENDIENTE_NO_VISITADO" ||
      paquete.clasificacion === "PROXIMO",
  ).length;
  const total = paquetes.length;
  const sla = total ? Math.round((entregados * 100) / total) : 0;

  return (
    <Card
      titulo="Resumen ruta última jornada"
      nota={`Resumen de la jornada ${datos.dia}, con la misma foto que usa Live tracker.`}
    >
      <div className={estilos.kpis}>
        <Kpi etiqueta="Total de la jornada" valor={numero(total)} nota="paquetes de ayer" />
        <Kpi etiqueta="Entregados" valor={numero(entregados)} nota="visitas entregadas" tono="good" relleno />
        <Kpi etiqueta="No entregados" valor={numero(noEntregados)} nota="visitas no entregadas" tono={noEntregados ? "bad" : "good"} />
        <Kpi etiqueta="No visitados" valor={numero(noVisitados)} nota="sin visita registrada" tono={noVisitados ? "warning" : "good"} />
        <Kpi etiqueta="SLA" valor={`${sla}%`} nota="entregados sobre el total" tono={sla >= 95 ? "good" : sla >= 80 ? "warning" : "bad"} />
      </div>
    </Card>
  );
}
