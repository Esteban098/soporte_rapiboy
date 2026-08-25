import type { Pedido } from "@/lib/normalizar";
import { fechaCorta, numero } from "@/lib/formato";
import { Chip } from "./Card";
import estilos from "./ui.module.css";

/** Semáforo de demora, igual al que la planilla arma con la columna DEMORA. */
function semaforo(pedido: Pedido, hoy: Date) {
  if (!pedido.programado) return { tono: "neutral" as const, texto: "Sin fecha" };
  const dias = Math.floor((hoy.getTime() - pedido.programado.getTime()) / (24 * 60 * 60 * 1000));
  if (dias > 2) return { tono: "critical" as const, texto: `Urgente · ${dias} d` };
  if (dias > 1) return { tono: "warning" as const, texto: `Retrasada · ${dias} d` };
  return { tono: "good" as const, texto: "A tiempo" };
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
              <th>Demora</th>
              <th>Programado</th>
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
                  <td>{fechaCorta(pedido.programado)}</td>
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
