"use client";

import { useState } from "react";
import estilos from "./tabla.module.css";

/** A partir de acá el contenido se acorta y se puede desplegar con un clic. */
const LARGO_MAXIMO = 32;

/**
 * Celda de texto que se acota cuando el contenido es largo. Al tocarla se
 * despliega completa, y volviendo a tocarla se acota de nuevo.
 */
export function CeldaTexto({ valor }: { valor: string }) {
  const [abierta, setAbierta] = useState(false);
  const largo = valor.length > LARGO_MAXIMO;

  if (!largo) return <>{valor}</>;

  return (
    <>
      <button
        type="button"
        className={`${estilos.celdaTexto} ${abierta ? estilos.celdaAbierta : ""}`}
        onClick={() => setAbierta((v) => !v)}
        title={abierta ? "Tocar para acortar" : valor}
        aria-expanded={abierta}
        >
        {abierta ? valor : `${valor.slice(0, LARGO_MAXIMO).trimEnd()}…`}
      </button>

      {/* En el papel no hay dónde tocar, así que va el contenido entero. */}
      <span className={estilos.soloImpresion}>{valor}</span>
    </>
  );
}
