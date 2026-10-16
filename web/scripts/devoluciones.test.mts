import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { agruparDevoluciones, horasDevolucion, horasPendientesDevolucion, duracionDevolucion, resumenDevoluciones, devolucionesPorDia } from "../src/lib/devoluciones-metricas";

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
  assert.equal(horasDevolucion("2026-10-31T20:00:00-06:00", "2026-11-01T08:00:00-06:00"), 4);
  assert.equal(horasDevolucion("2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z"), 0);
  assert.equal(horasDevolucion("2026-10-01", null), null);
  assert.equal(horasDevolucion("2026-10-02", "2026-10-01"), null);
  assert.equal(horasDevolucion("inválida", "2026-10-01"), null);
});

test("el promedio usa solo cierres medidos y distingue pendientes de fechas faltantes", () => {
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
  assert.equal(resumen.dentro72, 2);
  assert.equal(resumen.devueltosSinFecha, 1);
  assert.equal(resumen.pendientes, 1);
  assert.equal(resumen.demoradas, 1);
  const grupos = agruparDevoluciones(filas, "repartidor");
  assert.equal(grupos.find((grupo) => grupo.nombre === "Ana")?.promedio, 48);
  assert.equal(grupos.find((grupo) => grupo.nombre === "Luis")?.promedio, null);
});

test("Entregado es exitoso: no tiene antigüedad pendiente ni cuenta como demorado", () => {
  const inicio = "2026-10-01T10:00:00Z";
  const ahora = "2026-10-05T10:00:00Z";
  assert.equal(horasPendientesDevolucion(inicio, " Entregado ", null, ahora), null);
  assert.equal(horasPendientesDevolucion(inicio, "Devuelto", null, ahora), null);
  assert.equal(horasPendientesDevolucion(inicio, "Devolucion", null, ahora), 72);
  const resumen = resumenDevoluciones([
    { id: 1, estado: "Entregado", horasResolucion: null, horasPendiente: 96 },
    { id: 2, estado: "Devolucion", horasResolucion: null, horasPendiente: 96 },
  ]);
  assert.equal(resumen.pendientes, 1);
  assert.equal(resumen.demoradas, 1);
});

test("el tiempo se muestra en horas hasta 24 h y en días al superarlas", () => {
  assert.equal(duracionDevolucion(null), "—");
  assert.equal(duracionDevolucion(12), "12 h");
  assert.equal(duracionDevolucion(24), "24 h");
  assert.equal(duracionDevolucion(36), "1,5 d");
  assert.equal(duracionDevolucion(48), "2 d");
});

test("descuenta únicamente las horas de domingo en México, incluidos extremos parciales", () => {
  assert.equal(horasDevolucion("2026-10-10T23:00:00-06:00", "2026-10-12T01:00:00-06:00"), 2);
  assert.equal(horasDevolucion("2026-10-11T10:00:00-06:00", "2026-10-11T19:00:00-06:00"), 0);
  assert.equal(horasDevolucion("2026-10-12T00:00:00-06:00", "2026-10-26T00:00:00-06:00"), 288);
  assert.equal(horasDevolucion("2026-10-10T23:59:59-06:00", "2026-10-11T00:00:01-06:00"), 1 / 3600);
  const resumen = resumenDevoluciones([
    { id: 1, horasResolucion: 72 }, { id: 2, horasResolucion: 72.01 }, { id: 3, horasResolucion: null },
  ]);
  assert.equal(resumen.dentro72, 1);
  assert.equal(resumen.cerradas, 2);
});

test("agrupa cierres por fecha mexicana y no duplica un paquete guardado en dos meses", () => {
  const resumen = devolucionesPorDia([
    { id: 1, fechaDevueltoISO: "2026-10-10T23:00:00Z" },
    { id: 1, fechaDevueltoISO: "2026-10-10T23:00:00Z" },
    { id: 2, fechaDevueltoISO: "2026-10-11T01:00:00Z" },
    { id: 3, fechaDevueltoISO: "2026-10-11T12:00:00Z" },
    { id: 4, fechaDevueltoISO: "2026-10-12T06:00:00Z" },
    { id: 5, fechaDevueltoISO: null },
  ]);
  assert.deepEqual(resumen.fechas, [{ dia: "2026-10-10", cantidad: 2 }, { dia: "2026-10-12", cantidad: 1 }]);
  assert.equal(resumen.semana.find((dia) => dia.nombre === "Sábado")?.cantidad, 2);
  assert.equal(resumen.semana.find((dia) => dia.nombre === "Lunes")?.cantidad, 1);
  assert.equal(resumen.domingos, 1);
});

test("el almacenamiento es mensual e independiente y el webhook exige autorización", () => {
  assert.equal(nodo("Guardar devoluciones").parameters.table.value, "devoluciones_mensuales");
  assert.deepEqual(nodo("Guardar devoluciones").parameters.columns.matchingColumns, ["mes", "id"]);
  assert.equal(nodo("Actualizar desde plataforma").parameters.authentication, "headerAuth");
  assert.equal(flujo.settings.timezone, "America/Argentina/Buenos_Aires");
  assert.equal(flujo.active, false);
});
