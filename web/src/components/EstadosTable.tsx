import type { FilaEstado } from "@/lib/metricas";
import { Tabla } from "./Tabla";

/**
 * Todos los estados con su volumen. La columna de caso aclara cuáles cuentan
 * como resueltos, que no es evidente: `Devolucion` sigue abierto porque la
 * devolución está en curso, mientras que `Devuelto` ya cierra el caso.
 */
export function EstadosTable({ filas }: { filas: FilaEstado[] }) {
  return (
    <Tabla
      columnas={[
        { clave: "estado", titulo: "Estado", tipo: "estado" },
        { clave: "caso", titulo: "Caso", tipo: "caso" },
        { clave: "casos", titulo: "Casos", tipo: "numero" },
        { clave: "porcentaje", titulo: "% del total", tipo: "porcentaje" },
      ]}
      filas={filas.map((f) => ({
        id: f.estado,
        estado: f.estado,
        caso: f.cerrado ? "Cerrado" : "Abierto",
        casos: f.casos,
        porcentaje: f.porcentaje,
      }))}
      ordenInicial={{ clave: "casos", asc: false }}
      vacio="No hay casos para mostrar."
    />
  );
}
