"use client";

import { createContext, useContext } from "react";
import { responsableDe, type Responsable } from "@/lib/responsables";
import estilos from "./color-tiendas.module.css";

/**
 * El color de cada tienda según de quién es, disponible en todo el tablero.
 *
 * El índice se lee una vez en el layout y baja por contexto: así una celda de
 * tabla, la ficha del tracker o una tarjeta de seguimiento pintan el comercio
 * sin que cada página tenga que pedirlo y pasarlo a mano.
 */
const Indice = createContext<Record<string, string>>({});

export function ProveedorTiendas({
  indice,
  children,
}: {
  indice: Record<string, string>;
  children: React.ReactNode;
}) {
  return <Indice.Provider value={indice}>{children}</Indice.Provider>;
}

/** El índice entero, para quien pinta muchas tiendas en un mismo render. */
export function useIndiceTiendas(): Record<string, string> {
  return useContext(Indice);
}

/** El dueño de una tienda, o `null` si todavía no está repartida. */
export function useResponsable(tienda: string | null | undefined): Responsable | null {
  return responsableDe(useContext(Indice), tienda);
}

/**
 * El nombre de un comercio con el color de su dueño.
 *
 * Lleva un punto además del color del texto, y el grupo dicho con palabras
 * para lectores de pantalla y en el `title`: el color solo no puede ser el
 * único portador del dato. Sin dueño se muestra tal cual.
 *
 * `children` reemplaza al texto cuando quien lo usa necesita otra forma de
 * mostrarlo, como la celda que se acota cuando el nombre es largo.
 */
export function NombreTienda({
  nombre,
  children,
}: {
  nombre: string;
  children?: React.ReactNode;
}) {
  const responsable = useResponsable(nombre);
  if (!responsable) return <>{children ?? nombre}</>;

  const grupo = `Grupo ${responsable.grupo} (${responsable.nombre})`;
  return (
    <span
      className={estilos.tienda}
      style={{ "--color-tienda": responsable.color } as React.CSSProperties}
      title={`${nombre} · ${grupo}`}
    >
      <span className={estilos.punto} aria-hidden="true" />
      <span>{children ?? nombre}</span>
      <span className={estilos.soloLectores}> · {grupo}</span>
    </span>
  );
}
