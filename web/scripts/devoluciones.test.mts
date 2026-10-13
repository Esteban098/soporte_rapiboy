import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const flujo = JSON.parse(readFileSync(new URL("../../n8n/17-devoluciones-mensuales.json", import.meta.url), "utf8"));
const nodo = (nombre: string) => flujo.nodes.find((n: { name: string }) => n.name === nombre);
const ejecutarRango = (body: unknown) => runInNewContext(`(function(){${nodo("Validar período").parameters.jsCode}})()`, {
  $json: { body }, Intl, Date,
});

test("el rango del webhook valida las entradas y ordena meses antes de interpolar SQL", () => {
  const resultado = ejecutarRango({ desde: "2026-10", hasta: "2026-08" });
  assert.equal(resultado[0].json.desde, "2026-08");
  assert.equal(resultado[0].json.hasta, "2026-10");
  assert.throws(() => ejecutarRango({ desde: "2026-13" }));
  assert.throws(() => ejecutarRango({ desde: "2026-10'; DROP TABLE Viaje;--" }));
  assert.throws(() => ejecutarRango({ hasta: 202610 }));
});

test("la ficha conserva el evento histórico aunque el paquete ahora esté entregado", () => {
  const salida = runInNewContext(`(function(){${nodo("A columnas").parameters.jsCode}})()`, {
    $input: { all: () => [{ json: {
      Id: 123, Mes: "2026-10-01", PrimeraDevolucion: "2026-10-01T04:00:00-03:00",
      UltimaDevolucion: "2026-10-03T10:00:00-03:00", Estado: "Entregado", Tienda: "Seller",
    } }] }, Date,
  });
  assert.equal(salida[0].json.estado, "Entregado");
  assert.equal(salida[0].json.mes, "2026-10-01");
  assert.equal(salida[0].json.id, 123);
  const consulta = nodo("Historial de devoluciones").parameters.query;
  assert.match(consulta, /EH\.Id = H\.IdEstado/);
  assert.match(consulta, /GROUP BY IdViaje, Mes/);
  assert.doesNotMatch(consulta, /WHERE V\.IdEstado|mensual|cancelados|\bDELETE\b|\bTRUNCATE\b/i);
});

test("el almacenamiento es mensual e independiente y el webhook exige autorización", () => {
  assert.equal(nodo("Guardar devoluciones").parameters.table.value, "devoluciones_mensuales");
  assert.deepEqual(nodo("Guardar devoluciones").parameters.columns.matchingColumns, ["mes", "id"]);
  assert.equal(nodo("Actualizar desde plataforma").parameters.authentication, "headerAuth");
  assert.equal(flujo.settings.timezone, "America/Mexico_City");
  assert.equal(flujo.active, false);
});
