import type { Casos } from "@/lib/datos";
import { columnasPara, filasDePedidos } from "@/lib/filas";
import { Tabla } from "./Tabla";

/**
 * Listado de pedidos con las columnas que trae su propia pestaña del libro. Se
 * filtra por estado y caso, se ordena por cualquier encabezado, y las que no
 * interesen se ocultan desde el menú de la tabla.
 */
export function PedidosTable({
  casos,
  vacio = "No quedó ningún caso en esta vista.",
  limite = 30,
}: {
  casos: Casos;
  vacio?: string;
  limite?: number;
}) {
  return (
    <Tabla
      columnas={columnasPara(casos.campos)}
      filas={filasDePedidos(casos.pedidos)}
      filtros={[
        { clave: "estado", etiqueta: "Estado" },
        { clave: "caso", etiqueta: "Caso", opciones: ["Abierto", "Cerrado"] },
      ]}
      ordenInicial={{ clave: "quieto", asc: false }}
      limite={limite}
      vacio={vacio}
    />
  );
}
