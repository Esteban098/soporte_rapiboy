import { crearRespuestaRapida, listarRespuestasRapidas } from "@/lib/chat-sellers";
import { jsonLimitado } from "@/lib/chat-interno";
import { operadorActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

type Entrada = { atajo?: unknown; titulo?: unknown; contenido?: unknown; activa?: unknown };

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

export async function GET() {
  if (!await operadorActual()) return Response.json({ ok: false }, { status: 403 });
  try {
    return Response.json({ ok: true, respuestas: await listarRespuestasRapidas(true) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "No se pudieron cargar los mensajes rápidos." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  const entrada = validar(await jsonLimitado(request, 10_000) as Entrada | null);
  if ("error" in entrada) return Response.json({ ok: false, error: entrada.error }, { status: 400 });
  const error = await crearRespuestaRapida(entrada.datos, operador.email);
  return Response.json({ ok: !error, error: error ? "No se pudo crear. Revisá que el atajo no esté repetido." : undefined }, { status: error ? 409 : 201 });
}
