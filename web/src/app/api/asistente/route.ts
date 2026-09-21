import { validarHistorial } from "@/lib/asistente";
import { responder } from "@/lib/asistente-chat";
import { llegoAlTope, registrarUso } from "@/lib/asistente-uso";
import { TOPE_DIARIO_ASISTENTE } from "@/lib/config";
import { operadorActual } from "@/lib/sesion";

/**
 * Una pregunta al asistente, con el ida y vuelta reciente.
 *
 * Pide operador —admin u operador—, igual que Seguimiento: el asistente lee
 * casos, reportes y el live tracker, y un comercial no ve ninguna de esas
 * pantallas. El proxy ya le cierra `/api`; esto lo cierra también si se
 * invoca por HTTP directo.
 */
export async function POST(pedido: Request) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false, error: "Sin permiso." }, { status: 403 });

  const cuerpo = (await pedido.json().catch(() => null)) as { mensajes?: unknown } | null;
  const historial = validarHistorial(cuerpo?.mensajes);
  if (!historial) return Response.json({ ok: false, error: "Falta la pregunta." }, { status: 400 });

  // Antes de gastar nada: el tope diario frena un bucle o una sesión robada.
  if (await llegoAlTope(operador.email)) {
    return Response.json(
      {
        ok: false,
        error: `Llegaste al tope de ${TOPE_DIARIO_ASISTENTE} preguntas por hoy. Se reinicia a medianoche de México.`,
      },
      { status: 429 },
    );
  }

  const resultado = await responder(historial, operador.email);
  if (resultado.uso) {
    await registrarUso({ email: operador.email, ok: resultado.ok, ...resultado.uso });
  }
  if (!resultado.ok) return Response.json({ ok: false, error: resultado.error }, { status: resultado.status });
  return Response.json({ ok: true, texto: resultado.texto, herramientas: resultado.herramientas });
}

export const dynamic = "force-dynamic";
/** Varias vueltas de herramientas pueden sumar más que el límite por defecto de Vercel. */
export const maxDuration = 60;
