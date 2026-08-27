/**
 * Preferencias de tabla guardadas en el navegador.
 *
 * Son por persona y por tabla: qué columnas eligió ocultar y con qué filtros
 * dejó la vista. Viven en `localStorage` porque no hacen falta en el servidor y
 * no tiene sentido sincronizarlas entre usuarios.
 *
 * Se expone como un store externo para que los componentes lo consuman con
 * `useSyncExternalStore`: así el valor del servidor es siempre "sin
 * preferencias" —lo que evita que la hidratación choque— y la lectura del
 * navegador entra después sin encadenar renders.
 *
 * Todo acceso va en try/catch: en una ventana privada o con el almacenamiento
 * bloqueado, leer o escribir puede fallar, y ahí la tabla simplemente arranca
 * sin preferencias.
 */
const PREFIJO = "tablero:";

const oyentes = new Set<() => void>();

export function suscribirPreferencias(oyente: () => void): () => void {
  oyentes.add(oyente);
  window.addEventListener("storage", oyente);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", oyente);
  };
}

function llave(idTabla: string, clave: string): string {
  return `${PREFIJO}${clave}:${idTabla}`;
}

/**
 * Devuelve el valor crudo guardado. Es un string y no un objeto a propósito:
 * `useSyncExternalStore` compara por identidad, y un objeto nuevo en cada
 * lectura lo haría renderizar sin parar.
 */
export function leerPreferencia(idTabla: string, clave: string): string {
  try {
    return window.localStorage.getItem(llave(idTabla, clave)) ?? "";
  } catch {
    return "";
  }
}

/** Valor en el servidor: ninguna preferencia guardada. */
export function sinPreferencias(): string {
  return "";
}

export function guardarPreferencia(idTabla: string, clave: string, valor: unknown): void {
  const vacio =
    valor == null ||
    (Array.isArray(valor) && valor.length === 0) ||
    (typeof valor === "object" && Object.keys(valor as object).length === 0);

  try {
    if (vacio) window.localStorage.removeItem(llave(idTabla, clave));
    else window.localStorage.setItem(llave(idTabla, clave), JSON.stringify(valor));
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

export function parsearFiltros(crudo: string): Record<string, string> {
  if (!crudo) return {};
  try {
    const valor: unknown = JSON.parse(crudo);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};

    const limpio: Record<string, string> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (typeof v === "string" && v !== "") limpio[clave] = v;
    }
    return limpio;
  } catch {
    return {};
  }
}
