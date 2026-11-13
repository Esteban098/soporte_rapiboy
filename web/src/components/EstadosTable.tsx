"use client";

import type { FilaEstado } from "@/lib/metricas";
import type { Detalle } from "@/lib/detalle";
import { useVista } from "./useVista";
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
  detalle,
}: {
  id: string;
  /** Encabezado que lleva la tabla al imprimirse. */
  titulo?: string;
  filas: FilaEstado[];
  detalle?: Detalle;
}) {
  const datosTabla = filas.map((f) => ({ id: f.estado, estado: f.estado, caso: f.cerrado ? "Cerrado" : "Abierto", casos: f.casos, porcentaje: f.porcentaje }));
  const columnas = [
    { clave: "estado", titulo: "Estado", tipo: "estado" as const },
    { clave: "caso", titulo: "Caso", tipo: "caso" as const },
    { clave: "casos", titulo: "Casos", tipo: "numero" as const },
    { clave: "porcentaje", titulo: "% del total", tipo: "porcentaje" as const },
  ];
  const { filtradas } = useVista({ id, filas: datosTabla, columnas, filtros: [] });
  const estadosVisibles = new Set(filtradas.map((fila) => fila.estado));
  return (
    <div className={estilos.datosDivididos}>
      <Tabla
        id={id}
        titulo={titulo}
        columnas={columnas}
        filas={datosTabla}
        ordenInicial={{ clave: "casos", asc: false }}
        vacio="No hay casos para mostrar."
      />
      <section>
        <h3 className={estilos.panelDatosTitulo}>Distribución por estado</h3>
        <p className={estilos.panelDatosNota}>Cada segmento representa la participación de un estado sobre el total.</p>
        <TortaEstados filas={filas.filter((fila) => estadosVisibles.has(fila.estado))} detalle={detalle} />
      </section>
    </div>
  );
}
