import type { FilaConteo } from "@/lib/metricas";
import { Tabla } from "./Tabla";

/**
 * Ranking simple: un nombre, cuántos casos y qué porción del total representa.
 * Se usa para ver dónde se concentran los no entregados.
 */
export function ConteoTable({
  id,
  titulo,
  filas,
  etiqueta,
  vacio,
  tiendas = false,
}: {
  id: string;
  /** Encabezado que lleva la tabla al imprimirse. */
  titulo?: string;
  filas: FilaConteo[];
  etiqueta: string;
  vacio?: string;
  /** Si los nombres son comercios, para pintarlos con el color de su dueño. */
  tiendas?: boolean;
}) {
  return (
    <Tabla
      id={id}
      titulo={titulo}
      columnas={[
        { clave: "nombre", titulo: etiqueta, tipo: tiendas ? "tienda" : "texto" },
        { clave: "casos", titulo: "Sin entregar", tipo: "numero" },
        { clave: "porcentaje", titulo: "% del total", tipo: "porcentaje" },
      ]}
      filas={filas.map((f) => ({
        id: f.nombre,
        nombre: f.nombre,
        casos: f.casos,
        porcentaje: f.porcentaje,
      }))}
      ordenInicial={{ clave: "casos", asc: false }}
      limite={8}
      vacio={vacio ?? "No hay casos sin entregar."}
    />
  );
}
