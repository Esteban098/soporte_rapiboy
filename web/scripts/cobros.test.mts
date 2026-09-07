import assert from "node:assert/strict";
import test from "node:test";
import { actualizarCobroSiniestrado } from "../src/lib/supabase";

test("guardar un cobro actualiza solo el siniestro pedido y deja auditoría", async (t) => {
  const urlAnterior = process.env.SUPABASE_URL;
  const claveAnterior = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = "https://base-de-prueba.invalid";
  process.env.SUPABASE_SERVICE_KEY = "clave-de-prueba";
  t.after(() => {
    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;
    if (claveAnterior === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = claveAnterior;
  });

  for (const tabla of ["mensual", "mensual_historico"]) {
    for (const cobrado of [true, false]) {
      const fetchSimulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, `/rest/v1/${tabla}`);
        assert.equal(url.searchParams.get("id"), "eq.123");
        assert.equal(url.searchParams.get("estado"), "ilike.Siniestrado");
        assert.equal(url.searchParams.get("select"), "id,cobrado");
        assert.equal(init?.method, "PATCH");
        assert.equal(init?.cache, "no-store");
        const cuerpo = JSON.parse(String(init?.body));
        assert.deepEqual(Object.keys(cuerpo).sort(), ["cobrado", "editado_en", "editado_por"]);
        assert.equal(cuerpo.cobrado, cobrado);
        assert.equal(cuerpo.editado_por, "operador@prueba.invalid");
        assert.ok(Number.isFinite(Date.parse(cuerpo.editado_en)));
        assert.equal(new Headers(init?.headers).get("prefer"), "return=representation");
        return Response.json([{ id: 123, cobrado }]);
      });
      assert.equal(await actualizarCobroSiniestrado(tabla, 123, cobrado, "operador@prueba.invalid"), null);
      assert.equal(fetchSimulado.mock.callCount(), 1);
      fetchSimulado.mock.restore();
    }
  }

  for (const respuesta of [[], [{ id: 456, cobrado: true }], [{ id: 123, cobrado: false }]]) {
    const fetchSimulado = t.mock.method(globalThis, "fetch", async () => Response.json(respuesta));
    assert.match((await actualizarCobroSiniestrado("mensual", 123, true, "local"))!, /Actualizá la tabla/);
    fetchSimulado.mock.restore();
  }

  const fetchSimulado = t.mock.method(globalThis, "fetch", async () => new Response("denegado", { status: 403 }));
  assert.match((await actualizarCobroSiniestrado("mensual", 123, true, "local"))!, /rechazó/);
  fetchSimulado.mock.restore();
});
