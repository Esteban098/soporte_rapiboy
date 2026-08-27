/**
 * Preferencias de tabla guardadas en el navegador.
 *
 * Son por persona y por tabla: qué columnas eligió ocultar. Viven en
 * `localStorage` porque no hacen falta en el servidor y no tiene sentido
 * sincronizarlas entre usuarios.
 *
 * Se expone como un store externo para que los componentes lo consuman con
 * `useSyncExternalStore`: así el valor del servidor es siempre "sin preferencias"
 * —lo que evita que la hidratación choque— y la lectura del navegador entra
 * después sin encadenar renders.
 *
 * Todo acceso va en try/catch: en una ventana privada o con el almacenamiento
 * bloqueado, leer o escribir puede fallar, y ahí la tabla simplemente arranca
 * con todas las columnas.
 */
const PREFIJO = "tablero:columnas:";

const oyentes = new Set<() => void>();

export function suscribirPreferencias(oyente: () => void): () => void {
  oyentes.add(oyente);
  window.addEventListener("storage", oyente);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", oyente);
  };
}

/**
 * Devuelve el valor crudo guardado. Es un string y no un arreglo a propósito:
 * `useSyncExternalStore` compara por identidad, y un arreglo nuevo en cada
 * lectura lo haría renderizar sin parar.
 */
export function leerColumnasOcultas(idTabla: string): string {
  try {
    return window.localStorage.getItem(PREFIJO + idTabla) ?? "";
  } catch {
    return "";
  }
}

/** Valor en el servidor: ninguna preferencia, todas las columnas a la vista. */
export function sinPreferencias(): string {
  return "";
}

export function guardarColumnasOcultas(idTabla: string, ocultas: string[]): void {
  try {
    if (ocultas.length === 0) window.localStorage.removeItem(PREFIJO + idTabla);
    else window.localStorage.setItem(PREFIJO + idTabla, JSON.stringify(ocultas));
  } catch {
    // Sin almacenamiento disponible, la elección dura lo que dure la pantalla.
  }
  for (const oyente of oyentes) oyente();
}

export function parsearColumnasOcultas(crudo: string): string[] {
  if (!crudo) return [];
  try {
    const valor: unknown = JSON.parse(crudo);
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
