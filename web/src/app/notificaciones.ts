"use server";

import { modoDatos, TABLA_NOTIFICACIONES } from "@/lib/config";
import type { Mencionable } from "@/lib/menciones";
import { directorioDelEquipo, leerNotificaciones, type Notificacion } from "@/lib/notificaciones";
import { usuarioActual } from "@/lib/sesion";
import { actualizarFilas } from "@/lib/supabase";

/**
 * La campana de la barra y el autocompletado de menciones.
 *
 * Todo filtra por el correo de la sesión, nunca por uno que mande el
 * navegador: cada quien lee y marca solamente sus propios avisos.
 */

export type Resultado = { ok: true } | { ok: false; error: string };

export type Bandeja = {
  items: Notificacion[];
  noLeidas: number;
  /** `false` sin sesión, sin Supabase o sin la tabla: la campana no se muestra. */
  disponible: boolean;
};

const SIN_BANDEJA: Bandeja = { items: [], noLeidas: 0, disponible: false };

export async function bandejaNotificaciones(): Promise<Bandeja> {
  const quien = await usuarioActual();
  if (!quien || modoDatos() !== "supabase") return SIN_BANDEJA;

  try {
    const leida = await leerNotificaciones(quien);
    return { items: leida.items, noLeidas: leida.noLeidas, disponible: !leida.sinTabla };
  } catch (error) {
    // Una base lenta no puede tirar la barra superior de todas las pantallas.
    console.error("No se pudieron leer las notificaciones", error);
    return SIN_BANDEJA;
  }
}

export async function marcarNotificacionLeida(id: string): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés sesión." };
  if (!id.trim()) return { ok: false, error: "Falta la notificación." };

  const falla = await actualizarFilas(
    TABLA_NOTIFICACIONES,
    { id: `eq.${id}`, destinatario: `eq.${quien.toLowerCase()}`, leida_en: "is.null" },
    { leida_en: new Date().toISOString() },
  );
  return falla ? { ok: false, error: falla } : { ok: true };
}

export async function marcarTodasLeidas(): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés sesión." };

  const falla = await actualizarFilas(
    TABLA_NOTIFICACIONES,
    { destinatario: `eq.${quien.toLowerCase()}`, leida_en: "is.null" },
    { leida_en: new Date().toISOString() },
  );
  return falla ? { ok: false, error: falla } : { ok: true };
}

/** Correos, alias y nombres del equipo. Solo eso: nada del perfil sale de acá. */
export async function personasMencionables(): Promise<Mencionable[]> {
  const quien = await usuarioActual();
  if (!quien || modoDatos() !== "supabase") return [];
  return directorioDelEquipo();
}
