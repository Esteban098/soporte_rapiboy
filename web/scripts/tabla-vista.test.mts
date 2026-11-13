import assert from "node:assert/strict";
import test from "node:test";
import { claveFilaTabla, filtrarFilas, seleccionVigente } from "../src/lib/tabla-vista";
import { guardarPreferencia, leerPreferencia, parsearFiltros } from "../src/lib/preferencias";
import type { Fila } from "../src/components/Tabla";

const filas: Fila[] = [
  { id: 1, mes: "2026-09", estado: "Devuelto ", driver: "José  Muñoz" },
  { id: 1, mes: "2026-10", estado: "Entregado", driver: "Ana" },
  { id: 2, mes: "2026-10", estado: "Devolucion", driver: "Ana" },
];
const columnas = [{ clave: "id", titulo: "Viaje" }, { clave: "estado", titulo: "Estado" }, { clave: "driver", titulo: "Driver" }];
const filtros = [{ clave: "estado", etiqueta: "Estado" }, { clave: "driver", etiqueta: "Driver" }];

test("combina OR dentro de cada filtro y AND entre columnas, sin preferencias invisibles", () => {
  const seleccion = seleccionVigente({ estado: ["Devuelto", "Entregado"], antigua: ["no existe"] }, filtros);
  assert.deepEqual(filtrarFilas(filas, columnas, seleccion, "").map((f) => f.estado), ["Devuelto ", "Entregado"]);
  assert.deepEqual(filtrarFilas(filas, columnas, { ...seleccion, driver: ["Ana"] }, "").map((f) => f.estado), ["Entregado"]);
  assert.equal(filtrarFilas(filas, columnas, seleccion, " jose munoz ").length, 1);
  assert.equal(filtrarFilas(filas, columnas, {}, "   ").length, 3);
  assert.deepEqual(seleccionVigente({ estado: [" Devuelto ", "Devuelto"], driver: [] }, filtros), { estado: ["Devuelto"] });
});

test("un viaje repetido entre meses conserva claves de fila diferentes y estables al filtrar", () => {
  assert.notEqual(claveFilaTabla(filas[0], 0), claveFilaTabla(filas[1], 1));
  assert.equal(claveFilaTabla(filas[1], 1), claveFilaTabla(filas[1], 0));
});

test("los filtros siguen funcionando cuando el navegador bloquea localStorage", (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); }, removeItem() { throw new Error("bloqueado"); },
  } } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else Reflect.deleteProperty(globalThis, "window"); });
  guardarPreferencia("operacion-prueba", "filtros", { estado: ["Devuelto"] });
  guardarPreferencia("historial-prueba", "filtros", { estado: ["Entregado"] });
  assert.deepEqual(parsearFiltros(leerPreferencia("operacion-prueba", "filtros")), { estado: ["Devuelto"] });
  assert.deepEqual(parsearFiltros(leerPreferencia("historial-prueba", "filtros")), { estado: ["Entregado"] });
  guardarPreferencia("operacion-prueba", "filtros", {});
  assert.equal(leerPreferencia("operacion-prueba", "filtros"), "");
  assert.equal(parsearFiltros(leerPreferencia("historial-prueba", "filtros")).estado[0], "Entregado");
});
