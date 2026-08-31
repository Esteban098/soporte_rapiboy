import type { Casos } from "@/lib/datos";
import { columnasPara, filasDePedidos, FILTROS_PEDIDO } from "@/lib/filas";
import { Tabla } from "./Tabla";

/**
 * Listado de pedidos con las columnas que trae su propia pestaña del libro. Se
 * filtra por estado y caso, se ordena por cualquier encabezado, y las que no
 * interesen se ocultan desde el menú de la tabla.
 */
export function PedidosTable({
  id,
  titulo,
  casos,
  vacio = "No quedó ningún caso en esta vista.",
  limite = 30,
}: {
  /** Identifica la tabla para recordar las columnas ocultas. */
  id: string;
  /** Encabezado que lleva la tabla al imprimirse. */
  titulo?: string;
  casos: Casos;
  vacio?: string;
  limite?: number;
}) {
  return (
    <Tabla
      id={id}
      titulo={titulo}
      columnas={columnasPara(casos.campos)}
      filas={filasDePedidos(casos.pedidos)}
      filtros={FILTROS_PEDIDO}
      ordenInicial={{ clave: "quieto", asc: false }}
      limite={limite}
      vacio={vacio}
    />
  );
}
