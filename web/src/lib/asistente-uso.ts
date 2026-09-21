import "server-only";
import { hoyEnMexico } from "./asistente";
import { costoEstimado, type FilaUso, type UsoTokens } from "./asistente-costos";
import { TABLA_ASISTENTE_USO, TOPE_DIARIO_ASISTENTE, modoDatos } from "./config";
import { consultarFresco, consultarTodo, insertarFila, TablaFaltante } from "./supabase";

/**
 * Registro de uso del asistente: una fila por pregunta en `asistente_uso`
 * (`supabase/migracion-14-asistente-uso.sql`).
 *
 * Nada de esto puede impedir una respuesta: sin la tabla, o con la base
 * caída, el asistente contesta igual y el problema queda en el log. Contar es
 * una herramienta de control, no una condición para funcionar.
 */

export type RegistroUso = {
  email: string;
  modelo: string;
  ok: boolean;
  llamadas: number;
  tokens: UsoTokens;
  herramientas: string[];
};

export async function registrarUso(registro: RegistroUso): Promise<void> {
  if (modoDatos() !== "supabase") return;
  const falla = await insertarFila(TABLA_ASISTENTE_USO, {
    dia: hoyEnMexico(),
    email: registro.email,
    modelo: registro.modelo,
    ok: registro.ok,
    llamadas: registro.llamadas,
    tokens_entrada: registro.tokens.entrada,
    tokens_cache: registro.tokens.cache,
    tokens_salida: registro.tokens.salida,
    costo_usd: costoEstimado(registro.modelo, registro.tokens),
    herramientas: registro.herramientas,
  }).catch((error: unknown) => String(error));
  if (falla) console.error("[asistente] No se pudo registrar el uso:", falla);
}

/**
 * Si la persona ya llegó al tope de hoy. Sin tabla no hay con qué contar, y
 * se deja pasar: el tope es un freno contra el abuso, no un permiso.
 */
export async function llegoAlTope(email: string): Promise<boolean> {
  if (modoDatos() !== "supabase" || TOPE_DIARIO_ASISTENTE <= 0) return false;
  try {
    const filas = await consultarFresco<{ id: string }>(TABLA_ASISTENTE_USO, {
      select: "id",
      email: `eq.${email}`,
      dia: `eq.${hoyEnMexico()}`,
      limit: String(TOPE_DIARIO_ASISTENTE),
    });
    return filas.length >= TOPE_DIARIO_ASISTENTE;
  } catch (error) {
    if (!(error instanceof TablaFaltante)) console.error("[asistente] No se pudo contar el uso de hoy:", error);
    return false;
  }
}

export type UsoDelMes = { filas: FilaUso[]; sinTabla: boolean };

/** Todas las preguntas de un mes (`AAAA-MM`), para el panel del administrador. */
export async function leerUsoDelMes(mes: string): Promise<UsoDelMes> {
  if (modoDatos() !== "supabase") return { filas: [], sinTabla: false };

  const [anio, numero] = mes.split("-").map(Number);
  const siguiente = numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, "0")}`;
  try {
    const filas = await consultarTodo<FilaUso>(
      TABLA_ASISTENTE_USO,
      {
        select: "email,dia,created_at,modelo,ok,tokens_entrada,tokens_cache,tokens_salida,costo_usd",
        and: `(dia.gte.${mes}-01,dia.lt.${siguiente}-01)`,
      },
      "created_at.asc",
    );
    return { filas, sinTabla: false };
  } catch (error) {
    if (error instanceof TablaFaltante) return { filas: [], sinTabla: true };
    throw error;
  }
}
