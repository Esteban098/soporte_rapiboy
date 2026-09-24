import { guardarVotoWebhook } from "@/app/asistencia";
import { fechaOperacionAsistencia, respuestaAsistencia, telefonoAsistencia } from "@/lib/asistencia";
import { TABLA_ASISTENCIA_CONTACTOS } from "@/lib/config";
import { consultarTodo } from "@/lib/supabase";
import { diaDeOperacion } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/**
 * Entrada del proveedor de encuestas. No acepta service_role ni credenciales de
 * Supabase: el secreto es exclusivo de este webhook y el teléfono se resuelve
 * dentro del servidor contra la tabla privada de vínculos.
 */
export async function POST(pedido: Request) {
  const secreto = process.env.ASISTENCIA_WEBHOOK_SECRET?.trim();
  const autorizado = secreto && pedido.headers.get("authorization") === `Bearer ${secreto}`;
  if (!autorizado) return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });

  const cuerpo = (await pedido.json().catch(() => null)) as Record<string, unknown> | null;
  const respuesta = respuestaAsistencia(cuerpo?.voto ?? cuerpo?.respuesta);
  const telefono = telefonoAsistencia(cuerpo?.telefono);
  const fecha = fechaOperacionAsistencia(cuerpo?.fechaOperacion) ?? diaDeOperacion();
  const votadoEn = typeof cuerpo?.timestamp === "string" && !Number.isNaN(Date.parse(cuerpo.timestamp))
    ? cuerpo.timestamp
    : new Date().toISOString();
  const idDirecto = Number(cuerpo?.idMotoboy);
  const tieneIdDirecto = Number.isSafeInteger(idDirecto) && idDirecto > 0;
  if (!respuesta || (!telefono && !tieneIdDirecto)) return Response.json({ ok: false, error: "Voto y teléfono o IdMotoboy son obligatorios." }, { status: 400 });

  const contactos = tieneIdDirecto
    ? []
    : await consultarTodo<{ id_motoboy: number }>(
      TABLA_ASISTENCIA_CONTACTOS,
      { telefono_normalizado: `eq.${telefono}`, select: "id_motoboy" },
      "id_motoboy.asc",
    ).catch(() => []);
  const idMotoboy = tieneIdDirecto ? idDirecto : Number(contactos[0]?.id_motoboy);
  if (!Number.isSafeInteger(idMotoboy) || idMotoboy <= 0) {
    return Response.json({ ok: false, error: "Teléfono sin vínculo IdMotoboy." }, { status: 422 });
  }

  const resultado = await guardarVotoWebhook({
    idMotoboy,
    respuesta,
    fechaOperacion: fecha,
    idPoll: typeof cuerpo?.idPoll === "string" ? cuerpo.idPoll : null,
    votadoEn,
  });
  return Response.json(resultado, { status: resultado.ok ? 200 : 500 });
}
