"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { actualizarDatos } from "@/app/actualizar";
import estilos from "./boton-actualizar.module.css";

/**
 * Rearma el libro y vuelve a leerlo.
 *
 * Dispara los flujos de n8n que rehacen las pestañas y, cuando terminan,
 * refresca el tablero. Si alguno falla, los datos se recargan igual y el motivo
 * queda a la vista: es peor dejar al equipo sin saber que la actualización salió
 * a medias.
 */
export function BotonActualizar() {
  const [cargando, iniciar] = useTransition();
  const [fallas, setFallas] = useState<string[]>([]);
  const router = useRouter();

  return (
    <div className={estilos.contenedor}>
      <button
        type="button"
        className={estilos.boton}
        disabled={cargando}
        onClick={() =>
          iniciar(async () => {
            setFallas([]);
            const resultado = await actualizarDatos();
            setFallas(resultado.fallas);
            router.refresh();
          })
        }
      >
        <span className={`${estilos.icono} ${cargando ? estilos.girando : ""}`} aria-hidden="true">
          ⟳
        </span>
        {cargando ? "Actualizando…" : "Actualizar"}
      </button>

      {/*
        El overlay va al body con un portal, no acá adentro: la barra superior
        tiene `backdrop-filter`, y eso la convierte en el bloque contenedor de
        cualquier `position: fixed` que cuelgue de ella. Sin el portal, la
        pantalla de espera queda encerrada en los 60 px de la barra y no tapa
        nada. Solo se monta con `cargando` en true, que nunca pasa en el
        servidor, así que `document` siempre existe cuando se ejecuta.
      */}
      {cargando
        ? createPortal(
            <div className={estilos.overlay} role="status" aria-live="polite">
              <div className={estilos.overlayCaja}>
                <span className={estilos.overlayRueda} aria-hidden="true" />
                <p className={estilos.overlayTitulo}>Actualizando el tablero</p>
                <p className={estilos.overlayTexto}>
                  Se están rearmando las hojas del libro. Puede tardar un minuto.
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}

      {fallas.length > 0 ? (
        <div className={estilos.aviso} role="alert">
          <p className={estilos.avisoTitulo}>
            {fallas.length === 1 ? "Un flujo no corrió" : `${fallas.length} flujos no corrieron`}
          </p>
          <ul className={estilos.avisoLista}>
            {fallas.map((falla) => (
              <li key={falla}>{falla}</li>
            ))}
          </ul>
          <p className={estilos.avisoPie}>
            Los datos se recargaron igual, pero pueden no incluir lo último.
          </p>
          <button type="button" className={estilos.cerrar} onClick={() => setFallas([])}>
            Entendido
          </button>
        </div>
      ) : null}
    </div>
  );
}
