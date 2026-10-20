"use client";

import { signOut } from "next-auth/react";
import estilos from "./sign-out.module.css";

export function SignOutButton({ nombre }: { nombre: string }) {
  return (
    <button
      type="button"
      className={estilos.boton}
      onClick={() => signOut({ redirectTo: "/acceso" })}
      title={`Salir de la sesión de ${nombre}`}
      aria-label={`Salir de la sesión de ${nombre}`}
    >
      <svg className={estilos.icono} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M15 7l5 5-5 5m5-5H9" /></svg>
      <span className={estilos.nombre} data-rail-texto>
        {nombre}
      </span>
      <span className={estilos.salir}>Salir</span>
    </button>
  );
}
