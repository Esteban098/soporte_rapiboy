"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { actualizarDatos } from "@/app/actualizar";
import type { ClaveFlujo } from "@/lib/config";
import estilos from "./boton-actualizar.module.css";

/**
 * Lo que queda para contarle al equipo cuando termina la actualización.
 *
 * `sinFlujos` no es una falla: los datos se releyeron igual. Se avisa porque sin
 * webhooks cargados el botón solo refresca la lectura, y eso es indistinguible
 * de una actualización completa si nadie lo dice. Alguien podría estar tocando
 * Actualizar todo el día esperando que se rehagan los datos.
 */
type Aviso = { tipo: "fallas"; fallas: string[] } | { tipo: "sinFlujos" };

type Textos = {
  boton: string;
  cargando: string;
  conFlujos: string;
  sinFlujos: string;
  esperaTitulo: string;
  esperaTexto: string;
};

/**
 * Qué promete cada botón.
 *
 * Los tres hacen lo mismo —disparan flujos y descartan la caché— pero tardan y
 * significan cosas distintas, y el texto tiene que decirlo: quien aprieta el de
 * histórico está pidiendo revisar meses cerrados y conviene que sepa de entrada
 * que no es cuestión de segundos.
 */
const TEXTOS: Record<ClaveFlujo, Textos> = {
  global: {
    boton: "Actualizar",
    cargando: "Actualizando…",
    conFlujos:
      "Corre los flujos de n8n que rehacen los datos del mes en curso y después vuelve a leerlos. Puede tardar un minuto.",
    sinFlujos:
      "Vuelve a leer los datos. No hay flujos de n8n configurados, así que no se consulta el sistema.",
    esperaTitulo: "Actualizando el tablero",
    esperaTexto: "Se están rehaciendo los datos del mes en curso. Puede tardar un minuto.",
  },
  historico: {
    boton: "Actualizar histórico",
    cargando: "Actualizando el histórico…",
    conFlujos:
      "Vuelve a preguntarle al sistema en qué estado quedaron los casos de meses ya cerrados. Son muchos más que los del mes en curso, así que puede tardar varios minutos.",
    sinFlujos:
      "Vuelve a leer los datos guardados. No hay flujos de histórico configurados, así que no se consulta el sistema.",
    esperaTitulo: "Actualizando el histórico",
    esperaTexto:
      "Se está consultando el estado actual de los casos de meses cerrados. Puede tardar varios minutos.",
  },
  canceladosHistorico: {
    boton: "Actualizar histórico",
    cargando: "Actualizando el histórico…",
    conFlujos:
      "Vuelve a preguntarle al sistema y a Meli en qué estado quedaron las cancelaciones de meses ya cerrados. Puede tardar varios minutos.",
    sinFlujos:
      "Vuelve a leer los datos guardados. No hay flujos de histórico configurados, así que no se consulta el sistema.",
    esperaTitulo: "Actualizando los cancelados",
    esperaTexto:
      "Se está consultando el estado actual de las cancelaciones de meses cerrados. Puede tardar varios minutos.",
  },
  colectas: {
    boton: "Actualizar colectas",
    cargando: "Actualizando colectas…",
    conFlujos:
      "Vuelve a calcular quién colecta cada comercio y trae las colectas de los últimos 30 días.",
    sinFlujos:
      "Vuelve a leer lo guardado. No hay flujo de colectas configurado, así que no se consulta el sistema.",
    esperaTitulo: "Actualizando las colectas",
    esperaTexto:
      "Se está rehaciendo la asignación y releyendo los últimos 30 días. Puede tardar un minuto.",
  },
};

/**
 * Corre los flujos de n8n de una pantalla y vuelve a leer los datos.
 *
 * Si alguno falla, los datos se recargan igual y el motivo queda a la vista: es
 * peor dejar al equipo sin saber que la actualización salió a medias.
 */
export function BotonActualizar({
  clave = "global",
  hayFlujos,
  variable,
  periodo,
}: {
  /** Qué juego de flujos dispara. Define también qué dice el botón. */
  clave?: ClaveFlujo;
  /** Si hay webhooks cargados para esa clave. Define qué promete el botón. */
  hayFlujos: boolean;
  /** Nombre de la variable de entorno, para poder nombrarla si falta. Lo pasa
   *  el servidor: `config.ts` es `server-only` y acá solo entra su tipo. */
  variable: string;
  /** Qué meses se están mirando, para que el flujo pueda acotar la consulta. */
  periodo?: { desde: string; hasta: string };
}) {
  const [cargando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const router = useRouter();
  const textos = TEXTOS[clave];

  return (
    <div className={estilos.contenedor}>
      <button
        type="button"
        className={estilos.boton}
        disabled={cargando}
        title={hayFlujos ? textos.conFlujos : textos.sinFlujos}
        onClick={() =>
          iniciar(async () => {
            setAviso(null);
            const resultado = await actualizarDatos(clave, periodo);

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
        {cargando ? textos.cargando : textos.boton}
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
                  {hayFlujos ? textos.esperaTitulo : "Releyendo los datos"}
                </p>
                <p className={estilos.overlayTexto}>
                  {hayFlujos
                    ? textos.esperaTexto
                    : "Se está descartando la copia guardada para leer la base de nuevo."}
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
                No hay ningún flujo de n8n configurado para este botón, así que no se le preguntó
                nada al sistema: los casos quedaron con el estado que ya tenían guardado.
              </p>
              <p className={estilos.avisoPie}>
                Se cargan en <code className={estilos.clave}>{variable}</code>, con la URL de
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
