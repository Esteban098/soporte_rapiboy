import { NextResponse } from "next/server";
import { autorizarWebhook, procesarEvidencia, validarEntrada } from "@/lib/evidencias";
import { codigoSeguro } from "@/lib/evidencias-reglas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!autorizarWebhook(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }
  const largo = Number(request.headers.get("content-length") ?? 0);
  if (largo > 8_192) return NextResponse.json({ error: "cuerpo_demasiado_grande" }, { status: 413 });
  try {
    const entrada = validarEntrada(await request.json());
    return NextResponse.json(await procesarEvidencia(entrada));
  } catch (error) {
    return NextResponse.json({ error: codigoSeguro(error) }, { status: 400 });
  }
}
