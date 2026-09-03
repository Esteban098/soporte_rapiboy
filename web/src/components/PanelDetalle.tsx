"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import {
  detalleDe,
  detalleEnServidor,
  SIN_HIDRATAR,
  suscribirDetalle,
  TOPE_DETALLE,
} from "@/lib/detalle";
import { numero, porcentaje } from "@/lib/formato";
import { Callout, Card } from "./Card";
import { Tabla } from "./Tabla";
import estilos from "./ui.module.css";

/**
 * Lo que hay detrás de un punto de un gráfico.
 *
 * Las filas llegan por `localStorage`, así que esto se lee después de montar y
 * no en el servidor. Mientras tanto no se pinta nada: un esqueleto para algo
 * que tarda un cuadro es más ruido que espera.
 */
export function PanelDetalle() {
  const params = useSearchParams();
  const clave = params.get("d") ?? "";

  const datos = useSyncExternalStore(
    suscribirDetalle,
    useCallback(() => (clave ? detalleDe(clave) : null), [clave]),
    detalleEnServidor,
  );

  // Todavía no corrió nada en el navegador: no hay nada que decir sobre el
  // recorte, ni siquiera que falta.
  if (datos === SIN_HIDRATAR) return null;

  if (!datos) {
    return (
      <>
        <Encabezado eyebrow="Detalle" titulo="No encontré ese recorte" />
        <Callout tono="warning" titulo="El detalle ya no está guardado">
          Los recortes viven en el navegador y solo se guardan los últimos. Volvé al tablero y
          tocá de nuevo el dato del gráfico.
        </Callout>
      </>
    );
  }

  const recortado = datos.filas.length >= TOPE_DETALLE;
  const parte = datos.totalUniverso
    ? porcentaje((datos.filas.length / datos.totalUniverso) * 100)
    : null;

  return (
    <>
      <Encabezado
        eyebrow={datos.titulo}
        titulo={datos.contexto}
        dek={`${numero(datos.filas.length)} ${datos.filas.length === 1 ? "fila" : "filas"}${
          parte ? ` · ${parte} de las ${numero(datos.totalUniverso)} del universo` : ""
        }. Es el recorte que estaba detrás del punto que tocaste; se ordena, se filtra y se imprime igual que cualquier tabla del tablero.`}
      />

      <div className={estilos.stack}>
        {recortado ? (
          <Callout tono="warning" titulo="El recorte se cortó">
            Se pasan como máximo {numero(TOPE_DETALLE)} filas entre pestañas. Si necesitás verlas
            todas, filtrá antes en la tabla del tablero: el gráfico responde a esos filtros.
          </Callout>
        ) : null}

        <Card>
          <Tabla
            id={`detalle-${clave}`}
            titulo={`${datos.titulo} · ${datos.contexto}`}
            columnas={datos.columnas}
            filas={datos.filas}
            limite={50}
            vacio="El recorte quedó sin filas."
          />
        </Card>
      </div>
    </>
  );
}

/**
 * Mismo encabezado que el resto del tablero, sin el botón de actualizar: acá no
 * hay flujo que correr, las filas ya vinieron con el clic.
 */
function Encabezado({ eyebrow, titulo, dek }: { eyebrow: string; titulo: string; dek?: string }) {
  return (
    <div className={estilos.pageHead}>
      <div className={estilos.pageHeadFila}>
        <div className={estilos.pageHeadTexto}>
          <p className={estilos.eyebrow}>{eyebrow}</p>
          <h1 className={estilos.pageTitle}>{titulo}</h1>
        </div>
      </div>
      {dek ? <p className={estilos.pageDek}>{dek}</p> : null}
    </div>
  );
}
