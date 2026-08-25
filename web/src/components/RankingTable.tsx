import type { FilaRanking } from "@/lib/metricas";
import { decimal, numero, porcentaje } from "@/lib/formato";
import estilos from "./ui.module.css";

/**
 * Tabla de ranking con una barra en la celda de porcentaje: da la magnitud de
 * un vistazo sin necesidad de un gráfico aparte.
 */
export function RankingTable({
  filas,
  etiquetaDimension,
  tono = "malo",
  mostrarVisitas = true,
  referencia,
}: {
  filas: FilaRanking[];
  etiquetaDimension: string;
  tono?: "malo" | "bueno" | "neutro";
  mostrarVisitas?: boolean;
  /** Máximo del eje de las barras. Por defecto, el mayor valor de la tabla. */
  referencia?: number;
}) {
  if (filas.length === 0) {
    return <p className={estilos.empty}>Todavía no hay casos suficientes para armar el ranking.</p>;
  }

  const tope = referencia ?? Math.max(...filas.map((f) => f.tasaDevolucion), 1);

  return (
    <div className={estilos.tableWrap}>
      <table className={estilos.table}>
        <thead>
          <tr>
            <th>{etiquetaDimension}</th>
            <th className={estilos.num}>Casos</th>
            <th className={estilos.num}>Devoluciones</th>
            <th className={estilos.num}>% devolución</th>
            {mostrarVisitas ? <th className={estilos.num}>Visitas</th> : null}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.nombre}>
              <td className={estilos.nombre} title={fila.nombre}>
                {fila.nombre}
              </td>
              <td className={estilos.num}>{numero(fila.casos)}</td>
              <td className={estilos.num}>{numero(fila.devoluciones)}</td>
              <td className={estilos.num}>
                <span className={estilos.barCell}>
                  <span className={estilos.barTrack}>
                    <span
                      className={`${estilos.barFill} ${
                        tono === "bueno"
                          ? estilos.barFillGood
                          : tono === "neutro"
                            ? ""
                            : estilos.barFillBad
                      }`}
                      style={{ width: `${Math.min(100, (fila.tasaDevolucion / tope) * 100)}%` }}
                    />
                  </span>
                  {porcentaje(fila.tasaDevolucion)}
                </span>
              </td>
              {mostrarVisitas ? (
                <td className={estilos.num}>{decimal(fila.visitasPromedio)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
