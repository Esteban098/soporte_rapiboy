import type { Pedido } from "@/lib/normalizar";
import { fechaCorta, numero } from "@/lib/formato";
import { Chip } from "./Card";
import estilos from "./ui.module.css";

/**
 * Los casos donde la tienda aportó datos, con la información del viaje y en qué
 * quedó el aviso al repartidor.
 */
export function ReclamosTable({
  pedidos,
  vacio = "No hay casos con datos de la tienda.",
}: {
  pedidos: Pedido[];
  vacio?: string;
}) {
  if (pedidos.length === 0) {
    return <p className={estilos.empty}>{vacio}</p>;
  }

  return (
    <>
      <div className={estilos.tableWrap}>
        <table className={estilos.table}>
          <thead>
            <tr>
              <th>Viaje</th>
              <th>Aviso</th>
              <th>Dato que pasó la tienda</th>
              <th>Trae</th>
              <th>Estado</th>
              <th>Caso</th>
              <th>Repartidor</th>
              <th>Tienda</th>
              <th>Zona</th>
              <th className={estilos.num}>Visitas</th>
              <th>Último mov.</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((pedido) => (
              <tr key={pedido.id}>
                <td>{pedido.id}</td>
                <td>
                  <Chip tono={pedido.avisoPendiente ? "critical" : "good"}>
                    {pedido.aviso || "Avisado"}
                  </Chip>
                </td>
                <td className={estilos.nombre} title={pedido.reclamoTienda}>
                  {pedido.reclamoTienda || "—"}
                </td>
                <td>
                  {[pedido.tieneUbicacion ? "ubicación" : null, pedido.tieneTelefono ? "teléfono" : null]
                    .filter(Boolean)
                    .join(" + ") || "—"}
                </td>
                <td>{pedido.estado || "—"}</td>
                <td>
                  <Chip tono={pedido.cerrado ? "good" : "warning"}>
                    {pedido.cerrado ? "Cerrado" : "Abierto"}
                  </Chip>
                </td>
                <td className={estilos.nombre} title={pedido.repartidor}>
                  {pedido.repartidor || "—"}
                </td>
                <td className={estilos.nombre} title={pedido.tienda}>
                  {pedido.tienda || "—"}
                </td>
                <td className={estilos.nombre} title={pedido.poligono}>
                  {pedido.poligono || "—"}
                </td>
                <td className={estilos.num}>{pedido.visitas ?? "—"}</td>
                <td>{fechaCorta(pedido.ultimoMovimiento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={estilos.cardNote} style={{ marginTop: 12, marginBottom: 0 }}>
        {numero(pedidos.length)} casos.
      </p>
    </>
  );
}
