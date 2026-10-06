import { actualizarRespuestaRapida, eliminarRespuestaRapida } from "@/lib/chat-sellers";
import { jsonLimitado } from "@/lib/chat-interno";
import { operadorActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

type Entrada = { atajo?: unknown; titulo?: unknown; contenido?: unknown; activa?: unknown };

function uuidValido(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
}

function validar(cuerpo: Entrada | null) {
  const atajo = typeof cuerpo?.atajo === "string" ? cuerpo.atajo.trim().replace(/^\/+/, "").toLowerCase() : "";
  const titulo = typeof cuerpo?.titulo === "string" ? cuerpo.titulo.trim() : "";
  const contenido = typeof cuerpo?.contenido === "string" ? cuerpo.contenido.trim() : "";
  const activa = cuerpo?.activa !== false;
  if (!/^[a-z0-9_-]{1,40}$/.test(atajo)) return { error: "El atajo admite letras minúsculas, números, guion y guion bajo." } as const;
  if (!titulo || titulo.length > 80) return { error: "El título debe tener entre 1 y 80 caracteres." } as const;
  if (!contenido || contenido.length > 4000) return { error: "El mensaje debe tener entre 1 y 4000 caracteres." } as const;
  return { datos: { atajo, titulo, contenido, activa } } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!uuidValido(id)) return Response.json({ ok: false }, { status: 400 });
  const entrada = validar(await jsonLimitado(request, 10_000) as Entrada | null);
  if ("error" in entrada) return Response.json({ ok: false, error: entrada.error }, { status: 400 });
  const error = await actualizarRespuestaRapida(id, entrada.datos, operador.email);
  return Response.json({ ok: !error, error: error ? "No se pudo guardar. Revisá que el atajo no esté repetido." : undefined }, { status: error ? 409 : 200 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await operadorActual()) return Response.json({ ok: false }, { status: 403 });
  const { id } = await context.params;
  if (!uuidValido(id)) return Response.json({ ok: false }, { status: 400 });
  const error = await eliminarRespuestaRapida(id);
  return Response.json({ ok: !error, error: error ? "No se pudo eliminar el mensaje rápido." : undefined }, { status: error ? 409 : 200 });
}
