import "server-only";
import {
  HERRAMIENTAS,
  esHerramienta,
  instrucciones,
  leerArgumentos,
  serializarResultado,
  type MensajeChat,
} from "./asistente";
import { ejecutarHerramienta } from "./asistente-datos";
import { asistenteConfig } from "./config";

/**
 * La conversación con OpenAI: pregunta, el modelo pide herramientas, el
 * servidor las ejecuta, y así hasta que contesta.
 *
 * Va con `fetch` directo, como `resumen.ts`: una dependencia menos, y el
 * formato de function calling es estable.
 */

/** Vueltas de herramientas por pregunta. Cinco alcanzan para cruzar datos. */
const MAX_VUELTAS = 5;
/** Por llamada al modelo. La pregunta entera tiene el límite de la ruta. */
const TIMEOUT_MS = 40_000;

/** Lo que consumió una pregunta, haya salido bien o no: OpenAI cobra igual. */
export type UsoPregunta = {
  modelo: string;
  llamadas: number;
  tokens: { entrada: number; cache: number; salida: number };
  herramientas: string[];
};

export type RespuestaAsistente =
  | { ok: true; texto: string; herramientas: string[]; uso: UsoPregunta }
  | { ok: false; error: string; status: number; uso: UsoPregunta | null };

type MensajeOpenAI =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: LlamadaHerramienta[] }
  | { role: "tool"; tool_call_id: string; content: string };

type LlamadaHerramienta = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type RespuestaOpenAI = {
  choices?: { message?: { content?: string | null; tool_calls?: LlamadaHerramienta[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

/**
 * Los modelos de razonamiento (gpt-5, o-series) no aceptan `temperature` ni
 * `max_tokens`, y piden `reasoning_effort`. Con esfuerzo bajo alcanza para
 * elegir una herramienta y cuesta bastante menos.
 */
function esModeloDeRazonamiento(modelo: string): boolean {
  return /^(gpt-5|o\d)/.test(modelo);
}

export async function responder(historial: MensajeChat[], quien: string): Promise<RespuestaAsistente> {
  const config = asistenteConfig();
  if (!config) {
    return {
      ok: false,
      status: 503,
      error: "El asistente no está configurado: falta OPENAI_API_KEY en el servidor.",
      uso: null,
    };
  }

  const mensajes: MensajeOpenAI[] = [
    { role: "system", content: instrucciones() },
    ...historial.map(
      (m): MensajeOpenAI =>
        m.rol === "usuario" ? { role: "user", content: m.texto } : { role: "assistant", content: m.texto },
    ),
  ];

  const usadas: string[] = [];
  let entrada = 0;
  let enCache = 0;
  let salida = 0;
  let llamadasAlModelo = 0;
  const uso = (): UsoPregunta => ({
    modelo: config.modelo,
    llamadas: llamadasAlModelo,
    tokens: { entrada, cache: enCache, salida },
    herramientas: usadas,
  });

  for (let vuelta = 0; vuelta <= MAX_VUELTAS; vuelta++) {
    // En la última vuelta ya no se ofrecen herramientas: tiene que contestar
    // con lo que juntó, en vez de cortar con las manos vacías.
    const conHerramientas = vuelta < MAX_VUELTAS;

    const cuerpo: Record<string, unknown> = {
      model: config.modelo,
      messages: mensajes,
      // Las herramientas se declaran siempre —el historial ya trae llamadas— y
      // en la última vuelta se prohíben con `none`.
      tools: HERRAMIENTAS,
      tool_choice: conHerramientas ? "auto" : "none",
      ...(esModeloDeRazonamiento(config.modelo)
        ? { reasoning_effort: "low", max_completion_tokens: 4000 }
        : { temperature: 0.2, max_tokens: 1200 }),
    };

    let respuesta: Response;
    llamadasAlModelo += 1;
    try {
      respuesta = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${config.clave}`, "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      console.error("[asistente] No se pudo llamar a OpenAI:", error);
      return {
        ok: false,
        status: 502,
        error: "No se pudo contactar al modelo. Probá de nuevo en un momento.",
        uso: uso(),
      };
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      console.error(
        `[asistente] OpenAI respondió ${respuesta.status} con el modelo ${config.modelo}:`,
        detalle.slice(0, 500),
      );
      return {
        ok: false,
        status: 502,
        error:
          respuesta.status === 429
            ? "El modelo está saturado o se agotó el crédito de OpenAI. Probá más tarde."
            : "El modelo devolvió un error. Quedó registrado en el log del servidor.",
        uso: uso(),
      };
    }

    const datos = (await respuesta.json()) as RespuestaOpenAI;
    entrada += datos.usage?.prompt_tokens ?? 0;
    enCache += datos.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    salida += datos.usage?.completion_tokens ?? 0;

    const mensaje = datos.choices?.[0]?.message;
    const llamadas = conHerramientas ? (mensaje?.tool_calls ?? []) : [];

    if (llamadas.length === 0) {
      // Queda en el log quién preguntó y cuánto costó: es lo que permite ver el
      // gasto real por persona sin esperar a la factura.
      console.info(
        `[asistente] ${quien} · ${config.modelo} · ${vuelta + 1} llamadas · ` +
          `${entrada} tokens de entrada (${enCache} en caché) · ${salida} de salida · ` +
          `herramientas: ${usadas.join(", ") || "ninguna"}`,
      );
      const texto = mensaje?.content?.trim();
      if (!texto) {
        return { ok: false, status: 502, error: "El modelo no devolvió respuesta. Probá reformular.", uso: uso() };
      }
      return { ok: true, texto, herramientas: usadas, uso: uso() };
    }

    mensajes.push({ role: "assistant", content: mensaje?.content ?? null, tool_calls: llamadas });

    // Las herramientas de una misma vuelta no dependen entre sí.
    const resultados = await Promise.all(
      llamadas.map(async (llamada) => {
        const nombre = llamada.function.name;
        usadas.push(nombre);
        const resultado = esHerramienta(nombre)
          ? await ejecutarHerramienta(nombre, leerArgumentos(llamada.function.arguments))
          : { error: `No existe la herramienta ${nombre}.` };
        return { role: "tool" as const, tool_call_id: llamada.id, content: serializarResultado(resultado) };
      }),
    );
    mensajes.push(...resultados);
  }

  // No se llega: la última vuelta no ofrece herramientas y siempre contesta.
  return { ok: false, status: 502, error: "El asistente no llegó a una respuesta.", uso: uso() };
}
