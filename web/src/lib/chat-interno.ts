import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Autenticación compartida entre los workers privados de n8n y Next.js. */
export function autorizadoN8n(request: Request): boolean {
  const esperado = process.env.N8N_WEBHOOK_WHATSAPP_SECRET;
  const recibido = request.headers.get("authorization") ?? "";
  if (!esperado || !/^Bearer [^\s]+$/i.test(recibido)) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido.slice(7));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Evita acumular cuerpos arbitrariamente grandes en endpoints internos. */
export async function jsonLimitado(request: Request, maximo = 8192): Promise<unknown | null> {
  const longitud = Number(request.headers.get("content-length"));
  if (Number.isFinite(longitud) && longitud > maximo) return null;
  if (!request.body) return null;
  const lector = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await lector.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}
