import { operadorActual } from "@/lib/sesion";
import { leerMensajes, responderComoOperador } from "@/lib/chat-sellers";
import { jsonLimitado } from "@/lib/chat-interno";

export const dynamic = "force-dynamic";

function uuidValido(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await operadorActual()) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!uuidValido(id)) return Response.json({ ok: false }, { status: 400 });
  try {
    return Response.json({ ok: true, mensajes: await leerMensajes(id) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "No se pudo cargar la conversación." }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!uuidValido(id)) return Response.json({ ok: false }, { status: 400 });
  const cuerpo = await jsonLimitado(request) as { texto?: unknown } | null;
  const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.trim() : "";
  if (!texto || texto.length > 4000) return Response.json({ ok: false, error: "El mensaje debe tener entre 1 y 4000 caracteres." }, { status: 400 });
  const resultado = await responderComoOperador(id, operador.email, texto);
  return Response.json(resultado, { status: resultado.ok ? 200 : 409 });
}
