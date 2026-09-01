"use server";

import { updateTag } from "next/cache";
import { BUCKET_SEGUIMIENTO, TABLA_SEGUIMIENTO } from "@/lib/config";
import { resumirComentario } from "@/lib/resumen";
import { usuarioActual } from "@/lib/sesion";
import { ESTADOS, type EstadoSeguimiento } from "@/lib/seguimiento";
import {
  actualizarFila,
  borrarArchivos,
  borrarFila,
  consultar,
  firmarSubida,
  insertarFila,
  leerFila,
} from "@/lib/supabase";
import { parsearSeguimiento, type FilaSeguimiento } from "@/lib/seguimiento";

/**
 * Alta de reportes y cambio de mano, desde el tablero.
 *
 * A diferencia de `casos.ts`, acá se escribe todo: esta tabla es del equipo y
 * n8n no la mira. Por eso también es la única que guarda texto libre y
 * archivos, y la única que llama a un servicio de afuera.
 */

export type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Cuántos archivos y de qué tamaño.
 *
 * El tamaño también está puesto en el bucket (`file_size_limit`), y ese es el
 * que manda de verdad: el navegador sube directo a Supabase, así que un cliente
 * modificado no puede saltearse aquel aunque sí este. Acá se valida igual para
 * decirlo antes de empezar la subida en vez de después.
 */
const MAX_ARCHIVOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

/** Un comentario más largo que esto no es un reporte, es un pegado accidental. */
const MAX_COMENTARIO = 4000;

/** Rutas que este código pudo haber emitido: `caso/uuid-nombre`. */
const RUTA_VALIDA = /^[a-zA-Z0-9._-]+\/[0-9a-f-]{36}-[a-zA-Z0-9._-]+$/;

/**
 * Deja el nombre del archivo apto para una ruta de Storage.
 *
 * Sin acentos ni espacios ni barras: una barra en el nombre crearía carpetas
 * que nadie pidió, y los acentos hacen que la ruta guardada y la firmada no
 * coincidan según quién las normalice.
 */
function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return limpio || "archivo";
}

/** Lo que el navegador cuenta de cada archivo antes de subirlo. */
export type ArchivoPedido = { nombre: string; tamano: number };

export type Subida = { ruta: string; url: string };

/**
 * Autoriza la subida de los adjuntos y devuelve a dónde mandarlos.
 *
 * El navegador manda los archivos directo a Supabase con estas URLs y recién
 * después llama a `crearSeguimiento` con las rutas. Suena a un paso de más
 * frente a mandar todo junto, pero es lo que hace que una foto de 8 MB llegue:
 * el cuerpo de una Server Action está limitado a 1 MB, y una función de Vercel
 * a 4,5 MB.
 */
export async function prepararAdjuntos(
  casoId: string,
  archivos: ArchivoPedido[],
): Promise<{ ok: true; subidas: Subida[] } | { ok: false; error: string }> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para cargar reportes." };

  const caso = casoId.trim();
  if (!caso) return { ok: false, error: "Falta el id del caso." };
  if (archivos.length > MAX_ARCHIVOS) {
    return { ok: false, error: `Se pueden adjuntar hasta ${MAX_ARCHIVOS} archivos.` };
  }

  const subidas: Subida[] = [];

  for (const archivo of archivos) {
    if (archivo.tamano > MAX_BYTES) {
      return { ok: false, error: `"${archivo.nombre}" pesa más de 10 MB.` };
    }

    // La carpeta por caso mantiene juntos los adjuntos de un mismo viaje; el
    // uuid evita que dos fotos con el mismo nombre —"IMG_0001.jpg" es todos los
    // días— se pisen entre sí.
    const ruta = `${nombreSeguro(caso)}/${crypto.randomUUID()}-${nombreSeguro(archivo.nombre)}`;
    const firma = await firmarSubida(BUCKET_SEGUIMIENTO, ruta);
    if ("error" in firma) return { ok: false, error: firma.error };

    subidas.push({ ruta, url: firma.url });
  }

  return { ok: true, subidas };
}

/** Lo que se guarda de un reporte. Los archivos ya están subidos. */
export type DatosReporte = {
  casoId: string;
  comentario: string;
  /** Rutas devueltas por `prepararAdjuntos`. */
  archivos: string[];
};

/**
 * Guarda un reporte.
 *
 * Si el modelo no responde se guarda igual, sin resumen: ver `lib/resumen.ts`.
 * El comentario es el dato; el resumen es una comodidad.
 */
export async function crearSeguimiento(datos: DatosReporte): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para cargar reportes." };

  const casoId = datos.casoId.trim();
  const comentario = datos.comentario.trim();

  if (!casoId) return { ok: false, error: "Falta el id del caso." };
  if (!comentario) return { ok: false, error: "Escribí un comentario antes de enviar." };
  if (comentario.length > MAX_COMENTARIO) {
    return { ok: false, error: "El comentario es demasiado largo." };
  }

  // Las rutas llegan del navegador, así que se comprueba la forma: solo se
  // aceptan las que este código pudo haber emitido. Con el uuid de por medio no
  // son adivinables, y el bucket es privado, así que lo peor que puede quedar
  // es un adjunto que no abre.
  const archivos = datos.archivos.filter((ruta) => RUTA_VALIDA.test(ruta));
  if (archivos.length > MAX_ARCHIVOS) {
    return { ok: false, error: `Se pueden adjuntar hasta ${MAX_ARCHIVOS} archivos.` };
  }

  const resumen = await resumirComentario(comentario);

  const falla = await insertarFila(TABLA_SEGUIMIENTO, {
    caso_id: casoId,
    comentario_original: comentario,
    resumen_llm: resumen,
    archivos,
    estado: "abierto",
    creado_por: quien,
  });
  if (falla) return { ok: false, error: falla };

  updateTag("seguimiento");
  return { ok: true };
}

/**
 * Lo que ya se reportó sobre un caso.
 *
 * Sirve para avisar antes de cargar: es común que dos personas vean el mismo
 * problema con horas de diferencia y lo reporten dos veces. No bloquea nada
 * —a veces el segundo reporte es información nueva sobre el mismo viaje—, pero
 * quien está por escribir merece saber que ya hay algo dicho.
 */
export type Previo = {
  total: number;
  /** El más reciente, para poder decidir si vale la pena cargar otro. */
  ultimo: { texto: string; estado: EstadoSeguimiento; cuando: string | null } | null;
};

export async function reportesDelCaso(casoId: string): Promise<Previo> {
  const quien = await usuarioActual();
  const caso = casoId.trim();
  if (!quien || !caso) return { total: 0, ultimo: null };

  const filas = await consultar<FilaSeguimiento>(
    TABLA_SEGUIMIENTO,
    { "caso_id": `eq.${caso}`, order: "created_at.desc", limit: "20" },
    "seguimiento",
  ).catch(() => []);

  if (filas.length === 0) return { total: 0, ultimo: null };

  const ultimo = parsearSeguimiento(filas[0]);
  return {
    total: filas.length,
    ultimo: {
      texto: ultimo.resumen ?? ultimo.comentario,
      estado: ultimo.estado,
      cuando: ultimo.creado?.toISOString() ?? null,
    },
  };
}

/**
 * Corrige un reporte ya cargado.
 *
 * El resumen se rehace siempre que cambie el comentario: un resumen que
 * describe un texto que ya no está es peor que no tener resumen, porque se lee
 * igual de confiado. Los adjuntos no se tocan acá; para cambiarlos, se borra el
 * reporte y se carga de nuevo.
 */
export async function editarSeguimiento(id: string, datos: DatosReporte): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para editar reportes." };

  const casoId = datos.casoId.trim();
  const comentario = datos.comentario.trim();

  if (!id.trim()) return { ok: false, error: "Falta el reporte." };
  if (!casoId) return { ok: false, error: "Falta el id del caso." };
  if (!comentario) return { ok: false, error: "El comentario no puede quedar vacío." };
  if (comentario.length > MAX_COMENTARIO) {
    return { ok: false, error: "El comentario es demasiado largo." };
  }

  const resumen = await resumirComentario(comentario);

  const falla = await actualizarFila(TABLA_SEGUIMIENTO, id, {
    caso_id: casoId,
    comentario_original: comentario,
    resumen_llm: resumen,
  });
  if (falla) return { ok: false, error: falla };

  updateTag("seguimiento");
  return { ok: true };
}

/**
 * Borra un reporte y sus adjuntos.
 *
 * Los archivos se van con la fila. Si quedaran, nadie volvería a saber que
 * existen —la fila era lo único que los nombraba— y ocuparían el bucket para
 * siempre. Se leen de la base y no de lo que manda el navegador: es la
 * diferencia entre borrar los archivos de este reporte y borrar cualquier ruta
 * que alguien quiera nombrar.
 */
export async function borrarSeguimiento(id: string): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para borrar reportes." };
  if (!id.trim()) return { ok: false, error: "Falta el reporte." };

  const fila = await leerFila<FilaSeguimiento>(TABLA_SEGUIMIENTO, id);
  if (!fila) return { ok: false, error: "Ese reporte ya no está." };

  // Primero los archivos: si fallara al revés, la fila ya no estaría y las
  // rutas se perderían. Que falle el borrado de un adjunto no impide sacar el
  // reporte de la cola, que es lo que la persona pidió.
  await borrarArchivos(BUCKET_SEGUIMIENTO, fila.archivos ?? []);

  const falla = await borrarFila(TABLA_SEGUIMIENTO, id);
  if (falla) return { ok: false, error: falla };

  updateTag("seguimiento");
  return { ok: true };
}

/**
 * Cambia de mano un reporte.
 *
 * Tomarlo o cerrarlo deja registrado quién fue: es el sentido del cambio de
 * estado, saber a quién preguntarle. Volver a `abierto` limpia ese registro,
 * porque el campo dice quién lo está atendiendo y en ese momento no lo atiende
 * nadie; el historial de quién lo tuvo antes no lo guarda esta tabla.
 */
export async function cambiarEstado(id: string, estado: EstadoSeguimiento): Promise<Resultado> {
  const quien = await usuarioActual();
  if (!quien) return { ok: false, error: "No tenés permiso para cambiar el estado." };

  if (!id.trim()) return { ok: false, error: "Falta el reporte." };
  if (!ESTADOS.includes(estado)) return { ok: false, error: "Ese estado no existe." };

  const libera = estado === "abierto";
  const falla = await actualizarFila(TABLA_SEGUIMIENTO, id, {
    estado,
    atendido_por: libera ? null : quien,
    atendido_en: libera ? null : new Date().toISOString(),
  });
  if (falla) return { ok: false, error: falla };

  updateTag("seguimiento");
  return { ok: true };
}
