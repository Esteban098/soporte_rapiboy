import "server-only";
import { TABLA_NOTIFICACIONES, TABLA_PERFILES } from "./config";
import { cargarSeguimientos } from "./datos";
import { armarDirectorio, correosMencionados, type Mencionable } from "./menciones";
import { consultarFresco, insertarFilas, TablaFaltante } from "./supabase";

/**
 * Avisos por persona. Por ahora un solo tipo: alguien te arrobó en un reporte.
 *
 * Se leen sin caché (`consultarFresco`): una campana que muestra lo de hace
 * una hora no avisa nada.
 */

export type Notificacion = {
  id: string;
  /** ISO, para que viaje igual del servidor al navegador. */
  creada: string | null;
  tipo: "mencion";
  autor: string;
  seguimientoId: string | null;
  casoId: string | null;
  extracto: string | null;
  leida: boolean;
};

type FilaNotificacion = {
  id: string;
  created_at: string | null;
  destinatario: string;
  tipo: string | null;
  autor: string | null;
  seguimiento_id: string | null;
  caso_id: string | null;
  extracto: string | null;
  leida_en: string | null;
};

function parsear(fila: FilaNotificacion): Notificacion {
  return {
    id: fila.id,
    creada: fila.created_at,
    tipo: "mencion",
    autor: (fila.autor ?? "").trim(),
    seguimientoId: fila.seguimiento_id,
    casoId: fila.caso_id?.trim() || null,
    extracto: fila.extracto?.trim() || null,
    leida: Boolean(fila.leida_en),
  };
}

export type BandejaLeida = { items: Notificacion[]; noLeidas: number; sinTabla: boolean };

export async function leerNotificaciones(destinatario: string, limite = 30): Promise<BandejaLeida> {
  const quien = destinatario.trim().toLowerCase();
  try {
    const [filas, pendientes] = await Promise.all([
      consultarFresco<FilaNotificacion>(TABLA_NOTIFICACIONES, {
        destinatario: `eq.${quien}`,
        order: "created_at.desc",
        limit: String(limite),
      }),
      consultarFresco<{ id: string }>(TABLA_NOTIFICACIONES, {
        select: "id",
        destinatario: `eq.${quien}`,
        leida_en: "is.null",
        limit: "100",
      }),
    ]);
    return { items: filas.map(parsear), noLeidas: pendientes.length, sinTabla: false };
  } catch (error) {
    if (error instanceof TablaFaltante) return { items: [], noLeidas: 0, sinTabla: true };
    throw error;
  }
}

/**
 * A quién se puede arrobar: los perfiles activos, los correos de
 * `ALLOWED_EMAILS` y quien ya aparece en algún reporte —así entra también
 * quien usa el login de Google sin perfil en la base—.
 */
export async function directorioDelEquipo(): Promise<Mencionable[]> {
  const [perfiles, cola] = await Promise.all([
    consultarFresco<{ email: string; nombre: string | null }>(TABLA_PERFILES, {
      select: "email,nombre",
      activo: "is.true",
    }).catch(() => []),
    cargarSeguimientos().catch(() => ({ reportes: [], sinTabla: false })),
  ]);

  const permitidos = (process.env.ALLOWED_EMAILS ?? "")
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((email) => ({ email }));
  const enReportes = cola.reportes
    .flatMap((reporte) => [reporte.creadoPor, reporte.tomadoPor, reporte.atendidoPor])
    .filter((email): email is string => Boolean(email))
    .map((email) => ({ email }));

  return armarDirectorio([...perfiles, ...permitidos, ...enReportes]);
}

function recortar(texto: string, largo: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > largo ? `${limpio.slice(0, largo).trimEnd()}…` : limpio;
}

/**
 * Avisa a quienes se arrobó en un reporte.
 *
 * Con `previo` —el comentario antes de una edición— solo avisa a las menciones
 * nuevas: corregir una coma no puede volver a notificar a todos. Nadie recibe
 * aviso por arrobarse a sí mismo.
 *
 * Nunca lanza. El reporte ya está guardado y es el dato; que falle el aviso se
 * anota en el log y no le devuelve un error a quien reportó.
 */
export async function notificarMenciones(datos: {
  autor: string;
  seguimientoId: string;
  casoId: string;
  texto: string;
  previo?: string | null;
}): Promise<void> {
  try {
    const directorio = await directorioDelEquipo();
    const autor = datos.autor.trim().toLowerCase();
    const yaAvisados = new Set(datos.previo ? correosMencionados(datos.previo, directorio) : []);
    const destinatarios = correosMencionados(datos.texto, directorio).filter(
      (email) => email !== autor && !yaAvisados.has(email),
    );
    if (destinatarios.length === 0) return;

    const extracto = recortar(datos.texto, 180);
    const falla = await insertarFilas(
      TABLA_NOTIFICACIONES,
      destinatarios.map((destinatario) => ({
        destinatario,
        tipo: "mencion",
        autor,
        seguimiento_id: datos.seguimientoId,
        caso_id: datos.casoId,
        extracto,
      })),
    );
    if (falla) console.error(`No se pudieron guardar las menciones: ${falla}`);
  } catch (error) {
    console.error("No se pudieron guardar las menciones", error);
  }
}
