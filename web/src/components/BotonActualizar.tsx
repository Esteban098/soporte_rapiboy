"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualizarDatos } from "@/app/actualizar";
import estilos from "./boton-actualizar.module.css";

export function BotonActualizar() {
  const [cargando, iniciar] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className={estilos.boton}
      disabled={cargando}
      onClick={() =>
        iniciar(async () => {
          await actualizarDatos();
          router.refresh();
        })
      }
    >
      <span className={`${estilos.icono} ${cargando ? estilos.girando : ""}`} aria-hidden="true">
        ⟳
      </span>
      {cargando ? "Actualizando…" : "Actualizar"}
    </button>
  );
}
