"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refrescarDatos } from "@/app/actualizar";
import estilos from "./boton-actualizar.module.css";

/**
 * Vuelve a leer el sheet tal como está, sin correr los flujos de n8n.
 *
 * Es el botón para el caso más común: alguien tocó la planilla a mano y quiere
 * verlo en el tablero ahora. Tarda lo que tarda bajar el CSV, no el minuto que
 * tardan los flujos, así que va separado de Actualizar en vez de ser una opción
 * escondida adentro.
 *
 * Deja a la vista la hora de la última lectura porque si los números no cambian
 * —que es lo normal— no hay ninguna otra señal de que el botón hizo algo.
 */
export function BotonRefrescar() {
  const [cargando, iniciar] = useTransition();
  const [leido, setLeido] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className={estilos.refrescar}>
      {leido && !cargando ? (
        <span className={estilos.leido} aria-live="polite">
          leído {leido}
        </span>
      ) : null}

      <button
        type="button"
        className={`${estilos.boton} ${estilos.botonSuave}`}
        disabled={cargando}
        title="Vuelve a leer el Google Sheet ahora mismo, sin correr los flujos de n8n"
        onClick={() =>
          iniciar(async () => {
            await refrescarDatos();
            // Dentro de la transición, `cargando` sigue en true hasta que
            // termina de repintarse el tablero con los datos nuevos.
            router.refresh();
            setLeido(
              new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
            );
          })
        }
      >
        <span className={`${estilos.icono} ${cargando ? estilos.girando : ""}`} aria-hidden="true">
          ↻
        </span>
        {cargando ? "Leyendo…" : "Refrescar"}
      </button>
    </div>
  );
}
