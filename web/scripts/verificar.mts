/**
 * Verificación autosuficiente de la normalización y las métricas principales.
 *
 * Antes leía CSV locales generados desde un libro que ya no es una dependencia
 * del proyecto. El chequeo no debe requerir datos operativos ni secretos para
 * poder correrse antes de publicar.
 */
import assert from "node:assert/strict";
import { demorados, ranking, resumen } from "../src/lib/metricas";
import { mapearColumnas, parsearPedido } from "../src/lib/normalizar";

const encabezado = ["id", "fecha_creacion", "fecha_programado", "estado", "tienda", "visitas"];
const mapa = mapearColumnas(encabezado);
const pedidos = [
  ["1001", "2026-09-01", "2026-09-05", "Pedido no entregado", "Tienda A", "1"],
  ["1002", "2026-09-02", "2026-09-06", "Devuelto", "Tienda B", "2"],
  ["1003", "2026-09-03", "2026-09-07", "Entregado", "Tienda A", "1"],
  ["1004", "2026-09-04", "2026-09-08", "Devolución en centro de DropOff", "Tienda C", "1"],
]
  .map((fila) => parsearPedido(fila, mapa))
  .filter((pedido): pedido is NonNullable<typeof pedido> => pedido !== null);

assert.equal(pedidos.length, 4);
const metricas = resumen(pedidos);
assert.deepEqual({
  ...metricas,
  tasaDevolucion: undefined,
}, {
  casos: 4,
  devoluciones: 2,
  entregados: 1,
  abiertos: 1,
  tasaDevolucion: undefined,
  visitasPromedio: 5 / 4,
  desde: "2026-09",
  hasta: "2026-09",
});
assert.ok(Math.abs(metricas.tasaDevolucion - 50) < 1e-10);
assert.deepEqual(demorados(pedidos, Date.parse("2026-09-10T00:00:00.000Z")).map((pedido) => pedido.id), [1001]);
assert.equal(ranking(pedidos, "tienda", { minimoCasos: 1, limite: 1 })[0]?.nombre, "Tienda B");

console.log("Verificación: normalización y métricas principales correctas.");
