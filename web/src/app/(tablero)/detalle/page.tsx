import { Suspense } from "react";
import { PanelDetalle } from "@/components/PanelDetalle";

export const metadata = { title: "Detalle" };

/**
 * Lo que hay detrás de un punto de un gráfico, en su propia pestaña.
 *
 * La página no carga nada: las filas las dejó el gráfico en `localStorage` al
 * abrir la pestaña. Por eso el trabajo vive entero en el componente de cliente
 * y esto es solo el marco.
 */
export default function Detalle() {
  return (
    <Suspense>
      <PanelDetalle />
    </Suspense>
  );
}
