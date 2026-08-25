import type { FilaAntiguedad } from "@/lib/metricas";
import { Tabla } from "./Tabla";

/** Cuántos casos abiertos hay en cada tramo de días sin moverse. */
export function AntiguedadTable({ filas }: { filas: FilaAntiguedad[] }) {
  return (
    <Tabla
      columnas={[
        { clave: "tramo", titulo: "Sin moverse", tipo: "texto" },
        { clave: "casos", titulo: "Casos abiertos", tipo: "numero" },
        { clave: "porcentaje", titulo: "% de los abiertos", tipo: "porcentaje" },
      ]}
      filas={filas.map((f) => ({ id: f.tramo, tramo: f.tramo, casos: f.casos, porcentaje: f.porcentaje }))}
      vacio="No hay casos abiertos. La cola está limpia."
    />
  );
}
