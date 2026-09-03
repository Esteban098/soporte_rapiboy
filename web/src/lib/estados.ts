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
  | "cancelado"
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

  /*
   * Estados que solo aparecen en Cancelados, del lado de Meli.
   *
   * «Cancelado» es el caso en orden —los dos sistemas dicen lo mismo— y va en
   * gris: no es ni bueno ni malo, es el trámite terminado. «Por colectar» es el
   * mismo significado que «Para retirar» visto desde Meli, así que comparte su
   * color. «Reprogramado por comprador» comparte el de devolución en curso:
   * son los dos un envío que sigue moviéndose sin reflejar la cancelación.
   *
   * «Entregado» conserva su verde de siempre. En una fila cancelada eso es una
   * contradicción, y se ve justamente por el contraste con el estado nuestro al
   * lado: aplanarlo a gris escondería el único caso que hay que mirar.
   */
  cancelado: "cancelado",
  "por colectar": "pararetirar",
  "reprogramado por comprador": "devolucion",
};

export function colorEstado(estado: string): ColorEstado {
  return COLORES[estado.toLowerCase().trim()] ?? "neutral";
}
