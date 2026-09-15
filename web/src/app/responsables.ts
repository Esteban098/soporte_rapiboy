"use server";

import { updateTag } from "next/cache";
import { TABLA_TIENDAS_RESPONSABLES } from "@/lib/config";
import { sesionActual } from "@/lib/sesion";
import { actualizarFila, insertarFila } from "@/lib/supabase";
import { ETIQUETA_RESPONSABLES, leerResponsables } from "@/lib/responsables-datos";
import { claveTienda, limpiarAlias, revisarTienda, type DatosTienda } from "@/lib/responsables";

/**
 * Alta y edición de la distribución de tiendas.
 *
 * No hay baja: una tienda que cambia de manos se reasigna, y una que se quiere
 * dejar sin color se corrige en la base. Lo puede hacer cualquiera con sesión,
 * comercial incluido —Tiendas es una de sus pantallas—, y queda firmado en
 * `editado_por`.
 */

export type Resultado = { ok: true } | { ok: false; error: string };

export async function guardarTienda(id: string | null, datos: DatosTienda): Promise<Resultado> {
  const quien = (await sesionActual())?.email ?? null;
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };

  let existentes;
  try {
    existentes = await leerResponsables();
  } catch {
    return {
      ok: false,
      error: "No se pudo leer la distribución. Revisá que esté corrida la migración 13.",
    };
  }

  if (id && !existentes.some((f) => f.id === id)) {
    return { ok: false, error: "Esa tienda ya no existe. Recargá la pantalla." };
  }

  const invalido = revisarTienda(datos, existentes, id);
  if (invalido) return { ok: false, error: invalido };

  const nombre = datos.nombre.trim().replace(/\s+/g, " ");
  const fila = {
    nombre,
    clave: claveTienda(nombre),
    alias: limpiarAlias(nombre, datos.alias),
    responsable: datos.responsable,
    seccion: datos.seccion,
    editado_por: quien,
    editado_en: new Date().toISOString(),
  };

  const falla = id
    ? await actualizarFila(TABLA_TIENDAS_RESPONSABLES, id, fila)
    : await insertarFila(TABLA_TIENDAS_RESPONSABLES, { ...fila, creado_por: quien });

  if (falla) {
    // Dos personas cargando la misma tienda a la vez: la base decide por el
    // índice único y la segunda recibe esto en vez del error crudo.
    if (/23505|duplicate key/i.test(falla)) {
      return { ok: false, error: `«${nombre}» ya está cargada. Recargá la pantalla.` };
    }
    return { ok: false, error: falla };
  }

  updateTag(ETIQUETA_RESPONSABLES);
  return { ok: true };
}
