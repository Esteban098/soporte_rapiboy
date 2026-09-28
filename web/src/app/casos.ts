"use server";

import { updateTag } from "next/cache";
import { TABLA_MENSUAL, TABLA_MENSUAL_HISTORICO } from "@/lib/config";
import { usuarioActual } from "@/lib/sesion";
import { actualizarFila, actualizarFilaSi, borrarFila, insertarFila } from "@/lib/supabase";
import { estadoActualDelSistema } from "@/lib/asistente-datos";

/**
 * Alta, edición y baja de casos desde el tablero.
 *
 * Solo se tocan las columnas de soporte, nunca las del sistema. No es una
 * restricción de permisos sino de sentido: estado, repartidor, comercio y
 * visitas los reescribe n8n en cada corrida, así que editarlos acá duraría
 * hasta el próximo refresco y sería una mentira mientras tanto.
 *
 * Por eso alcanza con el id para dar de alta un caso. Si el pedido existe en el
 * sistema, el refresco de estados lo encuentra en la tabla, lo consulta y le
 * completa el resto solo. El equipo carga lo que la tienda pasó; el flujo pone
 * lo demás.
 */

/** Lo que el equipo puede escribir de un caso. */
export type DatosCaso = {
  reclamoTienda: string;
  ubicacion: string;
  telefono: string;
  aviso: string;
  motivoSiniestro: string;
  comentarioSiniestro: string;
};

export type Resultado = { ok: true } | { ok: false; error: string };

const AVISOS_VALIDOS = new Set(["", "NO AVISADO", "AVISADO"]);
const MOTIVOS_SINIESTRO_VALIDOS = new Set([
  "",
  "Perdido en Deposito",
  "Roto",
  "Perdido por driver",
  "Mal entregado",
  "Otros",
]);

function tieneDatosSiniestro(datos: DatosCaso): boolean {
  return Boolean(datos.motivoSiniestro.trim() || datos.comentarioSiniestro.trim());
}

async function validarEstadoSiniestro(id: number): Promise<string | null> {
  const sistema = await estadoActualDelSistema(id);
  if (!sistema.ok) return sistema.error;
  if (sistema.estado.trim().toLowerCase() !== "siniestrado") {
    return `No se puede guardar: el sistema informa el estado «${sistema.estado}», no «Siniestrado».`;
  }
  return null;
}

/** Deja el texto listo para la base: sin espacios de más, y vacío como nulo. */
function texto(valor: string): string | null {
  const limpio = valor.replace(/\s+/g, " ").trim();
  return limpio === "" ? null : limpio;
}

function validar(id: number, datos: DatosCaso): string | null {
  if (!Number.isInteger(id) || id <= 0) {
    return "El id del viaje tiene que ser un número entero positivo.";
  }
  if (!AVISOS_VALIDOS.has(datos.aviso.trim().toUpperCase())) {
    return "El aviso solo puede quedar vacío, en NO AVISADO o en AVISADO.";
  }
  if (!MOTIVOS_SINIESTRO_VALIDOS.has(datos.motivoSiniestro.trim())) {
    return "El motivo del siniestro no es válido.";
  }
  return null;
}

/**
 * Las columnas que se escriben, más el rastro de quién lo hizo.
 *
 * `caso`, `informacion_enviar` e `ids` no están y no pueden estar: son
 * generadas, y Postgres rechaza el pedido si alguien las manda.
 */
function aColumnas(datos: DatosCaso, quien: string) {
  return {
    // En mayúsculas, como venía del libro: si no, "Numero alterno" y "NUMERO
    // ALTERNO" cuentan como dos tipificaciones distintas en el tablero.
    reclamo_tienda: texto(datos.reclamoTienda.toUpperCase()),
    ubicacion: texto(datos.ubicacion),
    telefono: texto(datos.telefono),
    aviso: texto(datos.aviso.toUpperCase()),
    motivo_siniestro: texto(datos.motivoSiniestro),
    comentario_siniestro: texto(datos.comentarioSiniestro),
    editado_por: quien,
    editado_en: new Date().toISOString(),
  };
}

export async function agregarCaso(id: number, datos: DatosCaso, validarSiniestro = false): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };

  const invalido = validar(id, datos);
  if (invalido) return { ok: false, error: invalido };
  if (validarSiniestro && tieneDatosSiniestro(datos)) {
    return { ok: false, error: "Primero agregá el ID y actualizá Siniestrados; después podrás cargar motivo y comentario cuando el estado esté validado." };
  }

  const falla = await insertarFila(TABLA_MENSUAL, { id, ...aColumnas(datos, quien) });
  if (falla) return { ok: false, error: falla };

  updateTag("datos");
  return { ok: true };
}

export async function editarCaso(
  id: number,
  datos: DatosCaso,
  origen: "mensual" | "historico" = "mensual",
  validarSiniestro = false,
): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };

  const invalido = validar(id, datos);
  if (invalido) return { ok: false, error: invalido };

  const tabla = origen === "historico" ? TABLA_MENSUAL_HISTORICO : TABLA_MENSUAL;
  if (validarSiniestro) {
    const estadoSistema = await validarEstadoSiniestro(id);
    if (estadoSistema) return { ok: false, error: estadoSistema };
    const resultado = await actualizarFilaSi(
      tabla,
      id,
      { estado: "ilike.Siniestrado" },
      aColumnas(datos, quien),
    );
    if ("error" in resultado) return { ok: false, error: resultado.error };
    if (resultado.filas !== 1) {
      return { ok: false, error: "La plataforma ya no tiene el paquete como Siniestrado. Actualizá la tabla." };
    }
    updateTag("datos");
    return { ok: true };
  }

  const falla = await actualizarFila(tabla, id, aColumnas(datos, quien));
  if (falla) return { ok: false, error: falla };

  updateTag("datos");
  return { ok: true };
}

/**
 * Saca el caso de la tabla.
 *
 * Ojo con lo que significa: si el pedido sigue existiendo en el sistema, la
 * ingesta lo va a volver a traer mañana, pero sin lo que soporte haya cargado.
 * Borrar sirve para sacar algo que no correspondía, no para archivarlo.
 */
export async function borrarCaso(id: number): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Id inválido." };

  const falla = await borrarFila(TABLA_MENSUAL, id);
  if (falla) return { ok: false, error: falla };

  updateTag("datos");
  return { ok: true };
}
