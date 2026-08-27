import { cargarAyer } from "@/lib/datos";
import { cierre, porEstado } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { PedidosTable } from "@/components/PedidosTable";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Ayer" };

export default async function Ayer() {
  const casos = await cargarAyer();
  const ayer = casos.pedidos;
  const estados = porEstado(ayer);
  const resolucion = cierre(ayer);
  const quietos = ayer.filter((p) => diasDesde(p.ultimoMovimiento) > 2).length;
  const masFrecuente = estados[0];

  return (
    <>
      <PageHead
        eyebrow="Cola del día"
        titulo="Ayer"
        dek="Los casos de la pestaña Ayer del libro: lo que quedó sin cerrar en la jornada anterior. El acumulado del mes está en Mes en curso."
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
          etiqueta="Quietos"
          valor={numero(quietos)}
          tono={quietos > 0 ? "bad" : "good"}
          nota="más de 2 días sin ningún cambio de estado"
        />
        <Kpi
          etiqueta="Estado más frecuente"
          valor={masFrecuente ? numero(masFrecuente.casos) : "—"}
          nota={masFrecuente ? `en ${masFrecuente.estado.toLowerCase()}` : "sin casos"}
        />
      </div>

      <div className={estilos.stack}>
        <Callout tono={quietos > 0 ? "critical" : "neutral"} titulo="Por dónde empezar el turno">
          {ayer.length === 0
            ? "Ayer cerró sin casos abiertos. La cola arranca limpia."
            : `${numero(resolucion.abiertos)} casos de ayer siguen sin resolverse y ${numero(quietos)} llevan más de dos días sin moverse. Esos son los que hay que tocar primero.`}
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
      </div>
    </>
  );
}

function diasDesde(fecha: Date | null): number {
  if (!fecha) return 0;
  return Math.floor((Date.now() - fecha.getTime()) / (24 * 60 * 60 * 1000));
}
