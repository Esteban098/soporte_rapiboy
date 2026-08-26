import { cargarPedidos } from "@/lib/datos";
import { reclamos } from "@/lib/metricas";
import { numero, porcentaje, puntos } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { Tabla } from "@/components/Tabla";
import { filasDeReclamos } from "@/lib/filas";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Reclamos de tienda" };

export default async function Reclamos() {
  const pedidos = await cargarPedidos();
  const datos = reclamos(pedidos);

  // El detalle va ordenado por lo que hay que atender primero: sin avisar y
  // todavía abierto, arriba de todo.
  const conReclamo = pedidos
    .filter((p) => p.reclamoTienda !== "")
    .sort((a, b) => {
      const prioridad = (p: typeof a) => (p.avisoPendiente ? 0 : 1) + (p.cerrado ? 2 : 0);
      return prioridad(a) - prioridad(b) || b.ultimoMovimiento!.getTime() - a.ultimoMovimiento!.getTime();
    });
  const filas = filasDeReclamos(conReclamo);
  const diferencia = datos.tasaEntregaConReclamo - datos.tasaEntregaSinReclamo;

  return (
    <>
      <PageHead
        eyebrow="Datos que aporta el comercio"
        titulo="Reclamos de tienda"
        dek="Casos donde la tienda nos compartió información para concretar la entrega: un teléfono alterno, una ubicación exacta o indicaciones del domicilio. Lo que importa es si esa información terminó sirviendo."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos con datos"
          valor={numero(datos.conReclamo)}
          nota={`${porcentaje(datos.porcentaje)} de los casos del mes`}
        />
        <Kpi
          etiqueta="Entregados con datos"
          valor={porcentaje(datos.tasaEntregaConReclamo)}
          tono={diferencia >= 0 ? "good" : "bad"}
          nota={`${numero(datos.entregadosConReclamo)} de ${numero(datos.conReclamo)} llegaron a destino`}
        />
        <Kpi
          etiqueta="Entregados sin datos"
          valor={porcentaje(datos.tasaEntregaSinReclamo)}
          nota="referencia: casos donde la tienda no aportó nada"
        />
        <Kpi
          etiqueta="Sin avisar"
          valor={numero(datos.avisoPendiente)}
          tono={datos.avisoPendiente > 0 ? "bad" : "good"}
          nota={`${numero(datos.avisados)} marcados como avisados`}
        />
      </div>

      <div className={estilos.stack}>
        <Callout
          tono={diferencia >= 0 ? "neutral" : "critical"}
          titulo={
            diferencia >= 0
              ? "Los datos de la tienda ayudan"
              : "Los datos de la tienda no están moviendo la aguja"
          }
        >
          Los casos con información del comercio se entregan en{" "}
          {porcentaje(datos.tasaEntregaConReclamo)} contra {porcentaje(datos.tasaEntregaSinReclamo)}{" "}
          de los que no la tienen: {puntos(diferencia)} de diferencia. Tener en cuenta que no son
          grupos comparables — la tienda manda datos justamente en los casos que ya venían
          complicados, así que la comparación marca una tendencia, no una causa.
        </Callout>

        <Callout tono="critical" titulo="La columna AVISO no distingue avisados de no avisados">
          En la planilla, AVISO se calcula con <code>=IF(RECLAMO TIENDA &lt;&gt; &quot;&quot;, &quot;NO AVISADO&quot;, &quot;&quot;)</code>:
          marca como pendiente <b>todo</b> caso que tenga datos cargados, y nada la vuelve a poner
          en blanco cuando el aviso se manda. Por eso los {numero(datos.avisoPendiente)} «sin
          avisar» son exactamente los {numero(datos.conReclamo)} casos con datos. Para que esta
          métrica sirva hace falta una casilla que soporte marque al avisar.
        </Callout>

        <Card
          titulo="Casos con datos de la tienda"
          nota="Todo lo que el comercio aportó para concretar la entrega, con la información del viaje. Se puede filtrar por aviso y estado, y ordenar por cualquier columna."
        >
          <Tabla
            columnas={[
              { clave: "id", titulo: "Viaje", tipo: "viaje" },
              { clave: "aviso", titulo: "Aviso", tipo: "aviso" },
              { clave: "reclamo", titulo: "Tipo de dato", tipo: "texto" },
              { clave: "ubicacion", titulo: "Ubicación", tipo: "texto" },
              { clave: "telefono", titulo: "Teléfono o referencia", tipo: "texto" },
              { clave: "estado", titulo: "Estado", tipo: "estado" },
              { clave: "caso", titulo: "Caso", tipo: "caso" },
              { clave: "repartidor", titulo: "Repartidor", tipo: "texto" },
              { clave: "tienda", titulo: "Tienda", tipo: "texto" },
              { clave: "zona", titulo: "Zona", tipo: "texto" },
              { clave: "visitas", titulo: "Visitas", tipo: "numero" },
              { clave: "quieto", titulo: "Sin moverse", tipo: "dias" },
            ]}
            filas={filas}
            filtros={[
              { clave: "aviso", etiqueta: "Aviso", opciones: ["NO AVISADO", "AVISADO"] },
              { clave: "estado", etiqueta: "Estado" },
              { clave: "caso", etiqueta: "Caso", opciones: ["Abierto", "Cerrado"] },
            ]}
            ordenInicial={{ clave: "quieto", asc: false }}
            limite={30}
            vacio="No hay casos con datos de la tienda."
          />
        </Card>

        <Card
          titulo="Qué tipo de dato aporta la tienda"
          nota="La tipificación que carga soporte en la columna RECLAMO TIENDA, con cuántos de esos casos llegaron a entregarse."
        >
          {datos.porTipo.length === 0 ? (
            <p className={estilos.empty}>Todavía no hay casos con datos de la tienda este mes.</p>
          ) : (
            <div className={estilos.tableWrap}>
              <table className={estilos.table}>
                <thead>
                  <tr>
                    <th>Tipo de dato</th>
                    <th className={estilos.num}>Casos</th>
                    <th className={estilos.num}>Entregados</th>
                    <th className={estilos.num}>% entrega</th>
                    <th className={estilos.num}>Abiertos</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.porTipo.map((fila) => (
                    <tr key={fila.tipo}>
                      <td>{fila.tipo}</td>
                      <td className={estilos.num}>{numero(fila.casos)}</td>
                      <td className={estilos.num}>{numero(fila.entregados)}</td>
                      <td className={estilos.num}>
                        <span className={estilos.barCell}>
                          <span className={estilos.barTrack}>
                            <span
                              className={`${estilos.barFill} ${estilos.barFillGood}`}
                              style={{ width: `${fila.tasaEntrega}%` }}
                            />
                          </span>
                          {porcentaje(fila.tasaEntrega)}
                        </span>
                      </td>
                      <td className={estilos.num}>{numero(fila.abiertos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          titulo="En qué terminaron los casos con datos"
          nota="El desglose completo de estados, solo para los casos donde la tienda aportó información."
        >
          <EstadosTable filas={datos.porEstado} />
        </Card>

        <Card
          titulo="Qué se cargó exactamente"
          nota="Cuántos de esos casos traen ubicación y cuántos un teléfono alterno. El contenido en sí es dato del cliente y no sale del servidor: acá solo se cuenta si existe."
        >
          <div className={estilos.tableWrap}>
            <table className={estilos.table}>
              <thead>
                <tr>
                  <th>Dato aportado</th>
                  <th className={estilos.num}>Casos</th>
                  <th className={estilos.num}>% de los que tienen reclamo</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ubicación (link de mapa)</td>
                  <td className={estilos.num}>{numero(datos.conUbicacion)}</td>
                  <td className={estilos.num}>
                    {porcentaje((datos.conUbicacion / Math.max(1, datos.conReclamo)) * 100)}
                  </td>
                </tr>
                <tr>
                  <td>Teléfono o referencia del domicilio</td>
                  <td className={estilos.num}>{numero(datos.conTelefono)}</td>
                  <td className={estilos.num}>
                    {porcentaje((datos.conTelefono / Math.max(1, datos.conReclamo)) * 100)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
