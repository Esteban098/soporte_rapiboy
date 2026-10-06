import { operadorActual } from "@/lib/sesion";
import { listarChats } from "@/lib/chat-sellers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const operador = await operadorActual();
  if (!operador) return Response.json({ ok: false }, { status: 403 });
  try {
    const solicitado = Number(new URL(request.url).searchParams.get("limit") ?? "100");
    const limite = Number.isSafeInteger(solicitado) ? Math.min(1000, Math.max(1, solicitado)) : 100;
    const resultado = await listarChats(operador.email, limite);
    return Response.json({ ok: true, ...resultado }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "No se pudo cargar la bandeja." }, { status: 503 });
  }
}
