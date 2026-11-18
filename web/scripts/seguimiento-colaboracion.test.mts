import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { comentarEn, FALTA_COLABORACION, leerComentariosEn, tomarEn } from "../src/lib/seguimiento-colaboracion";

const id = "00000000-0000-4000-8000-000000000001";
const solicitud = "00000000-0000-4000-8000-000000000002";
function entorno(t: test.TestContext) {
  const antes = { url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_KEY };
  process.env.SUPABASE_URL = "https://db.example.test";
  process.env.SUPABASE_SERVICE_KEY = "solo-prueba";
  t.after(() => {
    if (antes.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = antes.url;
    if (antes.clave === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = antes.clave;
  });
}
test("retirarse nunca permite quitar a otro salvo autorización administrativa", async (t) => {
  entorno(t); const pedidos: { url: string; cuerpo: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push({ url: String(url), cuerpo: JSON.parse(String(init?.body)) });
    return Response.json({ ok: true });
  });
  assert.equal((await tomarEn(id, "yo@example.test", false, false, "otro@example.test")).ok, false);
  assert.equal((await tomarEn(id, "yo@example.test", true, true, "otro@example.test")).ok, false, "ni un admin toma por otro");
  assert.equal(pedidos.length, 0);
  assert.equal((await tomarEn(id, "YO@example.test", true, false)).ok, true);
  assert.match(pedidos[0].url, /rpc\/seguimiento_tomar_doble$/);
  assert.deepEqual(pedidos[0].cuerpo, { p_id: id, p_actor: "yo@example.test", p_tomar: true, p_objetivo: null, p_admin: false });
});
test("valida comentarios y reusa la solicitud en un reintento", async (t) => {
  entorno(t); const pedidos: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body))); return Response.json({ ok: true, repetida: pedidos.length > 1 });
  });
  assert.equal((await comentarEn(id, "yo@example.test", " ", solicitud)).ok, false);
  assert.equal((await comentarEn(id, "yo@example.test", "x".repeat(4001), solicitud)).ok, false);
  assert.equal((await comentarEn("no-uuid", "yo@example.test", "Novedad", solicitud)).ok, false);
  assert.equal(pedidos.length, 0);
  assert.equal((await comentarEn(id, "yo@example.test", " Novedad ", solicitud)).ok, true);
  assert.equal((await comentarEn(id, "yo@example.test", " Novedad ", solicitud) as { repetida?: boolean }).repetida, true);
  assert.deepEqual(pedidos[0], pedidos[1]);
  assert.equal(pedidos[0].p_texto, "Novedad");
});
test("historial paginado con cursor validado y aviso de migración pendiente", async (t) => {
  entorno(t); let consulta: URL | null = null;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    consulta = new URL(String(url)); return Response.json(Array.from({ length: 51 }, (_, n) => ({ id: `c${n}`, orden: 100 - n })));
  });
  const salida = await leerComentariosEn(id, 101);
  assert.equal(salida.ok, true);
  if (!salida.ok) return;
  assert.equal(salida.comentarios.length, 50);
  assert.equal(salida.anteriores, 51);
  assert.equal(salida.comentarios[0].orden, 51);
  assert.equal((consulta as URL | null)?.searchParams.get("orden"), "lt.101");
  assert.equal((await leerComentariosEn(id, -1)).ok, false);
});
test("los errores no filtran detalles del proveedor", async (t) => {
  entorno(t); let estado = 500;
  t.mock.method(globalThis, "fetch", async () => new Response(estado === 404 ? '{"code":"PGRST205"}' : "detalle privado", { status: estado }));
  const fallo = await comentarEn(id, "yo@example.test", "Dato", solicitud);
  assert.ok(!JSON.stringify(fallo).includes("privado"));
  estado = 404;
  assert.deepEqual(await leerComentariosEn(id), { ok: false, error: FALTA_COLABORACION });
});
test("las acciones derivan identidad y permisos de la sesión", () => {
  const fuente = readFileSync(new URL("../src/app/seguimiento.ts", import.meta.url), "utf8");
  for (const nombre of ["tomarSeguimiento", "comentariosSeguimiento", "agregarComentarioSeguimiento"]) {
    const inicio = fuente.indexOf(`export async function ${nombre}(`);
    const fin = fuente.indexOf("\nexport async function ", inicio + 1);
    const cuerpo = fuente.slice(inicio, fin === -1 ? undefined : fin);
    assert.match(cuerpo, /await operadorActual\(\)/);
    assert.match(cuerpo, /if \(!operador\)/);
  }
  assert.match(fuente, /tomarEn\(id, operador.email, tomar, operador.rol === "admin", objetivo\)/);
});
