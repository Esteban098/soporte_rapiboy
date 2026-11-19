import { operadorDesdeTokenExtension } from "@/lib/asistente-extension";
import { crearSeguimientoComo, leerReportesDelCaso } from "@/lib/seguimiento-alta";

const MAX_CUERPO = 16 * 1024;

type PedidoExtension = {
  accion?: unknown;
  casoId?: unknown;
  comentario?: unknown;
  driver?: unknown;
  seller?: unknown;
};

function texto(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

export async function POST(pedido: Request) {
  const operador = await operadorDesdeTokenExtension(pedido);
  if (!operador) {
    return Response.json({ ok: false, error: "Vinculación inválida o vencida." }, { status: 401 });
  }

  const tamano = Number(pedido.headers.get("content-length") ?? "0");
  if (Number.isFinite(tamano) && tamano > MAX_CUERPO) {
    return Response.json({ ok: false, error: "La solicitud es demasiado grande." }, { status: 413 });
  }

  let cuerpo: PedidoExtension;
  try {
    const raw = await pedido.text();
    if (raw.length > MAX_CUERPO) {
      return Response.json({ ok: false, error: "La solicitud es demasiado grande." }, { status: 413 });
    }
    cuerpo = JSON.parse(raw) as PedidoExtension;
  } catch {
    return Response.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const accion = texto(cuerpo.accion, 20);
  const casoId = texto(cuerpo.casoId, 12);
  if (!/^\d{1,12}$/.test(casoId)) {
    return Response.json({ ok: false, error: "Ingresá un ID de viaje válido." }, { status: 422 });
  }

  if (accion === "consultar") {
    const previo = await leerReportesDelCaso(casoId);
    return Response.json({ ok: true, previo });
  }

  if (accion !== "crear") {
    return Response.json({ ok: false, error: "Acción inválida." }, { status: 400 });
  }

  const resultado = await crearSeguimientoComo(operador.email, {
    casoId,
    comentario: texto(cuerpo.comentario, 4001),
    driver: texto(cuerpo.driver, 201),
    seller: texto(cuerpo.seller, 201),
    archivos: [],
  });
  if (!resultado.ok) return Response.json(resultado, { status: 422 });

  return Response.json({
    ok: true,
    id: resultado.id,
    enlace: `/seguimiento?reporte=${encodeURIComponent(resultado.id)}`,
  });
}

export const dynamic = "force-dynamic";
