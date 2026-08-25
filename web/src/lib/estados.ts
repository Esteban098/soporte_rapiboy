/**
 * Color de cada estado, compartido por todas las tablas del proyecto.
 *
 * No es decorativo: el tono dice qué pasó con el paquete, así que se lee de un
 * vistazo sin tener que interpretar el texto. Vive fuera de `lib/normalizar`
 * porque lo usan componentes de cliente.
 */
export type TonoEstado = "good" | "warning" | "critical" | "info" | "neutral";

const TONOS: Record<string, TonoEstado> = {
  entregado: "good",
  devuelto: "critical",
  devolucion: "warning",
  "devolución": "warning",
  "devolucion en centro de dropoff": "warning",
  "devolución en centro de dropoff": "warning",
  "pedido no entregado": "critical",
  siniestrado: "critical",
  "en deposito": "info",
  "en depósito": "info",
  "en deposito con direccion incorrecta": "warning",
  "en centro de dropoff": "info",
  "para retirar": "info",
  "retirado en camino a destino": "info",
  colectado: "info",
  bonificado: "neutral",
  cancelado: "neutral",
};

export function tonoEstado(estado: string): TonoEstado {
  return TONOS[estado.toLowerCase().trim()] ?? "neutral";
}
