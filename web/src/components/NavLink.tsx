"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import estilos from "./ui.module.css";

export function NavLink({
  href,
  exacto = false,
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
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const activo = href === "/" || exacto ? ruta === href : ruta.startsWith(href);

  return (
    <Link
      href={href}
      className={`${estilos.railItem} ${activo ? estilos.railItemActivo : ""}`}
      aria-current={activo ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
