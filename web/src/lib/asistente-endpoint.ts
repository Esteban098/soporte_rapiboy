import "server-only";

import { preguntaOperativa, validarHistorial } from "./asistente";
import { responder } from "./asistente-chat";
import { llegoAlTope, registrarUso } from "./asistente-uso";
import { TOPE_DIARIO_ASISTENTE } from "./config";
import type { Operador } from "./sesion";

/** Respuesta común para el chat web y la extensión vinculada. */
export async function responderPedidoAsistente(pedido: Request, operador: Operador) {
  const cuerpo = (await pedido.json().catch(() => null)) as { mensajes?: unknown } | null;
  const historial = validarHistorial(cuerpo?.mensajes);
  if (!historial) return Response.json({ ok: false, error: "Falta la pregunta." }, { status: 400 });

  if (!preguntaOperativa(historial.at(-1)!.texto)) {
    return Response.json(
      { ok: false, error: "Solo puedo ayudar con la operación interna de Rapiboy y los datos de la plataforma." },
      { status: 422 },
    );
  }

  if (await llegoAlTope(operador.email)) {
    return Response.json(
      {
        ok: false,
        error:
          "Llegaste al tope de " +
          TOPE_DIARIO_ASISTENTE +
          " preguntas por hoy. Se reinicia a medianoche de México.",
      },
      { status: 429 },
    );
  }

  const resultado = await responder(historial, operador.email);
  if (resultado.uso) {
    await registrarUso({ email: operador.email, ok: resultado.ok, ...resultado.uso });
  }
  if (!resultado.ok) {
    return Response.json({ ok: false, error: resultado.error }, { status: resultado.status });
  }
  return Response.json({
    ok: true,
    texto: resultado.texto,
    herramientas: resultado.herramientas,
  });
}
