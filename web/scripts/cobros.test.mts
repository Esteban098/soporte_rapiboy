import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { actualizarCobroSiniestrado } from "../src/lib/supabase";

test("guardar un cobro usa la operación transaccional con auditoría", async (t) => {
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

  for (const cobrado of [true, false]) {
    const fetchSimulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/rpc/marcar_cobro_siniestrado");
      assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_id: 123,
        p_cobrado: cobrado,
        p_quien: "operador@prueba.invalid",
      });
      return Response.json([{ id: 123, cobrado, origen: "mensual" }]);
    });
    assert.equal(await actualizarCobroSiniestrado(123, cobrado, "operador@prueba.invalid"), null);
    assert.equal(fetchSimulado.mock.callCount(), 1);
    fetchSimulado.mock.restore();
  }

  for (const respuesta of [[], [{ id: 456, cobrado: true }], [{ id: 123, cobrado: false }]]) {
    const fetchSimulado = t.mock.method(globalThis, "fetch", async () => Response.json(respuesta));
    assert.match((await actualizarCobroSiniestrado(123, true, "local"))!, /Actualizá la tabla/);
    fetchSimulado.mock.restore();
  }

  const fetchSimulado = t.mock.method(globalThis, "fetch", async () => new Response("denegado", { status: 403 }));
  assert.match((await actualizarCobroSiniestrado(123, true, "local"))!, /rechazó/);
  fetchSimulado.mock.restore();
});

test("la migración bloquea el caso, audita el cambio y conserva cobrado al rotar", () => {
  const sql = readFileSync(new URL("../supabase/migracion-39-cobros-auditoria.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.siniestrados_cobros_historial/);
  assert.match(sql, /create or replace function public\.marcar_cobro_siniestrado/);
  assert.match(sql, /from public\.mensual m[\s\S]*?for update/);
  assert.match(sql, /from public\.mensual_historico h[\s\S]*?for update/);
  assert.match(sql, /insert into public\.siniestrados_cobros_historial/);
  assert.match(sql, /cobrado_anterior/);
  assert.match(sql, /cobrado_nuevo/);
  assert.match(sql, /cambiado_por/);
  assert.match(sql, /cobrado = excluded\.cobrado/);
  assert.doesNotMatch(sql, /insert into public\.mensual_historico[\s\S]*?valor_70/);
  assert.match(sql, /revoke all on function public\.marcar_cobro_siniestrado/);
  assert.match(sql, /grant execute on function public\.marcar_cobro_siniestrado[\s\S]*?service_role/);
});

test("un refresco no puede contradecir el último valor auditado", () => {
  const sql = readFileSync(new URL("../supabase/migracion-40-cobros-protegidos-refrescos.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.proteger_cobro_siniestrado/);
  assert.match(sql, /before update of cobrado on public\.mensual\b/);
  assert.match(sql, /before update of cobrado on public\.mensual_historico\b/);
  assert.match(sql, /order by historial\.id desc/);
  assert.match(sql, /new\.cobrado := cobrado_auditado/);
  assert.match(sql, /where m\.cobrado is true/);
  assert.match(sql, /where h\.cobrado is true/);

  const funcion = sql.match(
    /create or replace function public\.marcar_cobro_siniestrado[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(funcion);
  const auditoria = funcion.indexOf("insert into public.siniestrados_cobros_historial");
  const escritura = funcion.indexOf("update public.mensual");
  assert.ok(auditoria >= 0 && escritura > auditoria, "la intención debe auditarse antes del UPDATE protegido");
});
