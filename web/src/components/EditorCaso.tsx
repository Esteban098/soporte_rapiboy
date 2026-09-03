"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { agregarCaso, borrarCaso, editarCaso, type DatosCaso } from "@/app/casos";
import estilos from "./editor-caso.module.css";

/** Qué caso se está tocando: uno existente, o uno nuevo. */
export type Edicion = { modo: "nuevo" } | { modo: "editar"; id: number; datos: DatosCaso };

const VACIO: DatosCaso = { reclamoTienda: "", ubicacion: "", telefono: "", aviso: "" };

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
 * Alta y edición de un caso.
 *
 * Solo se editan las columnas que carga soporte. Las del sistema —estado,
 * repartidor, comercio, visitas— se muestran como lo que son: algo que llena el
 * refresco, no algo para escribir a mano. Si se pudieran editar, el cambio
 * duraría hasta la próxima corrida de n8n.
 */
export function EditorCaso({ edicion, alCerrar }: { edicion: Edicion; alCerrar: () => void }) {
  const nuevo = edicion.modo === "nuevo";
  const [id, setId] = useState(nuevo ? "" : String(edicion.id));
  const [datos, setDatos] = useState<DatosCaso>(nuevo ? VACIO : edicion.datos);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, iniciar] = useTransition();
  const router = useRouter();

  const campo = (clave: keyof DatosCaso) => ({
    value: datos[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDatos((d) => ({ ...d, [clave]: e.target.value })),
  });

  function guardar() {
    iniciar(async () => {
      setError(null);
      const numero = Number(id.trim());
      const resultado = nuevo
        ? await agregarCaso(numero, datos)
        : await editarCaso(edicion.id, datos);

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
      const resultado = await borrarCaso(Number(id));
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      alCerrar();
    });
  }

  return createPortal(
    <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label={nuevo ? "Agregar caso" : "Editar caso"}>
      <div className={estilos.panel}>
        <h2 className={estilos.titulo}>{nuevo ? "Agregar un caso" : `Caso ${edicion.id}`}</h2>
        <p className={estilos.nota}>
          {nuevo
            ? "Alcanza con el id del viaje. El estado, el repartidor y el comercio los completa el refresco de estados cuando encuentre el pedido en el sistema."
            : "Se editan solo los datos que aporta la tienda. El resto lo reescribe n8n en cada corrida."}
        </p>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Id del viaje</span>
          <input
            className={estilos.entrada}
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={!nuevo}
            inputMode="numeric"
            placeholder="29642607"
          />
        </label>

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

        {error ? <p className={estilos.error}>{error}</p> : null}

        {confirmando ? (
          <div className={estilos.confirmar}>
            <p className={estilos.confirmarTexto}>
              Se borra el caso {edicion.modo === "editar" ? edicion.id : ""} y lo que la tienda
              aportó. Si el pedido sigue vivo en el sistema, la ingesta lo va a traer de nuevo
              mañana, pero sin estos datos.
            </p>
            <div className={estilos.acciones}>
              <button type="button" className={estilos.peligro} onClick={borrar} disabled={guardando}>
                Sí, borrarlo
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
            {!nuevo ? (
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
