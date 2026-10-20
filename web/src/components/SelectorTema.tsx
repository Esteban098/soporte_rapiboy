"use client";

import { useSyncExternalStore } from "react";
import { CLAVE_TEMA, TEMA_PREDETERMINADO, type Tema } from "@/lib/tema";
import estilos from "./selector-tema.module.css";

/**
 * Claro, oscuro o lo que diga el sistema.
 *
 * Las paletas están en `theme.css`: acá se resuelve y aplica
 * `data-theme` en `<html>`. «Sistema» sigue `prefers-color-scheme`, incluso
 * cuando cambia con la pantalla abierta. Sin elección se usa el sistema.
 * La elección vive en `localStorage` porque es de este navegador y
 * no de la cuenta; el script de `layout.tsx` la aplica antes del primer
 * pintado para que no haya un destello del tema equivocado.
 */
const OPCIONES: { valor: Tema; etiqueta: string; icono: () => React.ReactElement }[] = [
  { valor: "light", etiqueta: "Claro", icono: Sol },
  { valor: "dark", etiqueta: "Oscuro", icono: Luna },
  { valor: "system", etiqueta: "Sistema", icono: Pantalla },
];

const oyentes = new Set<() => void>();

function leer(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    return guardado === "light" || guardado === "dark" || guardado === "system" ? guardado : TEMA_PREDETERMINADO;
  } catch {
    return TEMA_PREDETERMINADO;
  }
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  /* Otra pestaña que cambia el tema también mueve esta. */
  const alGuardar = (evento: StorageEvent) => {
    if (evento.key === CLAVE_TEMA) {
      aplicar(leer());
      avisar();
    }
  };
  window.addEventListener("storage", alGuardar);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const alCambiarSistema = () => { if (leer() === "system") aplicar("system"); };
  media.addEventListener("change", alCambiarSistema);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", alGuardar);
    media.removeEventListener("change", alCambiarSistema);
  };
}

function aplicar(tema: Tema) {
  const resuelto = tema === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : tema;
  document.documentElement.setAttribute("data-theme", resuelto);
}

function elegir(tema: Tema) {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    /* Sin almacenamiento el cambio vale hasta recargar. */
  }
  aplicar(tema);
  oyentes.forEach((avisar) => avisar());
}

export function SelectorTema() {
  const tema = useSyncExternalStore(suscribir, leer, () => TEMA_PREDETERMINADO);

  return (
    <div className={estilos.grupo} role="radiogroup" aria-label="Tema de la interfaz" data-noimprimir>
      {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => (
        <button
          key={valor}
          type="button"
          role="radio"
          aria-checked={tema === valor}
          className={estilos.opcion}
          onClick={() => elegir(valor)}
          title={etiqueta}
        >
          <Icono />
          <span className={estilos.oculto}>{etiqueta}</span>
        </button>
      ))}
    </div>
  );
}

function Sol() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="2.75" />
      <path
        d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Luna() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13.25 9.6A5.5 5.5 0 1 1 6.4 2.75a4.5 4.5 0 0 0 6.85 6.85Z" strokeLinejoin="round" />
    </svg>
  );
}

function Pantalla() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="2.75" width="12" height="8.5" rx="1.5" />
      <path d="M6 13.75h4M8 11.25v2.5" strokeLinecap="round" />
    </svg>
  );
}
