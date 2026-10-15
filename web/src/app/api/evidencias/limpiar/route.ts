import { NextResponse } from "next/server";
import { autorizarWebhook, limpiarEvidenciasVencidas } from "@/lib/evidencias";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!autorizarWebhook(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }
  return NextResponse.json(await limpiarEvidenciasVencidas());
}
