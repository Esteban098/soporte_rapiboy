"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { actualizarDatos } from "@/app/actualizar";
import estilos from "./boton-actualizar.module.css";

/**
 * Lo que queda para contarle al equipo cuando termina la actualización.
 *
 * `sinFlujos` no es una falla: los datos se releyeron igual. Se avisa porque sin
 * webhooks cargados el botón solo refresca la lectura, y eso es indistinguible
 * de una actualización completa si nadie lo dice. Alguien podría estar tocando
 * Actualizar todo el día esperando que se rearmen las hojas.
 */
type Aviso = { tipo: "fallas"; fallas: string[] } | { tipo: "sinFlujos" };

/**
 * Rearma el libro y vuelve a leerlo.
 *
 * Dispara los flujos de n8n que rehacen las pestañas y, cuando terminan,
 * refresca el tablero. Si alguno falla, los datos se recargan igual y el motivo
 * queda a la vista: es peor dejar al equipo sin saber que la actualización salió
 * a medias.
 */
export function BotonActualizar({ hayFlujos }: { hayFlujos: boolean }) {
  const [cargando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const router = useRouter();

  return (
    <div className={estilos.contenedor}>
      <button
        type="button"
        className={estilos.boton}
        disabled={cargando}
        onClick={() =>
          iniciar(async () => {
            setAviso(null);
            const resultado = await actualizarDatos();

            // El servidor manda: `hayFlujos` se calculó al pintar la página, y
            // la configuración pudo cambiar desde entonces.
            setAviso(
              resultado.fallas.length > 0
                ? { tipo: "fallas", fallas: resultado.fallas }
                : resultado.flujos === 0
                  ? { tipo: "sinFlujos" }
                  : null,
            );
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
                <p className={estilos.overlayTitulo}>
                  {hayFlujos ? "Actualizando el tablero" : "Releyendo el sheet"}
                </p>
                <p className={estilos.overlayTexto}>
                  {hayFlujos
                    ? "Se están rearmando las hojas del libro. Puede tardar un minuto."
                    : "Se está descartando la copia guardada para leer la planilla de nuevo."}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}

      {aviso ? (
        <div
          className={`${estilos.aviso} ${aviso.tipo === "sinFlujos" ? estilos.avisoNeutro : ""}`}
          role={aviso.tipo === "fallas" ? "alert" : "status"}
        >
          {aviso.tipo === "fallas" ? (
            <>
              <p className={estilos.avisoTitulo}>
                {aviso.fallas.length === 1
                  ? "Un flujo no corrió"
                  : `${aviso.fallas.length} flujos no corrieron`}
              </p>
              <ul className={estilos.avisoLista}>
                {aviso.fallas.map((falla) => (
                  <li key={falla}>{falla}</li>
                ))}
              </ul>
              <p className={estilos.avisoPie}>
                Los datos se recargaron igual, pero pueden no incluir lo último.
              </p>
            </>
          ) : (
            <>
              <p className={estilos.avisoTitulo}>Se recargaron los datos</p>
              <p className={estilos.avisoTexto}>
                No hay ningún flujo de n8n configurado, así que las hojas del libro quedaron
                como estaban. Esto solo volvió a leer el sheet.
              </p>
              <p className={estilos.avisoPie}>
                Se cargan en <code className={estilos.clave}>N8N_WEBHOOKS</code>, con la URL de
                producción de cada webhook.
              </p>
            </>
          )}

          <button type="button" className={estilos.cerrar} onClick={() => setAviso(null)}>
            Entendido
          </button>
        </div>
      ) : null}
    </div>
  );
}
