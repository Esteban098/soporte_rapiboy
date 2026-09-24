"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import { SelectorTema } from "./SelectorTema";
import logo from "@/app/icon.png";
import estilos from "./colectas-shell.module.css";

type Entrada = { href: string; etiqueta: string; exacto?: boolean; beta?: boolean; soloOperador?: boolean };

const ENTRADAS: Entrada[] = [
  { href: "/colectas", etiqueta: "Asignación", exacto: true },
  { href: "/colectas/asistencia", etiqueta: "Asistencia", soloOperador: true },
  { href: "/colectas/historial", etiqueta: "Historial", beta: true },
  { href: "/tiendas", etiqueta: "Ruta en vivo" },
];

/** Espacio de trabajo independiente para planificar y seguir colectas. */
export function ColectasShell({ children, usuario, puedeOperar = true }: { children: React.ReactNode; usuario?: string | null; puedeOperar?: boolean }) {
  const ruta = usePathname();

  return (
    <div className={estilos.app}>
      <aside className={estilos.sidebar} aria-label="Navegación de colectas">
        <Link href="/colectas" className={estilos.marca}>
          <span className={estilos.logo}><Image src={logo} alt="Rapiboy" width={28} height={28} priority /></span>
          <span><b>Colectas</b><small>Espacio operativo</small></span>
        </Link>

        <nav className={estilos.nav}>
          <p>Operación de colectas</p>
          {ENTRADAS.filter((entrada) => !entrada.soloOperador || puedeOperar).map((entrada) => {
            const activa = entrada.exacto ? ruta === entrada.href : ruta.startsWith(entrada.href);
            return (
              <Link key={entrada.href} href={entrada.href} className={`${estilos.enlace} ${activa ? estilos.activo : ""}`} aria-current={activa ? "page" : undefined}>
                {entrada.etiqueta}
                {entrada.beta ? <span>BETA</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className={estilos.pie}>
          <Link href="/" className={estilos.volver}>← Volver al tablero</Link>
          {usuario ? <SignOutButton nombre={usuario} /> : null}
        </div>
      </aside>

      <div className={estilos.contenido}>
        <header className={estilos.barra}><span>Colectas · México</span><SelectorTema /></header>
        <main className={estilos.main}>{children}</main>
      </div>
    </div>
  );
}
