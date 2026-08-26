import type { Pedido } from "@/lib/normalizar";
import { COLUMNAS_PEDIDO, filasDePedidos } from "@/lib/filas";
import { Tabla } from "./Tabla";

/**
 * Listado de pedidos con todas las columnas del libro disponibles. Se filtra
 * por estado y caso, se ordena por cualquier encabezado y las columnas que no
 * interesen se ocultan desde el menú de la tabla.
 */
export function PedidosTable({
  pedidos,
  vacio = "No quedó ningún caso en esta vista.",
  limite = 30,
}: {
  pedidos: Pedido[];
  vacio?: string;
  limite?: number;
}) {
  return (
    <Tabla
      columnas={COLUMNAS_PEDIDO}
      filas={filasDePedidos(pedidos)}
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
