import type { FilaEstado } from "@/lib/metricas";
import { Tabla } from "./Tabla";
import { TortaEstados } from "./charts/TortaEstados";
import estilos from "./ui.module.css";

/**
 * Todos los estados con su volumen. La columna de caso aclara cuáles cuentan
 * como resueltos, que no es evidente: `Devolucion` sigue abierto porque la
 * devolución está en curso, mientras que `Devuelto` ya cierra el caso.
 */
export function EstadosTable({
  id,
  titulo,
  filas,
}: {
  id: string;
  /** Encabezado que lleva la tabla al imprimirse. */
  titulo?: string;
  filas: FilaEstado[];
}) {
  return (
    <div className={estilos.datosDivididos}>
      <Tabla
        id={id}
        titulo={titulo}
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
      <section>
        <h3 className={estilos.panelDatosTitulo}>Distribución por estado</h3>
        <p className={estilos.panelDatosNota}>Cada segmento representa la participación de un estado sobre el total.</p>
        <TortaEstados filas={filas} />
      </section>
    </div>
  );
}
