"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import estilos from "./ui.module.css";

export function NavLink({
  href,
  exacto = false,
  destacado = false,
  nuevaVentana = false,
  titulo,
  children,
}: {
  href: string;
  /**
   * Marca activo solo en esa ruta exacta.
   *
   * Hace falta cuando una sección es prefijo de otra: sin esto, estando en
   * `/colectas/historial` se encienden las dos entradas y el menú deja de decir
   * dónde estás.
   */
  exacto?: boolean;
  /** La entrada se ve amarilla siempre, esté activa o no. Para Seguimiento. */
  destacado?: boolean;
  /** Abre un espacio de trabajo independiente, sin sacar al operador del tablero actual. */
  nuevaVentana?: boolean;
  /** Nombre de la sección como tooltip: con el menú plegado es lo único que la nombra. */
  titulo?: string;
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const activo = href === "/" || exacto ? ruta === href : ruta.startsWith(href);

  return (
    <Link
      href={href}
      className={`${estilos.railItem} ${activo ? estilos.railItemActivo : ""} ${destacado ? estilos.railItemAmarillo : ""}`}
      aria-current={activo ? "page" : undefined}
      title={titulo}
      target={nuevaVentana ? "_blank" : undefined}
      rel={nuevaVentana ? "noreferrer" : undefined}
    >
      {children}
    </Link>
  );
}
