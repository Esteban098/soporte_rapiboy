import type { Casos } from "@/lib/datos";
import type { Columna, Fila } from "./Tabla";
import type { OrigenCobro } from "@/lib/siniestrados";
import { columnasPara, filasDePedidos, FILTROS_PEDIDO } from "@/lib/filas";
import { Card } from "./Card";
import { Tabla } from "./Tabla";
import { GraficoCasos } from "./charts/GraficoCasos";
import estilos from "./ui.module.css";

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
  filas: filasDadas,
  vacio = "No quedó ningún caso en esta vista.",
  limite = 30,
  editable = false,
  soloEdicion = false,
  columnasExtra = [],
  cobros,
  dimensionInicial,
}: {
  id: string;
  titulo: string;
  nota?: string;
  tituloGrafico?: string;
  notaGrafico?: string;
  casos: Casos;
  /**
   * Las filas ya convertidas. Solo hace falta cuando otro gráfico de la misma
   * pantalla necesita el mismo arreglo: pasando la misma referencia, los casos
   * viajan una sola vez al cliente en lugar de una por componente.
   */
  filas?: Fila[];
  vacio?: string;
  limite?: number;
  /** Solo para las vistas que leen `mensual`: ver la nota en `Tabla`. */
  editable?: boolean;
  /** Permite editar filas existentes sin altas ni bajas, como en Histórico. */
  soloEdicion?: boolean;
  columnasExtra?: Columna[];
  cobros?: OrigenCobro;
  /** Agrupación inicial del gráfico, sin alterar los controles disponibles. */
  dimensionInicial?: string;
}) {
  const columnas = [...columnasPara(casos.campos), ...columnasExtra];
  const filas = filasDadas ?? filasDePedidos(casos.pedidos);

  return (
    <Card>
      <div className={estilos.datosDivididos}>
        <section>
          <h2 className={estilos.panelDatosTitulo}>{tituloGrafico}</h2>
          <p className={estilos.panelDatosNota}>{notaGrafico}</p>
          <GraficoCasos
            id={id}
            filas={filas}
            columnas={columnas}
            filtros={FILTROS_PEDIDO}
            titulo={titulo}
            dimensionInicial={dimensionInicial}
          />
        </section>
        <section>
          <h2 className={estilos.panelDatosTitulo}>{titulo}</h2>
          {nota ? <p className={estilos.panelDatosNota}>{nota}</p> : null}
          <Tabla
            id={id}
            titulo={titulo}
            columnas={columnas}
            filas={filas}
            filtros={FILTROS_PEDIDO}
            ordenInicial={{ clave: "quieto", asc: false }}
            limite={limite}
            vacio={vacio}
            editable={editable}
            soloEdicion={soloEdicion}
            cobros={cobros}
          />
        </section>
      </div>
    </Card>
  );
}
