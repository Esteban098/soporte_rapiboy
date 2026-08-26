import type { Pedido } from "@/lib/normalizar";
import { filasDePedidos } from "@/lib/filas";
import { Tabla } from "./Tabla";

/** Listado de pedidos, filtrable por estado y ordenable por cualquier columna. */
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
      columnas={[
        { clave: "id", titulo: "Viaje", tipo: "viaje" },
        { clave: "quieto", titulo: "Sin moverse", tipo: "dias" },
        { clave: "estado", titulo: "Estado", tipo: "estado" },
        { clave: "caso", titulo: "Caso", tipo: "caso" },
        { clave: "repartidor", titulo: "Repartidor", tipo: "texto" },
        { clave: "tienda", titulo: "Tienda", tipo: "texto" },
        { clave: "zona", titulo: "Zona", tipo: "texto" },
        { clave: "visitas", titulo: "Visitas", tipo: "numero" },
        { clave: "movimiento", titulo: "Último mov.", tipo: "texto" },
      ]}
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
