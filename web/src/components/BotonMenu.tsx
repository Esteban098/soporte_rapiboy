"use client";

import { useSyncExternalStore } from "react";
import { CLAVE_MENU, MENU_ABIERTO, MENU_CORTO } from "@/lib/menu";
import estilos from "./ui.module.css";

/**
 * Pliega la barra lateral a una columna de íconos.
 *
 * Igual que el tema, solo pone o saca un atributo en `<html>` (`data-menu`) y
 * todo lo demás lo resuelve `ui.module.css`. Por defecto queda reducido a
 * iconos; `localStorage` solo conserva la elección explícita de abrirlo.
 */
const oyentes = new Set<() => void>();

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE_MENU) !== MENU_ABIERTO;
  } catch {
    return true;
  }
}

function aplicar(corto: boolean) {
  if (corto) document.documentElement.setAttribute("data-menu", MENU_CORTO);
  else document.documentElement.removeAttribute("data-menu");
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  const alGuardar = (evento: StorageEvent) => {
    if (evento.key === CLAVE_MENU) {
      aplicar(leer());
      avisar();
    }
  };
  window.addEventListener("storage", alGuardar);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", alGuardar);
  };
}

function alternar() {
  const corto = !leer();
  try {
    if (corto) localStorage.removeItem(CLAVE_MENU);
    else localStorage.setItem(CLAVE_MENU, MENU_ABIERTO);
  } catch {
    /* Sin almacenamiento el cambio vale hasta recargar. */
  }
  aplicar(corto);
  oyentes.forEach((avisar) => avisar());
}

export function BotonMenu() {
  const corto = useSyncExternalStore(suscribir, leer, () => true);
  const etiqueta = corto ? "Mostrar menú" : "Ocultar menú";

  return (
    <button
      type="button"
      className={`${estilos.railItem} ${estilos.railPlegar}`}
      onClick={alternar}
      aria-expanded={!corto}
      title={etiqueta}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
        <path d="M6 2.5v11" />
        <path d={corto ? "M8.8 6.3 10.5 8l-1.7 1.7" : "M10.5 6.3 8.8 8l1.7 1.7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span data-rail-texto>{etiqueta}</span>
    </button>
  );
}
