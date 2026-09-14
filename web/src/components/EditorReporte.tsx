"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { borrarSeguimiento, editarSeguimiento } from "@/app/seguimiento";
import type { Seguimiento } from "@/lib/seguimiento";
import { AreaMenciones } from "./AreaMenciones";
import estilos from "./editor-caso.module.css";

/**
 * Corrección y baja de un reporte.
 *
 * Comparte los estilos con el editor de casos a propósito: son la misma
 * operación desde el punto de vista de quien la usa —abrir una ficha, cambiar
 * algo, guardar o borrar— y no hay razón para que se vean distinto.
 *
 * Los adjuntos no se editan acá. Cambiar la lista pediría firmar subidas nuevas
 * y borrar las viejas dentro de la misma operación, con la mitad hecha si algo
 * falla; para reemplazarlos, se borra el reporte y se carga de nuevo.
 */
export function EditorReporte({
  reporte,
  alCerrar,
}: {
  reporte: Seguimiento;
  alCerrar: () => void;
}) {
  const [casoId, setCasoId] = useState(reporte.casoId);
  const [driver, setDriver] = useState(reporte.driver ?? "");
  const [seller, setSeller] = useState(reporte.seller ?? "");
  const [comentario, setComentario] = useState(reporte.comentario);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, iniciar] = useTransition();
  const router = useRouter();

  const cambio =
    casoId.trim() !== reporte.casoId ||
    driver.trim() !== (reporte.driver ?? "") ||
    seller.trim() !== (reporte.seller ?? "") ||
    comentario.trim() !== reporte.comentario;

  function guardar() {
    iniciar(async () => {
      setError(null);
      const resultado = await editarSeguimiento(reporte.id, {
        casoId,
        driver,
        seller,
        comentario,
        archivos: [],
      });

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      alCerrar();
    });
  }

  function borrar() {
    iniciar(async () => {
      setError(null);
      const resultado = await borrarSeguimiento(reporte.id);

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      alCerrar();
    });
  }

  return createPortal(
    <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label="Editar reporte">
      <div className={estilos.panel}>
        <h2 className={estilos.titulo}>Reporte del caso {reporte.casoId}</h2>
        <p className={estilos.nota}>
          Lo cargó {reporte.creadoPor}. Al cambiar el comentario se rehace el resumen: uno que
          describa un texto que ya no está se lee igual de confiado y por eso no puede quedar.
        </p>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Id del caso</span>
          <input
            className={estilos.entrada}
            value={casoId}
            onChange={(e) => setCasoId(e.target.value)}
            inputMode="numeric"
            disabled={guardando}
          />
        </label>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Driver a cargo</span>
          <input
            className={estilos.entrada}
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            placeholder="Se completa desde Mensual/Histórico si queda vacío"
            disabled={guardando}
          />
        </label>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Seller</span>
          <input
            className={estilos.entrada}
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            placeholder="Se completa desde Mensual/Histórico si queda vacío"
            disabled={guardando}
          />
        </label>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Comentario</span>
          <AreaMenciones
            className={`${estilos.entrada} ${estilos.area}`}
            value={comentario}
            onValueChange={setComentario}
            rows={6}
            disabled={guardando}
          />
          <span className={estilos.nota}>
            Escribí @ para avisarle a alguien. Solo se notifica a las menciones nuevas.
          </span>
        </label>

        {reporte.archivos.length > 0 ? (
          <p className={estilos.nota}>
            Tiene {reporte.archivos.length}{" "}
            {reporte.archivos.length === 1 ? "adjunto" : "adjuntos"}. No se editan desde acá; se
            borran junto con el reporte.
          </p>
        ) : null}

        {error ? <p className={estilos.error}>{error}</p> : null}

        {confirmando ? (
          <div className={estilos.confirmar}>
            <p className={estilos.confirmarTexto}>
              Se borra el reporte y sus adjuntos, para siempre. Lo que se haya hecho con el caso
              en el sistema no cambia; lo que se pierde es lo que se escribió acá.
            </p>
            <div className={estilos.acciones}>
              <button type="button" className={estilos.peligro} onClick={borrar} disabled={guardando}>
                Sí, borrarlo
              </button>
              <button
                type="button"
                className={estilos.secundario}
                onClick={() => setConfirmando(false)}
                disabled={guardando}
              >
                Volver
              </button>
            </div>
          </div>
        ) : (
          <div className={estilos.acciones}>
            <button type="button" className={estilos.principal} onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : cambio ? "Guardar y resumir de nuevo" : "Guardar"}
            </button>
            <button
              type="button"
              className={estilos.secundario}
              onClick={alCerrar}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={estilos.borrar}
              onClick={() => setConfirmando(true)}
              disabled={guardando}
            >
              Borrar
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
