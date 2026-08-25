"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import estilos from "./ui.module.css";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const ruta = usePathname();
  const activo = href === "/" ? ruta === "/" : ruta.startsWith(href);

  return (
    <Link
      href={href}
      className={`${estilos.navLink} ${activo ? estilos.navLinkActive : ""}`}
      aria-current={activo ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
