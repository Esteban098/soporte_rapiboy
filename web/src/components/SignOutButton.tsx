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
    >
      <span className={estilos.nombre} data-rail-texto>
        {nombre}
      </span>
      <span className={estilos.salir}>Salir</span>
    </button>
  );
}
