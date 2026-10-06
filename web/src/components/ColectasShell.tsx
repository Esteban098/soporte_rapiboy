"use client";

import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import { SelectorTema } from "./SelectorTema";
import { NavegacionHorizontal } from "./NavegacionHorizontal";
import type { RolPerfil } from "@/lib/permisos";
import logo from "@/app/icon.png";
import estilos from "./colectas-shell.module.css";

/** Espacio de trabajo independiente para planificar y seguir colectas. */
export function ColectasShell({ children, usuario, rol = null }: { children: React.ReactNode; usuario?: string | null; rol?: RolPerfil | null }) {
  return (
    <div className={estilos.app}>
      <aside className={estilos.sidebar} aria-label="Navegación de colectas">
        <Link href="/colectas" className={estilos.marca}>
          <span className={estilos.logo}><Image src={logo} alt="Rapiboy" width={28} height={28} priority /></span>
          <span><b>Colectas</b><small>Espacio operativo</small></span>
        </Link>

        <div className={estilos.pie}>
          <Link href="/" className={estilos.volver}>← Volver al tablero</Link>
          {usuario ? <SignOutButton nombre={usuario} /> : null}
        </div>
      </aside>

      <div className={estilos.contenido}>
        <header className={estilos.barra}><span>Colectas · México</span><SelectorTema /></header>
        <main className={estilos.main}><NavegacionHorizontal rol={rol} />{children}</main>
      </div>
    </div>
  );
}
