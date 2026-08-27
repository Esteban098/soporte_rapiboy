"use client";

import { useState, useTransition } from "react";
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
