import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { agruparDevoluciones, horasDevolucion, resumenDevoluciones } from "../src/lib/devoluciones-metricas";

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
      FechaDevuelto: "2026-11-01T04:00:00-03:00",
    } }] }, Date,
  });
  assert.equal(salida[0].json.estado, "Entregado");
  assert.equal(salida[0].json.mes, "2026-10-01");
  assert.equal(salida[0].json.id, 123);
  assert.equal(salida[0].json.fecha_devuelto, "2026-11-01T04:00:00-03:00");
  const consulta = nodo("Historial de devoluciones").parameters.query;
  assert.match(consulta, /H\.IdEstado = 22/);
  assert.doesNotMatch(consulta, /EH\.NombreCompleto/);
  assert.match(consulta, /GROUP BY IdViaje, Mes/);
  assert.match(consulta, /MIN\(H\.Fecha\) AS FechaDevuelto/);
  assert.match(consulta, /H\.Fecha >= D\.Primera/);
  assert.doesNotMatch(consulta, /WHERE V\.IdEstado|mensual|cancelados|\bDELETE\b|\bTRUNCATE\b/i);
});

test("los tiempos admiten cierres en otro mes y excluyen fechas ausentes o invertidas", () => {
  assert.equal(horasDevolucion("2026-10-31T20:00:00-06:00", "2026-11-01T08:00:00-06:00"), 12);
  assert.equal(horasDevolucion("2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z"), 0);
  assert.equal(horasDevolucion("2026-10-01", null), null);
  assert.equal(horasDevolucion("2026-10-02", "2026-10-01"), null);
  assert.equal(horasDevolucion("inválida", "2026-10-01"), null);
});

test("promedio y mediana usan solo cierres medidos y distinguen pendientes de fechas faltantes", () => {
  const filas = [
    { id: 1, estado: "Devuelto", repartidor: "Ana", horasResolucion: 0, horasPendiente: null },
    { id: 2, estado: "Devuelto", repartidor: "Ana", horasResolucion: 48, horasPendiente: null },
    { id: 3, estado: "Devuelto", repartidor: "Luis", horasResolucion: null, horasPendiente: null },
    { id: 4, estado: "Devolucion", repartidor: "Luis", horasResolucion: null, horasPendiente: 80 },
    { id: 1, estado: "Entregado", repartidor: "Ana", horasResolucion: 96, horasPendiente: null },
  ];
  const resumen = resumenDevoluciones(filas);
  assert.equal(resumen.paquetes, 4);
  assert.equal(resumen.registros, 5);
  assert.equal(resumen.promedio, 48);
  assert.equal(resumen.mediana, 48);
  assert.equal(resumen.dentro48, 2);
  assert.equal(resumen.devueltosSinFecha, 1);
  assert.equal(resumen.pendientes, 1);
  assert.equal(resumen.demoradas, 1);
  const grupos = agruparDevoluciones(filas, "repartidor");
  assert.equal(grupos.find((grupo) => grupo.nombre === "Ana")?.promedio, 48);
  assert.equal(grupos.find((grupo) => grupo.nombre === "Luis")?.promedio, null);
});

test("el almacenamiento es mensual e independiente y el webhook exige autorización", () => {
  assert.equal(nodo("Guardar devoluciones").parameters.table.value, "devoluciones_mensuales");
  assert.deepEqual(nodo("Guardar devoluciones").parameters.columns.matchingColumns, ["mes", "id"]);
  assert.equal(nodo("Actualizar desde plataforma").parameters.authentication, "headerAuth");
  assert.equal(flujo.settings.timezone, "America/Mexico_City");
  assert.equal(flujo.active, false);
});
