"use server";

import { updateTag } from "next/cache";
import { TABLA_MENSUAL, TABLA_MENSUAL_HISTORICO } from "@/lib/config";
import { usuarioActual } from "@/lib/sesion";
import { actualizarFila, borrarFila, consultarFresco, insertarFila, TablaFaltante } from "@/lib/supabase";
import { estadoActualDelSistema } from "@/lib/asistente-datos";

/**
 * Alta, edición y baja de paquetes desde el tablero.
 *
 * Solo se tocan las columnas de soporte, nunca las del sistema. No es una
 * restricción de permisos sino de sentido: estado, repartidor, comercio y
 * visitas los reescribe n8n en cada corrida, así que editarlos acá duraría
 * hasta el próximo refresco y sería una mentira mientras tanto.
 *
 * Por eso alcanza con el ID para dar de alta un paquete. Si el pedido existe en el
 * sistema, el refresco de estados lo encuentra en la tabla, lo consulta y le
 * completa el resto solo. La información de tienda y la del siniestro se
 * editan después, en acciones separadas.
 */

/** Información manual que el equipo puede asociar a un paquete. */
export type DatosPaquete = {
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

function validar(id: number, datos: DatosPaquete): string | null {
  if (!Number.isInteger(id) || id <= 0) {
    return "El ID del paquete tiene que ser un número entero positivo.";
  }
  if (!AVISOS_VALIDOS.has(datos.aviso.trim().toUpperCase())) {
    return "El aviso solo puede quedar vacío, en NO AVISADO o en AVISADO.";
  }
  if (!MOTIVOS_SINIESTRO_VALIDOS.has(datos.motivoSiniestro.trim())) {
    return "El motivo del siniestro no es válido.";
  }
  return null;
}

/** Información de tienda: se edita por separado, nunca durante el alta. */
function aColumnasInformacionTienda(datos: DatosPaquete, quien: string) {
  return {
    // En mayúsculas, como venía del libro: si no, "Numero alterno" y "NUMERO
    // ALTERNO" cuentan como dos tipificaciones distintas en el tablero.
    reclamo_tienda: texto(datos.reclamoTienda.toUpperCase()),
    ubicacion: texto(datos.ubicacion),
    telefono: texto(datos.telefono),
    aviso: texto(datos.aviso.toUpperCase()),
    editado_por: quien,
    editado_en: new Date().toISOString(),
  };
}

/** Campos propios del alta rápida de un siniestro. */
function aColumnasSiniestro(datos: DatosPaquete, quien: string) {
  return {
    motivo_siniestro: texto(datos.motivoSiniestro),
    comentario_siniestro: texto(datos.comentarioSiniestro),
    editado_por: quien,
    editado_en: new Date().toISOString(),
  };
}

/** La fila puede estar en la ventana operativa o ya archivada. */
async function idYaCargado(id: number): Promise<boolean> {
  for (const tabla of [TABLA_MENSUAL, TABLA_MENSUAL_HISTORICO]) {
    try {
      const filas = await consultarFresco<{ id: number }>(tabla, {
        id: `eq.${id}`,
        limit: "1",
      });
      if (filas.length > 0) return true;
    } catch (error) {
      // Una instalación anterior puede no tener todavía la tabla histórica.
      if (!(error instanceof TablaFaltante)) throw error;
    }
  }
  return false;
}

export async function agregarPaquete(id: number, datos: DatosPaquete, esSiniestro = false): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };

  const invalido = validar(id, datos);
  if (invalido) return { ok: false, error: invalido };

  if (await idYaCargado(id)) {
    return { ok: false, error: "Ese paquete ya está cargado en Mensual o en el Histórico." };
  }

  if (esSiniestro) {
    const sistema = await estadoActualDelSistema(id);
    if (!sistema.ok) return { ok: false, error: sistema.error };
    if (sistema.estado.trim().toLowerCase() !== "siniestrado") {
      return { ok: false, error: `El sistema informa el estado «${sistema.estado}», no «Siniestrado».` };
    }
  }

  // Un alta común guarda solo el ID. La información de tienda se completa una
  // vez que el paquete ya existe, desde su acción específica en la tabla.
  const columnas = esSiniestro ? aColumnasSiniestro(datos, quien) : {};
  const falla = await insertarFila(TABLA_MENSUAL, { id, ...columnas });
  if (falla) return { ok: false, error: falla };

  updateTag("datos");
  return { ok: true };
}

export async function editarInformacionPaquete(
  id: number,
  datos: DatosPaquete,
  origen: "mensual" | "historico" = "mensual",
  esSiniestro = false,
): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };

  const invalido = validar(id, datos);
  if (invalido) return { ok: false, error: invalido };

  const tabla = origen === "historico" ? TABLA_MENSUAL_HISTORICO : TABLA_MENSUAL;
  if (esSiniestro) {
    const estadoSistema = await validarEstadoSiniestro(id);
    if (estadoSistema) return { ok: false, error: estadoSistema };
  }

  const columnas = esSiniestro ? aColumnasSiniestro(datos, quien) : aColumnasInformacionTienda(datos, quien);
  const falla = await actualizarFila(tabla, id, columnas);
  if (falla) return { ok: false, error: falla };

  updateTag("datos");
  return { ok: true };
}

/**
 * Saca el paquete de la tabla.
 *
 * Ojo con lo que significa: si el pedido sigue existiendo en el sistema, la
 * ingesta lo va a volver a traer mañana, pero sin lo que soporte haya cargado.
 * Borrar sirve para sacar algo que no correspondía, no para archivarlo.
 */
export async function quitarPaquete(id: number): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Id inválido." };

  const falla = await borrarFila(TABLA_MENSUAL, id);
  if (falla) return { ok: false, error: falla };

  updateTag("datos");
  return { ok: true };
}
