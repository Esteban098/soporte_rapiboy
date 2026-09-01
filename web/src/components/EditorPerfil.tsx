"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { editarPerfil } from "@/app/perfiles";
import type { FilaPerfil } from "./PanelPerfiles";
import estilos from "./editor-caso.module.css";

/**
 * Edición de un perfil: correo, nombre y rol.
 *
 * Comparte los estilos con los otros diálogos del tablero. La contraseña no
 * está acá: resetearla es una acción aparte porque no se puede "editar" —no hay
 * un valor anterior que mostrar, solo se reemplaza.
 */
export function EditorPerfil({
  perfil,
  yo,
  alCerrar,
}: {
  perfil: FilaPerfil;
  /** Correo de quien edita, para avisarle si se está cambiando el suyo. */
  yo: string;
  alCerrar: () => void;
}) {
  const [email, setEmail] = useState(perfil.email);
  const [nombre, setNombre] = useState(perfil.nombre);
  const [rol, setRol] = useState(perfil.rol);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const router = useRouter();

  const esMio = perfil.email === yo;
  const cambiaMiCorreo = esMio && email.trim().toLowerCase() !== perfil.email;

  function guardar() {
    iniciar(async () => {
      setError(null);
      const resultado = await editarPerfil(perfil.id, {
        email,
        nombre,
        rol: rol === "admin" ? "admin" : "operador",
      });

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      alCerrar();
    });
  }

  return createPortal(
    <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label="Editar perfil">
      <div className={estilos.panel}>
        <h2 className={estilos.titulo}>{esMio ? "Mi perfil" : perfil.email}</h2>
        <p className={estilos.nota}>
          El correo es la identidad de la persona en todo el tablero: es lo que queda firmado en
          los reportes que carga y en los casos que edita. Cambiarlo no reescribe lo ya firmado.
        </p>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Correo</span>
          <input
            className={estilos.entrada}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            disabled={guardando}
          />
        </label>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Nombre</span>
          <input
            className={estilos.entrada}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Cómo aparece en el tablero"
            disabled={guardando}
          />
        </label>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Rol</span>
          <select
            className={estilos.entrada}
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            disabled={guardando || esMio}
          >
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>

        {esMio ? (
          <p className={estilos.nota}>
            Tu propio rol no se puede cambiar acá: si te bajaras de administrador, no habría cómo
            volver a subirte desde la web. Lo tiene que hacer otro administrador.
          </p>
        ) : null}

        {cambiaMiCorreo ? (
          <p className={estilos.error}>
            Estás cambiando tu propio correo. Cerrá sesión y volvé a entrar con el nuevo: la sesión
            abierta sigue con el anterior hasta que lo hagas.
          </p>
        ) : null}

        {error ? <p className={estilos.error}>{error}</p> : null}

        <div className={estilos.acciones}>
          <button type="button" className={estilos.principal} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            className={estilos.secundario}
            onClick={alCerrar}
            disabled={guardando}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
