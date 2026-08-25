"use client";

import estilos from "./error.module.css";

/**
 * Un fallo acá casi siempre es de acceso al sheet, así que el mensaje apunta a
 * eso en vez de mostrar un error genérico.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className={estilos.pantalla}>
      <div className={estilos.caja}>
        <h1 className={estilos.titulo}>No se pudieron cargar los datos</h1>
        <p className={estilos.texto}>
          Probablemente el tablero no pudo leer el Google Sheet. Revisá que el documento siga
          compartido con enlace de lectura y que no le hayan cambiado el nombre a ninguna pestaña.
        </p>
        <pre className={estilos.detalle}>{error.message}</pre>
        <button type="button" className={estilos.boton} onClick={reset}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
