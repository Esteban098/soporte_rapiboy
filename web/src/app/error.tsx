"use client";

import estilos from "./error.module.css";

/**
 * Un fallo acá casi siempre es de acceso a Supabase —credenciales mal copiadas
 * o una tabla sin crear—, así que el mensaje apunta a eso en vez de mostrar un
 * error genérico.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className={estilos.pantalla}>
      <div className={estilos.caja}>
        <h1 className={estilos.titulo}>No se pudieron cargar los datos</h1>
        <p className={estilos.texto}>
          Probablemente el tablero no pudo leer Supabase. Revisá SUPABASE_URL y
          SUPABASE_SERVICE_KEY en el entorno —el URL tiene la forma
          https://&lt;id-del-proyecto&gt;.supabase.co— y que las tablas estén creadas.
        </p>
        <pre className={estilos.detalle}>{error.message}</pre>
        <button type="button" className={estilos.boton} onClick={reset}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
