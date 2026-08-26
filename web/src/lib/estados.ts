/**
 * Color de cada estado, compartido por todas las tablas del proyecto.
 *
 * No es decorativo: el tono dice qué pasó con el paquete, así que se lee de un
 * vistazo sin tener que interpretar el texto. Vive fuera de `lib/normalizar`
 * porque lo usan componentes de cliente.
 */
export type ColorEstado =
  | "entregado"
  | "devuelto"
  | "devolucion"
  | "deposito"
  | "retirado"
  | "pararetirar"
  | "siniestrado"
  | "noentregado"
  | "neutral";

const COLORES: Record<string, ColorEstado> = {
  entregado: "entregado",
  devuelto: "devuelto",

  // Devolución en curso: se distingue de "Devuelto", que ya cerró el caso.
  devolucion: "devolucion",
  "devolución": "devolucion",
  "devolucion en centro de dropoff": "devolucion",
  "devolución en centro de dropoff": "devolucion",

  "pedido no entregado": "noentregado",
  siniestrado: "siniestrado",

  "en deposito": "deposito",
  "en depósito": "deposito",
  "en deposito con direccion incorrecta": "deposito",
  "en centro de dropoff": "deposito",

  "retirado en camino a destino": "retirado",
  colectado: "retirado",
  "para retirar": "pararetirar",
};

export function colorEstado(estado: string): ColorEstado {
  return COLORES[estado.toLowerCase().trim()] ?? "neutral";
}
