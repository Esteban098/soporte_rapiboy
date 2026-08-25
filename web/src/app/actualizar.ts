"use server";

import { updateTag } from "next/cache";

/**
 * Descarta la copia cacheada del sheet y fuerza una lectura nueva.
 *
 * El tablero cachea las lecturas porque el libro se actualiza una vez por día.
 * Cuando el equipo carga algo y quiere verlo en el momento, este botón evita
 * tener que esperar a que venza ese plazo.
 *
 * Se usa `updateTag` y no `revalidateTag` porque acá el usuario está esperando
 * el dato nuevo: `updateTag` hace que el próximo pedido espere la lectura
 * fresca en lugar de servir la copia vieja mientras revalida por detrás.
 */
export async function actualizarDatos() {
  updateTag("sheet");
}
