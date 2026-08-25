import type { Pedido } from "@/lib/normalizar";
import { fechaCorta, numero } from "@/lib/formato";
import { Chip } from "./Card";
import estilos from "./ui.module.css";

/**
 * Hace cuántos días que el caso no se mueve. Sale de comparar hoy contra el
 * último cambio de estado, que es lo que guarda la columna del libro.
 */
function semaforo(pedido: Pedido, hoy: Date) {
  if (!pedido.ultimoMovimiento) return { tono: "neutral" as const, texto: "Sin fecha" };
  const dias = Math.floor(
    (hoy.getTime() - pedido.ultimoMovimiento.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dias > 2) return { tono: "critical" as const, texto: `${dias} d quieto` };
  if (dias > 1) return { tono: "warning" as const, texto: `${dias} d quieto` };
  if (dias === 1) return { tono: "good" as const, texto: "Ayer" };
  return { tono: "good" as const, texto: "Hoy" };
}

export function PedidosTable({
  pedidos,
  vacio = "No quedó ningún caso en esta vista.",
  limite = 60,
}: {
  pedidos: Pedido[];
  vacio?: string;
  limite?: number;
}) {
  if (pedidos.length === 0) {
    return <p className={estilos.empty}>{vacio}</p>;
  }

  const hoy = new Date();
  const visibles = pedidos.slice(0, limite);

  return (
    <>
      <div className={estilos.tableWrap}>
        <table className={estilos.table}>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Sin moverse</th>
              <th>Último movimiento</th>
              <th>Estado</th>
              <th>Repartidor</th>
              <th>Tienda</th>
              <th>Zona</th>
              <th className={estilos.num}>Visitas</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((pedido) => {
              const estado = semaforo(pedido, hoy);
              return (
                <tr key={pedido.id}>
                  <td>{pedido.id}</td>
                  <td>
                    <Chip tono={estado.tono}>{estado.texto}</Chip>
                  </td>
                  <td>{fechaCorta(pedido.ultimoMovimiento)}</td>
                  <td>{pedido.estado || "—"}</td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pedidos.length > visibles.length ? (
        <p className={estilos.cardNote} style={{ marginTop: 12, marginBottom: 0 }}>
          Mostrando {numero(visibles.length)} de {numero(pedidos.length)} casos.
        </p>
      ) : null}
    </>
  );
}
