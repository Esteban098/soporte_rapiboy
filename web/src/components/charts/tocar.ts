/**
 * El dato que hay detrás de un punto tocado.
 *
 * Recharts entrega el registro dentro de `payload` en unos casos y suelto en
 * otros, según el elemento. Esto normaliza los dos para que cada gráfico no
 * tenga que adivinar cuál le tocó.
 */
export function datoTocado<T>(entrada: unknown): T | null {
  if (!entrada || typeof entrada !== "object") return null;
  const conPayload = entrada as { payload?: unknown };
  const dato = conPayload.payload ?? entrada;
  return dato && typeof dato === "object" ? (dato as T) : null;
}
