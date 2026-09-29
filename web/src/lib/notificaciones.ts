import "server-only";
import { TABLA_NOTIFICACIONES, TABLA_PERFILES } from "./config";
import { cargarPedidos, cargarSeguimientos } from "./datos";
import { armarDirectorio, correosMencionados, type Mencionable } from "./menciones";
import { demorados } from "./metricas";
import { DIAS_PARA_ALERTA_SEGUIMIENTO, seguimientoVencido } from "./seguimiento";
import { consultarFresco, insertarFilas, insertarFilasSinDuplicar, TablaFaltante } from "./supabase";

/**
 * Avisos por persona. Por ahora un solo tipo: alguien te arrobó en un reporte.
 *
 * Se leen sin caché (`consultarFresco`): una campana que muestra lo de hace
 * una hora no avisa nada.
 */

export type TipoNotificacion = "mencion" | "demora_paquete" | "seguimiento_vencido";

export type Notificacion = {
  id: string;
  /** ISO, para que viaje igual del servidor al navegador. */
  creada: string | null;
  tipo: TipoNotificacion;
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
  clave?: string | null;
  leida_en: string | null;
};

const TIPOS: readonly TipoNotificacion[] = ["mencion", "demora_paquete", "seguimiento_vencido"];
const AUTOR_SISTEMA = "sistema@rapiboy";

function tipoDe(valor: string | null): TipoNotificacion {
  return TIPOS.includes(valor as TipoNotificacion) ? valor as TipoNotificacion : "mencion";
}

function parsear(fila: FilaNotificacion): Notificacion {
  return {
    id: fila.id,
    creada: fila.created_at,
    tipo: tipoDe(fila.tipo),
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

/** Correos que ven la operación completa; Comercial queda explícitamente afuera. */
async function destinatariosOperativos(): Promise<string[]> {
  const [perfiles, permitidos] = await Promise.all([
    consultarFresco<{ email: string; rol: string | null }>(TABLA_PERFILES, {
      select: "email,rol",
      activo: "is.true",
    }).catch(() => []),
    Promise.resolve(
      (process.env.ALLOWED_EMAILS ?? "")
        .split(/[,;\s]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]);
  const comerciales = new Set(
    perfiles
      .filter((perfil) => perfil.rol === "comercial")
      .map((perfil) => perfil.email.trim().toLowerCase()),
  );
  const conRolOperativo = perfiles
    .filter((perfil) => perfil.rol === "admin" || perfil.rol === "operador")
    .map((perfil) => perfil.email.trim().toLowerCase());
  // Los correos permitidos sin perfil se comportan como operador; si luego se
  // les crea un perfil Comercial, el conjunto de arriba los excluye.
  return [...new Set([...conRolOperativo, ...permitidos.filter((email) => !comerciales.has(email))])];
}

function claveDeDemora(estado: string): string {
  const identificador = estado
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `demora-estado:${identificador || "sin-estado"}`;
}

function claveDeSeguimiento(id: string, abiertoEn: Date | null): string {
  return `seguimiento-vencido:${id}:${abiertoEn?.toISOString() ?? "sin-fecha"}`;
}

/**
 * Genera los avisos operativos sin repetirlos.
 *
 * La campana invoca esta función cada vez que refresca su bandeja. Las demoras
 * se agrupan por estado para evitar una alerta por paquete; los seguimientos
 * mantienen una alerta individual por responsable.
 */
export async function generarAlertasOperativas(): Promise<void> {
  try {
    const ahora = Date.now();
    const [{ pedidos }, { reportes }, destinatarios] = await Promise.all([
      cargarPedidos(),
      cargarSeguimientos(),
      destinatariosOperativos(),
    ]);
    const alertasDemora = demorados(pedidos, ahora);
    const seguimientosVencidos = reportes.filter((reporte) => seguimientoVencido(reporte, ahora));
    const demorasPorEstado = new Map<string, { estado: string; cantidad: number }>();
    for (const pedido of alertasDemora) {
      const estado = pedido.estado.trim() || "Sin estado";
      const clave = estado.toLocaleLowerCase("es");
      const grupo = demorasPorEstado.get(clave);
      if (grupo) grupo.cantidad += 1;
      else demorasPorEstado.set(clave, { estado, cantidad: 1 });
    }

    const filas = [
      ...[...demorasPorEstado.values()].flatMap(({ estado, cantidad }) =>
        destinatarios.map((destinatario) => ({
          destinatario,
          tipo: "demora_paquete",
          autor: AUTOR_SISTEMA,
          extracto: `${cantidad} paquete${cantidad === 1 ? "" : "s"} demorado${cantidad === 1 ? "" : "s"} con estado «${estado}».`,
          clave: claveDeDemora(estado),
        })),
      ),
      ...seguimientosVencidos.map((reporte) => ({
        destinatario: reporte.tomadoPor!,
        tipo: "seguimiento_vencido",
        autor: AUTOR_SISTEMA,
        seguimiento_id: reporte.id,
        caso_id: reporte.casoId,
        extracto: `Tu seguimiento del paquete #${reporte.casoId} lleva más de ${DIAS_PARA_ALERTA_SEGUIMIENTO} días abierto.`,
        clave: claveDeSeguimiento(reporte.id, reporte.abiertoEn),
      })),
    ];
    const falla = await insertarFilasSinDuplicar(TABLA_NOTIFICACIONES, filas, "destinatario,clave");
    if (falla) console.error(`No se pudieron guardar las alertas operativas: ${falla}`);
  } catch (error) {
    // Una alerta no puede impedir que la campana muestre las menciones ya existentes.
    console.error("No se pudieron generar las alertas operativas", error);
  }
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
