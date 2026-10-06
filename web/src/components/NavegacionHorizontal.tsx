"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FAMILIAS_NAVEGACION } from "@/lib/navegacion";
import { puedeVerRuta, type RolPerfil } from "@/lib/permisos";
import estilos from "./navegacion-horizontal.module.css";

function coincide(ruta: string, base: string): boolean {
  return base === "/" ? ruta === "/" : ruta === base || ruta.startsWith(`${base}/`);
}

export function NavegacionHorizontal({ rol = null }: { rol?: RolPerfil | null }) {
  const ruta = usePathname();
  const familia = FAMILIAS_NAVEGACION.find((grupo) => grupo.rutas.some((base) => coincide(ruta, base)));
  if (!familia) return null;
  const entradas = familia.entradas.filter((entrada) => puedeVerRuta(rol, entrada.href));
  if (entradas.length < 2) return null;

  return <nav className={estilos.nav} aria-label={familia.etiqueta}>
    {entradas.map((entrada) => {
      const activa = entrada.activaEn
        ? entrada.activaEn.some((base) => coincide(ruta, base))
        : entrada.exacta ? ruta === entrada.href : coincide(ruta, entrada.href);
      return <Link key={entrada.href} href={entrada.href} className={activa ? estilos.activa : ""} aria-current={activa ? "page" : undefined}>
        {entrada.etiqueta}
      </Link>;
    })}
  </nav>;
}
