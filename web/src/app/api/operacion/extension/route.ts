import { operadorDesdeTokenExtension } from "@/lib/asistente-extension";
import { resumenTiendaExtension } from "@/lib/resumen-tienda-extension";
import { listarChatsEtiquetaWhatsapp, listarEtiquetasWhatsapp } from "@/lib/whatsapp-extension";

const MAX_CUERPO = 4 * 1024;

type Cuerpo = { accion?: unknown; etiquetaId?: unknown; sellerId?: unknown };

function texto(valor: unknown, maximo = 100): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

export async function POST(pedido: Request) {
  const operador = await operadorDesdeTokenExtension(pedido);
  if (!operador) return Response.json({ ok: false, error: "Vinculación inválida o vencida." }, { status: 401 });

  const tamano = Number(pedido.headers.get("content-length") ?? "0");
  if (Number.isFinite(tamano) && tamano > MAX_CUERPO) {
    return Response.json({ ok: false, error: "La solicitud es demasiado grande." }, { status: 413 });
  }
  let cuerpo: Cuerpo;
  try {
    const raw = await pedido.text();
    if (raw.length > MAX_CUERPO) return Response.json({ ok: false, error: "La solicitud es demasiado grande." }, { status: 413 });
    cuerpo = JSON.parse(raw) as Cuerpo;
  } catch {
    return Response.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const accion = texto(cuerpo.accion, 30);
  try {
    if (accion === "etiquetas") {
      const resultado = await listarEtiquetasWhatsapp();
      return Response.json({ ok: true, ...resultado }, { headers: { "cache-control": "private, no-store" } });
    }
    if (accion === "chats") {
      const etiquetaId = texto(cuerpo.etiquetaId, 100);
      if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(etiquetaId)) {
        return Response.json({ ok: false, error: "Etiqueta inválida." }, { status: 422 });
      }
      const resultado = await listarChatsEtiquetaWhatsapp(etiquetaId);
      return Response.json({ ok: true, ...resultado }, { headers: { "cache-control": "private, no-store" } });
    }
    if (accion === "resumen_tienda") {
      const sellerId = Number(cuerpo.sellerId);
      if (!Number.isSafeInteger(sellerId) || sellerId <= 0) {
        return Response.json({ ok: false, error: "ID de tienda inválido." }, { status: 422 });
      }
      const tienda = await resumenTiendaExtension(sellerId);
      if (!tienda) return Response.json({ ok: false, error: "La tienda no está en el directorio activo." }, { status: 404 });
      return Response.json({ ok: true, tienda }, { headers: { "cache-control": "private, no-store" } });
    }
    return Response.json({ ok: false, error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    console.error(`[operacion-extension] Falló ${accion}:`, error);
    return Response.json({ ok: false, error: "No se pudo consultar la operación." }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";
