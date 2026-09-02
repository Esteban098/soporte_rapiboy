"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import estilos from "./ui.module.css";

/**
 * Un grupo del menú, con sus secciones adentro.
 *
 * Se puede plegar. Antes los grupos eran solo un título y todas las secciones
 * estaban siempre a la vista; con la plataforma creciendo eso pasó a ser una
 * lista larga donde cuesta encontrar nada.
 *
 * El grupo que contiene la ruta actual arranca abierto y no se puede cerrar
 * mientras estés parado ahí: plegar el grupo en el que estás esconde dónde
 * estás, que es lo único que el menú tiene que dejar claro siempre.
 *
 * El estado no se guarda entre visitas a propósito. Recordarlo haría que
 * alguien vuelva al tablero y no encuentre una sección que ayer estaba, sin
 * saber que fue él quien la plegó.
 */
export function NavGrupo({
  titulo,
  rutas,
  icono,
  children,
}: {
  titulo: string;
  /** Las rutas de sus secciones, para saber si el grupo contiene la actual. */
  rutas: string[];
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const contieneLaActual = rutas.some((href) =>
    href === "/" ? ruta === "/" : ruta.startsWith(href),
  );
  const [abiertoAMano, setAbiertoAMano] = useState(false);
  const abierto = contieneLaActual || abiertoAMano;

  return (
    <div className={estilos.railGrupo}>
      <button
        type="button"
        className={`${estilos.railGrupoBoton} ${abierto ? estilos.railGrupoAbierto : ""}`}
        aria-expanded={abierto}
        // Estando adentro, el botón solo informa: no hay nada que plegar.
        disabled={contieneLaActual}
        onClick={() => setAbiertoAMano((v) => !v)}
      >
        <span className={estilos.railGrupoIcono} aria-hidden="true">
          {icono}
        </span>
        <span className={estilos.railGrupoTexto}>{titulo}</span>
        <span className={estilos.railGrupoFlecha} aria-hidden="true">
          {abierto ? "▾" : "▸"}
        </span>
      </button>

      {abierto ? <ul className={estilos.railLista}>{children}</ul> : null}
    </div>
  );
}
