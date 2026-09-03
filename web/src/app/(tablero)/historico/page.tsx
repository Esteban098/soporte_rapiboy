import { cargarPedidosHistoricos } from "@/lib/datos";
import { cierre, desenlaces, porMes, reclamos } from "@/lib/metricas";
import {
  enRango,
  mesesDelRango,
  mesesDisponibles,
  mesEnCurso,
  resolverRango,
} from "@/lib/periodos";
import { mesCorto, mesLargo, numero, porcentaje, puntos } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { Tabla } from "@/components/Tabla";
import { PanelCasos } from "@/components/PanelCasos";
import { SelectorMeses } from "@/components/SelectorMeses";
import { BarrasMeses } from "@/components/charts/BarrasMeses";
import { LineasEntrega } from "@/components/charts/LineasEntrega";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Histórico" };

/**
 * Los meses ya cerrados.
 *
 * Lee `mensual_historico`, separada físicamente de la tabla operativa. Lo único
 * que cambia con el tiempo es en qué estado terminó cada caso, y para eso está
 * el botón de esta pantalla, que actualiza solo el período seleccionado.
 */
export default async function Historico({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { pedidos, campos } = await cargarPedidosHistoricos();
  const disponibles = mesesDisponibles(pedidos.map((p) => p.mes));
  const rango = resolverRango(await searchParams, disponibles);

  if (!rango) {
    return (
      <>
        <PageHead
          eyebrow="Meses cerrados"
          titulo="Histórico"
          dek="Los casos de cada mes, con el estado en el que quedaron."
        />
        <Callout tono="warning" titulo="Todavía no hay meses cargados">
          El histórico se llena cuando la rotación mueve un período cerrado desde Mensual. Hasta
          el día 9, el mes anterior sigue visible en la tabla operativa; desde el día 10 aparece
          acá.
        </Callout>
      </>
    );
  }

  const delRango = pedidos.filter((p) => enRango(p.mes, rango));
  const meses = mesesDelRango(rango);
  const serie = porMes(delRango, meses);
  const resolucion = cierre(delRango);
  const tienda = reclamos(delRango);
  const fin = desenlaces(delRango);

  const unSoloMes = rango.desde === rango.hasta;
  const periodo = unSoloMes
    ? mesLargo(rango.desde)
    : `${mesCorto(rango.desde)} – ${mesCorto(rango.hasta)}`;

  /*
   * La comparación solo existe si hay casos de los dos lados. Con un grupo
   * vacío su tasa da 0 y la resta produce un número que parece una conclusión
   * —«los datos restan 2,4 puntos»— cuando lo que pasa es que no hay nada que
   * comparar. Es peor que no mostrar nada: se lee igual de convincente.
   */
  const hayComparacion = tienda.conReclamo > 0 && tienda.sinReclamo > 0;
  const diferencia = tienda.tasaEntregaConReclamo - tienda.tasaEntregaSinReclamo;
  const entregados = delRango.filter((p) => p.entregado).length;
  const incluyeMesEnCurso = enRango(mesEnCurso(), rango);


  return (
    <>
      <PageHead
        eyebrow={`Meses cerrados · ${periodo}`}
        titulo="Histórico"
        flujo="historico"
        periodo={rango}
        dek="Los casos de cada mes con el estado en el que quedaron. Un caso pertenece al mes en que se creó y se queda ahí para siempre, así que los totales de un mes ya pasado no se mueven; lo único que puede cambiar es en qué terminó cada caso."
      />

      <Card
        titulo="Período"
        nota="Elegí un mes o un rango. Solo aparecen los meses que tienen casos cargados."
      >
        <SelectorMeses meses={disponibles} desde={rango.desde} hasta={rango.hasta} />
      </Card>

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos del período"
          valor={numero(resolucion.total)}
          nota={unSoloMes ? "creados en el mes" : `creados entre ${periodo}`}
        />
        <Kpi
          etiqueta="Cerrados"
          valor={porcentaje(resolucion.tasaCierre)}
          tono={resolucion.tasaCierre > 80 ? "good" : "bad"}
          nota={`${numero(resolucion.cerrados)} resueltos · ${numero(resolucion.abiertos)} sin cerrar`}
        />
        <Kpi
          etiqueta="Entregados"
          valor={porcentaje((entregados / (resolucion.total || 1)) * 100)}
          nota={`${numero(entregados)} llegaron a destino`}
        />
        <Kpi
          etiqueta="Con datos de la tienda"
          valor={numero(tienda.conReclamo)}
          nota={`${porcentaje(tienda.porcentaje)} del período aportó algo con qué trabajar`}
        />
        <Kpi
          etiqueta="Lo que aportan los datos"
          valor={hayComparacion ? puntos(diferencia) : "—"}
          tono={hayComparacion ? (diferencia > 0 ? "good" : diferencia < 0 ? "bad" : "neutral") : "neutral"}
          nota={
            hayComparacion
              ? "diferencia en tasa de entrega, con datos contra sin datos"
              : tienda.conReclamo === 0
                ? "ningún caso del período tiene datos de la tienda"
                : "todos los casos del período tienen datos: no hay contra qué comparar"
          }
        />
      </div>

      <div className={estilos.stack}>
        {incluyeMesEnCurso ? (
          <Callout tono="warning" titulo="El rango incluye el mes en curso">
            {mesLargo(mesEnCurso())} todavía está abierto: le faltan días por cargar y hay casos
            que aún se pueden mover. Comparar un mes a medio andar contra meses completos hace
            parecer que el volumen cayó cuando lo único que pasó es que el mes no terminó.
          </Callout>
        ) : null}

        <Card
          titulo="Mes a mes"
          nota="El detalle de cada mes del rango. Los meses sin casos aparecen igual, en cero: un hueco en la serie puede ser un mes tranquilo o una ingesta que no corrió, y conviene poder distinguirlos."
        >
          <Tabla
            id="historico-meses"
            titulo={`Histórico · ${periodo}`}
            columnas={[
              { clave: "etiqueta", titulo: "Mes", tipo: "texto" },
              { clave: "casos", titulo: "Casos", tipo: "numero" },
              { clave: "cerrados", titulo: "Cerrados", tipo: "numero" },
              { clave: "tasaCierre", titulo: "% cerrados", tipo: "porcentaje" },
              { clave: "entregados", titulo: "Entregados", tipo: "numero" },
              { clave: "devueltos", titulo: "Devueltos", tipo: "numero" },
              { clave: "conDatos", titulo: "Con datos", tipo: "numero" },
              { clave: "tasaEntregaConDatos", titulo: "% entrega con datos", tipo: "porcentaje" },
              { clave: "tasaEntregaSinDatos", titulo: "% entrega sin datos", tipo: "porcentaje" },
            ]}
            filas={serie.map((f) => ({ ...f, id: f.mes, etiqueta: mesCorto(f.mes) }))}
            ordenInicial={{ clave: "etiqueta", asc: true }}
            vacio="No hay meses en este rango."
          />
        </Card>

        <div className={estilos.grid2}>
          <Card
            titulo="Volumen por mes"
            nota="Cuántos casos hubo cada mes y qué parte de ellos tenía datos de la tienda. La altura total es el volumen; el corte, la cobertura."
          >
            <BarrasMeses datos={serie} />
          </Card>

          <Card
            titulo="Sirve pedirle datos a la tienda"
            nota="Qué parte terminó entregada, mes a mes, según si la tienda aportó algo o no. Lo que convence no es un mes, es que la distancia se sostenga."
          >
            <LineasEntrega datos={serie} />
          </Card>
        </div>

        {hayComparacion ? (
          <Callout tono={diferencia > 0 ? "neutral" : "warning"} titulo="Con datos contra sin datos">
            De los {numero(tienda.conReclamo)} casos donde la tienda aportó algo,{" "}
            {porcentaje(tienda.tasaEntregaConReclamo)} terminó entregado. Entre los{" "}
            {numero(tienda.sinReclamo)} que no tuvieron nada, {porcentaje(tienda.tasaEntregaSinReclamo)}.
            La diferencia es de {puntos(diferencia)}
            {diferencia > 0
              ? ", a favor de los casos con datos."
              : diferencia < 0
                ? ", en contra: los casos con datos entregan menos, lo que suele significar que la tienda solo aporta cuando el caso ya venía difícil."
                : ": no hay diferencia medible en este período."}
          </Callout>
        ) : null}

        <Card
          titulo="Cómo terminaron"
          nota="El estado final de cada caso del período, separando los que tenían datos de la tienda. Los conteos van al lado de los porcentajes a propósito: un 100% sobre tres casos y otro sobre trescientos se leen igual y no significan lo mismo."
        >
          <Tabla
            id="historico-desenlaces"
            titulo={`Cómo terminaron · ${periodo}`}
            columnas={[
              { clave: "estado", titulo: "Estado final", tipo: "estado" },
              { clave: "caso", titulo: "Caso", tipo: "caso" },
              { clave: "total", titulo: "Casos", tipo: "numero" },
              { clave: "conDatos", titulo: "Con datos", tipo: "numero" },
              { clave: "sinDatos", titulo: "Sin datos", tipo: "numero" },
              { clave: "porcentajeConDatos", titulo: "% con datos", tipo: "porcentaje" },
            ]}
            filas={fin.filas.map((f) => ({
              ...f,
              id: f.estado,
              caso: f.cerrado ? "Cerrado" : "Abierto",
            }))}
            ordenInicial={{ clave: "total", asc: false }}
            vacio="No hay casos en este período."
          />
        </Card>

        <Card
          titulo="Por tipo de reclamo"
          nota="Qué tipificó soporte y en qué terminaron esos casos. Solo entran los que tienen algún dato cargado detrás."
        >
          <Tabla
            id="historico-reclamos"
            titulo={`Reclamos · ${periodo}`}
            columnas={[
              { clave: "tipo", titulo: "Tipificación", tipo: "texto" },
              { clave: "casos", titulo: "Casos", tipo: "numero" },
              { clave: "entregados", titulo: "Entregados", tipo: "numero" },
              { clave: "tasaEntrega", titulo: "% entregados", tipo: "porcentaje" },
              { clave: "abiertos", titulo: "Sin cerrar", tipo: "numero" },
            ]}
            filas={tienda.porTipo.map((f) => ({ ...f, id: f.tipo }))}
            ordenInicial={{ clave: "casos", asc: false }}
            vacio="Todavía no hay reclamos tipificados en este período."
          />
        </Card>

        <PanelCasos
          id="historico-casos"
          titulo={`Casos de ${periodo}`}
          nota="Todos los casos del período, con datos de tienda y sin ellos. Se busca por cualquier columna y se ordena por cualquier encabezado."
          casos={{ pedidos: delRango, campos }}
          vacio="No hay casos en este período."
        />
      </div>
    </>
  );
}
