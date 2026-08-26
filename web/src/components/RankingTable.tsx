import type { FilaRanking } from "@/lib/metricas";
import { Tabla } from "./Tabla";

/** Ranking por repartidor, comercio o zona. Ordenable por cualquier columna. */
export function RankingTable({
  filas,
  etiquetaDimension,
  mostrarVisitas = true,
}: {
  filas: FilaRanking[];
  etiquetaDimension: string;
  mostrarVisitas?: boolean;
}) {
  return (
    <Tabla
      columnas={[
        { clave: "nombre", titulo: etiquetaDimension, tipo: "texto" },
        { clave: "casos", titulo: "Casos", tipo: "numero" },
        { clave: "devoluciones", titulo: "Devoluciones", tipo: "numero" },
        { clave: "tasa", titulo: "% devolución", tipo: "porcentaje" },
        ...(mostrarVisitas
          ? [{ clave: "visitas", titulo: "Visitas", tipo: "decimal" as const }]
          : []),
      ]}
      filas={filas.map((f) => ({
        id: f.nombre,
        nombre: f.nombre,
        casos: f.casos,
        devoluciones: f.devoluciones,
        tasa: f.tasaDevolucion,
        visitas: f.visitasPromedio,
      }))}
      ordenInicial={{ clave: "tasa", asc: false }}
      vacio="Todavía no hay casos suficientes para armar el ranking."
    />
  );
}
