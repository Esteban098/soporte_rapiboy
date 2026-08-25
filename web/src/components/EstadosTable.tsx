import type { FilaEstado } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { Chip } from "./Card";
import estilos from "./ui.module.css";

/**
 * Todos los estados con su volumen. La columna de caso aclara cuáles cuentan
 * como resueltos, que no es evidente: `Devolucion` sigue abierto porque la
 * devolución está en curso, mientras que `Devuelto` ya cierra el caso.
 */
export function EstadosTable({ filas }: { filas: FilaEstado[] }) {
  if (filas.length === 0) {
    return <p className={estilos.empty}>No hay casos para mostrar.</p>;
  }

  const tope = Math.max(...filas.map((f) => f.casos), 1);

  return (
    <div className={estilos.tableWrap}>
      <table className={estilos.table}>
        <thead>
          <tr>
            <th>Estado</th>
            <th>Caso</th>
            <th className={estilos.num}>Casos</th>
            <th className={estilos.num}>% del total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.estado}>
              <td>{fila.estado}</td>
              <td>
                <Chip tono={fila.cerrado ? "good" : "warning"}>
                  {fila.cerrado ? "Cerrado" : "Abierto"}
                </Chip>
              </td>
              <td className={estilos.num}>{numero(fila.casos)}</td>
              <td className={estilos.num}>
                <span className={estilos.barCell}>
                  <span className={estilos.barTrack}>
                    <span
                      className={`${estilos.barFill} ${fila.cerrado ? estilos.barFillGood : ""}`}
                      style={{ width: `${(fila.casos / tope) * 100}%` }}
                    />
                  </span>
                  {porcentaje(fila.porcentaje)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
