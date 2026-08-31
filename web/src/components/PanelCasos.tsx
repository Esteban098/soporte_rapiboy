import type { Casos } from "@/lib/datos";
import { columnasPara, filasDePedidos, FILTROS_PEDIDO } from "@/lib/filas";
import { Card } from "./Card";
import { Tabla } from "./Tabla";
import { GraficoCasos } from "./charts/GraficoCasos";

/**
 * Un listado de casos con su gráfico.
 *
 * Los dos reciben el mismo `id`, las mismas filas y los mismos filtros, así que
 * comparten el estado de filtrado: lo que se filtre en la tabla se refleja en
 * el gráfico y al revés.
 */
export function PanelCasos({
  id,
  titulo,
  nota,
  tituloGrafico = "Cómo se reparten estos casos",
  notaGrafico = "Elegí por qué agrupar y qué medir. Responde a los filtros y a la búsqueda de la tabla de abajo.",
  casos,
  vacio = "No quedó ningún caso en esta vista.",
  limite = 30,
}: {
  id: string;
  titulo: string;
  nota?: string;
  tituloGrafico?: string;
  notaGrafico?: string;
  casos: Casos;
  vacio?: string;
  limite?: number;
}) {
  const columnas = columnasPara(casos.campos);
  const filas = filasDePedidos(casos.pedidos);

  return (
    <>
      <Card titulo={tituloGrafico} nota={notaGrafico}>
        <GraficoCasos id={id} filas={filas} columnas={columnas} filtros={FILTROS_PEDIDO} />
      </Card>

      <Card titulo={titulo} nota={nota}>
        <Tabla
          id={id}
          titulo={titulo}
          columnas={columnas}
          filas={filas}
          filtros={FILTROS_PEDIDO}
          ordenInicial={{ clave: "quieto", asc: false }}
          limite={limite}
          vacio={vacio}
        />
      </Card>
    </>
  );
}
