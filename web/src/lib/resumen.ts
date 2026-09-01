import "server-only";
import { openaiConfig } from "./config";

/**
 * Resume un comentario de seguimiento con la API de OpenAI.
 *
 * Devuelve `null` en vez de tirar error, siempre: sin clave, con la API caída,
 * con un timeout o con una respuesta rara. Es deliberado. El dato que importa
 * es el comentario que escribió la persona, y ya está a salvo cuando esto
 * corre; el resumen es una comodidad para leer la lista de un vistazo. Si un
 * corte de OpenAI pudiera impedir que se cargue un reporte, habríamos hecho que
 * el tablero dependa de un servicio que no le hace falta para funcionar.
 *
 * La columna `resumen_llm` es nullable por lo mismo, y la pantalla muestra el
 * comentario original cuando el resumen falta.
 */

const SISTEMA =
  "Eres un asistente que resume reportes de seguimiento. Recibes un comentario " +
  "de un usuario y debes generar un resumen conciso de máximo 2 oraciones " +
  "resaltando los puntos clave y la acción requerida.";

/** El modelo no puede tardar más que la paciencia de quien apretó Enviar. */
const TIMEOUT_MS = 15_000;

export async function resumirComentario(comentario: string): Promise<string | null> {
  const config = openaiConfig();
  if (!config) return null;

  const limpio = comentario.trim();
  if (!limpio) return null;

  try {
    const respuesta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.clave}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        messages: [
          { role: "system", content: SISTEMA },
          { role: "user", content: limpio },
        ],
        // Bajo a propósito: se le pide resumir lo que ya está escrito, no
        // redactar. Con temperatura alta el modelo empieza a agregar matices
        // que nadie reportó, y eso en un registro operativo es inventar datos.
        temperature: 0.2,
        max_tokens: 160,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) return null;

    const cuerpo = (await respuesta.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const texto = cuerpo.choices?.[0]?.message?.content?.trim();
    return texto ? texto : null;
  } catch {
    // Timeout, red caída, JSON inesperado: todo termina igual, sin resumen y
    // con el reporte intacto.
    return null;
  }
}
