import assert from "node:assert/strict";
import test from "node:test";
import { guardarRevisionesLote } from "../src/lib/evidencias-lotes";
import type { DecisionEvidencia } from "../src/lib/evidencias";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("un lote deduplica y distingue éxito, conflicto y error, conservando actor y comentario", async (t) => {
  const anteriorUrl = process.env.SUPABASE_URL;
  const anteriorKey = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = "https://pruebas.invalid";
  process.env.SUPABASE_SERVICE_KEY = "solo-prueba";
  t.after(() => {
    if (anteriorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = anteriorUrl;
    if (anteriorKey === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = anteriorKey;
  });
  const vistos: string[] = [];
  let simultaneas = 0; let maximo = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(String(url), "https://pruebas.invalid/rest/v1/rpc/evidencia_entrega_revisar");
    const p = JSON.parse(String(init.body));
    assert.equal(p.p_decision, "DESCARTADA");
    assert.equal(p.p_revisada_por, "soporte@prueba.invalid");
    assert.equal(p.p_comentario.length, 1000);
    vistos.push(p.p_id);
    simultaneas++; maximo = Math.max(maximo, simultaneas);
    await new Promise<void>((resolve) => setImmediate(resolve));
    simultaneas--;
    if (p.p_id === id(3)) return new Response("fallo", { status: 500 });
    return Response.json(p.p_id !== id(2));
  });
  const ids = Array.from({ length: 12 }, (_, n) => id(n + 1));
  const resultado = await guardarRevisionesLote([...ids, id(1)], "DESCARTADA", "a".repeat(1100), "soporte@prueba.invalid");
  assert.equal(vistos.length, 12);
  assert.equal(new Set(vistos).size, 12);
  assert.equal(resultado.guardadas.length, 10);
  assert.deepEqual(resultado.conflictos, [id(2)]);
  assert.deepEqual(resultado.fallidas, [id(3)]);
  assert.ok(maximo <= 5 && maximo > 1);
});

test("rechaza lotes vacíos, excesivos o inválidos antes de escribir", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("no debe llamar"); });
  for (const ids of [[], ["invalido"], Array.from({ length: 101 }, (_, n) => id(n))]) {
    await assert.rejects(guardarRevisionesLote(ids, "CONFIRMADA", "", "operador"));
  }
  await assert.rejects(guardarRevisionesLote([id(1)], "OTRA" as DecisionEvidencia, "", "operador"));
  assert.equal(fetchMock.mock.callCount(), 0);
});
