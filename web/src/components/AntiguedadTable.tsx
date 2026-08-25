import type { FilaAntiguedad } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import estilos from "./ui.module.css";

/**
 * Cuántos casos abiertos hay en cada tramo de días sin moverse. El tramo largo
 * se pinta como crítico: son los que llevan más de una semana quietos.
 */
export function AntiguedadTable({ filas }: { filas: FilaAntiguedad[] }) {
  if (filas.length === 0) {
    return <p className={estilos.empty}>No hay casos abiertos. La cola está limpia.</p>;
  }

  const tope = Math.max(...filas.map((f) => f.casos), 1);

  return (
    <div className={estilos.tableWrap}>
      <table className={estilos.table}>
        <thead>
          <tr>
            <th>Sin moverse</th>
            <th className={estilos.num}>Casos abiertos</th>
            <th className={estilos.num}>% de los abiertos</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.tramo}>
              <td>{fila.tramo}</td>
              <td className={estilos.num}>{numero(fila.casos)}</td>
              <td className={estilos.num}>
                <span className={estilos.barCell}>
                  <span className={estilos.barTrack}>
                    <span
                      className={`${estilos.barFill} ${
                        fila.tramo === "Más de 7" || fila.tramo === "4–7 días"
                          ? estilos.barFillBad
                          : ""
                      }`}
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
