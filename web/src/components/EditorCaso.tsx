"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  agregarPaquete,
  editarInformacionPaquete,
  quitarPaquete,
  type DatosPaquete,
} from "@/app/casos";
import { MOTIVOS_SINIESTRO, type OrigenCobro } from "@/lib/siniestrados";
import estilos from "./editor-caso.module.css";

/** Qué paquete se está tocando: uno existente, o uno nuevo. */
export type Edicion = { modo: "nuevo" } | { modo: "editar"; id: number; datos: DatosPaquete };

const VACIO: DatosPaquete = {
  reclamoTienda: "",
  ubicacion: "",
  telefono: "",
  aviso: "",
  motivoSiniestro: "",
  comentarioSiniestro: "",
};

/**
 * Las tipificaciones que ya usa soporte, ordenadas por lo que más aparece.
 *
 * Van como sugerencias y no como lista cerrada: si mañana surge un tipo nuevo,
 * se escribe y listo, sin tocar código. Pero tenerlas a la vista evita lo que
 * pasó en el libro, donde un "IDICACIONES" mal tipeado quedó contando como una
 * categoría aparte.
 */
const TIPIFICACIONES = [
  "NUMERO ALTERNO",
  "ENTREGAR EN ESTA UBICACION",
  "INDICACIONES",
  "DIRECCION Y NUMERO",
  "SEGUIMIENTO",
  "ENTREGAR EN ESTA DIRECCION",
  "DOMICILIO ALTERNO",
];

/**
 * Alta de paquetes y edición de su información manual.
 *
 * Solo se editan las columnas que carga soporte. Las del sistema —estado,
 * repartidor, comercio, visitas— se muestran como lo que son: algo que llena el
 * refresco, no algo para escribir a mano. Si se pudieran editar, el cambio
 * duraría hasta la próxima corrida de n8n.
 */
export function EditorCaso({
  edicion,
  alCerrar,
  mostrarSiniestro = false,
  origen = "mensual",
  puedeBorrar = true,
}: {
  edicion: Edicion;
  alCerrar: () => void;
  mostrarSiniestro?: boolean;
  origen?: OrigenCobro;
  puedeBorrar?: boolean;
}) {
  const nuevo = edicion.modo === "nuevo";
  const [id, setId] = useState(nuevo ? "" : String(edicion.id));
  const [datos, setDatos] = useState<DatosPaquete>(nuevo ? VACIO : edicion.datos);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, iniciar] = useTransition();
  const router = useRouter();

  const campo = (clave: keyof DatosPaquete) => ({
    value: datos[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setDatos((d) => ({ ...d, [clave]: e.target.value })),
  });

  function guardar() {
    iniciar(async () => {
      setError(null);
      const numero = Number(id.trim());
      const resultado = nuevo
        ? await agregarPaquete(numero, datos, mostrarSiniestro)
        : await editarInformacionPaquete(edicion.id, datos, origen, mostrarSiniestro);

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
      const resultado = await quitarPaquete(Number(id));
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      alCerrar();
    });
  }

  return createPortal(
    <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label={nuevo ? "Agregar paquete" : "Editar información del paquete"}>
      <div className={estilos.panel}>
        <h2 className={estilos.titulo}>
          {nuevo
            ? mostrarSiniestro ? "Agregar paquete siniestrado" : "Agregar paquete"
            : mostrarSiniestro ? `Información del siniestro · ${edicion.id}` : `Información de tienda · ${edicion.id}`}
        </h2>
        <p className={estilos.nota}>
          {nuevo
            ? mostrarSiniestro
              ? "Ingresá el ID del paquete. Se valida que RapiboyData lo informe como Siniestrado y que no esté cargado; el refresco completa los datos operativos."
              : "Ingresá solo el ID del paquete. El refresco completa estado, repartidor y tienda; la información de tienda se carga después desde la fila del paquete."
            : mostrarSiniestro
              ? "Se editan únicamente el motivo y el comentario del siniestro."
              : "Cargá solamente la información aportada por la tienda. El resto lo actualiza n8n."}
        </p>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>ID del paquete</span>
          <input
            className={estilos.entrada}
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={!nuevo}
            inputMode="numeric"
            placeholder="29642607"
          />
        </label>

        {/* La información de tienda pertenece a un paquete existente. El alta
            normal solo crea su ID; Siniestrados usa su propio bloque manual. */}
        {!nuevo && !mostrarSiniestro ? (
          <>
            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Reclamo de tienda</span>
              <input
                className={estilos.entrada}
                list="tipificaciones-reclamo"
                {...campo("reclamoTienda")}
                placeholder="Elegí una o escribí otra"
              />
              <datalist id="tipificaciones-reclamo">
                {TIPIFICACIONES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Ubicación</span>
              <input className={estilos.entrada} {...campo("ubicacion")} placeholder="Link de mapa" />
            </label>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Teléfono o indicación</span>
              <input className={estilos.entrada} {...campo("telefono")} placeholder="55 1234 5678" />
            </label>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Aviso</span>
              <select className={estilos.entrada} {...campo("aviso")}>
                <option value="">Sin datos para avisar</option>
                <option value="NO AVISADO">NO AVISADO</option>
                <option value="AVISADO">AVISADO</option>
              </select>
            </label>
          </>
        ) : null}

        {mostrarSiniestro ? (
          <>
            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Motivo del siniestro</span>
              <select className={estilos.entrada} {...campo("motivoSiniestro")}>
                <option value="">Sin motivo</option>
                {MOTIVOS_SINIESTRO.map((motivo) => (
                  <option key={motivo} value={motivo}>
                    {motivo}
                  </option>
                ))}
              </select>
            </label>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Comentario del siniestro</span>
              <textarea
                className={estilos.entrada}
                {...campo("comentarioSiniestro")}
                rows={3}
                placeholder="Detalle adicional"
              />
            </label>
          </>
        ) : null}

        {error ? <p className={estilos.error}>{error}</p> : null}

        {confirmando ? (
          <div className={estilos.confirmar}>
            <p className={estilos.confirmarTexto}>
              Se borra el paquete {edicion.modo === "editar" ? edicion.id : ""} y su información manual.
              Si el pedido sigue vivo en el sistema, la ingesta lo va a traer de nuevo
              mañana, pero sin estos datos.
            </p>
            <div className={estilos.acciones}>
              <button type="button" className={estilos.peligro} onClick={borrar} disabled={guardando}>
                Sí, quitarlo
              </button>
              <button type="button" className={estilos.secundario} onClick={() => setConfirmando(false)}>
                Volver
              </button>
            </div>
          </div>
        ) : (
          <div className={estilos.acciones}>
            <button type="button" className={estilos.principal} onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className={estilos.secundario} onClick={alCerrar} disabled={guardando}>
              Cancelar
            </button>
            {!nuevo && puedeBorrar ? (
              <button
                type="button"
                className={estilos.borrar}
                onClick={() => setConfirmando(true)}
                disabled={guardando}
              >
                Borrar
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
