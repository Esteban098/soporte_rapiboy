import { cargarCancelaciones } from "@/lib/datos";
import { resumenCancelaciones } from "@/lib/metricas";
import { duracion, fechaCorta, numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Cancelaciones" };

export default async function Cancelaciones() {
  const cancelaciones = await cargarCancelaciones();
  const total = resumenCancelaciones(cancelaciones);
  const recientes = cancelaciones.slice(0, 40);

  return (
    <>
      <PageHead
        eyebrow="Mercado Libre"
        titulo="Cancelaciones en ruta"
        dek="Cuánto tiempo estuvo el paquete en la calle antes de que Mercado Libre cancelara el envío. Es el número con el que se discute quién se hace cargo del viaje."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Cancelaciones"
          valor={numero(total.casos)}
          nota="envíos cancelados después de colectados"
        />
        <Kpi
          etiqueta="Mediana en ruta"
          valor={total.medianaMinutos ? duracion(total.medianaMinutos) : "—"}
          nota="tiempo típico entre colecta y cancelación"
        />
        <Kpi
          etiqueta="Más de 2 horas"
          valor={numero(total.masDeDosHoras)}
          tono="bad"
          nota={
            total.conMinutos
              ? `${porcentaje((total.masDeDosHoras / total.conMinutos) * 100)} de los casos medibles`
              : "sin datos de tiempo"
          }
        />
        <Kpi
          etiqueta="Con tiempo medible"
          valor={numero(total.conMinutos)}
          nota="casos con las dos fechas cargadas"
        />
      </div>

      <div className={estilos.stack}>
        <Callout titulo="Este cálculo se había dejado de hacer">
          Las hojas mensuales de 2025 traían los minutos calculados a mano; la hoja de 2026 tiene la
          columna vacía. El tablero lo recalcula a partir de la fecha de colecta y la de cancelación,
          así que el indicador vuelve a estar disponible sin tocar la planilla.
        </Callout>

        <Card
          titulo="Comercios con más cancelaciones"
          nota="Ordenado por cantidad de envíos cancelados en ruta, con el tiempo típico de cada uno."
        >
          <div className={estilos.tableWrap}>
            <table className={estilos.table}>
              <thead>
                <tr>
                  <th>Comercio</th>
                  <th className={estilos.num}>Cancelaciones</th>
                  <th className={estilos.num}>Mediana en ruta</th>
                </tr>
              </thead>
              <tbody>
                {total.porTienda.map((fila) => (
                  <tr key={fila.nombre}>
                    <td className={estilos.nombre} title={fila.nombre}>
                      {fila.nombre}
                    </td>
                    <td className={estilos.num}>{numero(fila.casos)}</td>
                    <td className={estilos.num}>
                      {fila.medianaMinutos ? duracion(fila.medianaMinutos) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          titulo="Últimas cancelaciones"
          nota="Las más recientes por fecha de colecta, para revisar casos puntuales."
        >
          <div className={estilos.tableWrap}>
            <table className={estilos.table}>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Comercio</th>
                  <th>Estado en Rapiboy</th>
                  <th>Colectado</th>
                  <th>Cancelado</th>
                  <th className={estilos.num}>En ruta</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((cancelacion) => (
                  <tr key={cancelacion.id}>
                    <td>{cancelacion.id}</td>
                    <td className={estilos.nombre} title={cancelacion.tienda}>
                      {cancelacion.tienda || "—"}
                    </td>
                    <td>{cancelacion.estadoRpb || "—"}</td>
                    <td>{fechaCorta(cancelacion.colectado)}</td>
                    <td>{fechaCorta(cancelacion.cancelado)}</td>
                    <td className={estilos.num}>
                      {cancelacion.minutos ? duracion(cancelacion.minutos) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
