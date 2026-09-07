import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { camposPresentes, mapearColumnas, parsearPedido } from "../src/lib/normalizar";
import { columnasPara, filasDePedidos } from "../src/lib/filas";
import { mesesDisponibles, resolverRango } from "../src/lib/periodos";
import {
  resumenSiniestrados,
  siniestradosHistoricos,
  siniestradosOperativos,
  esOrigenCobro,
  COLUMNAS_COBRO,
} from "../src/lib/siniestrados";

const encabezado = ["id", "fecha_creacion", "fecha_programado", "estado", "valor_producto"];
const mapa = mapearColumnas(encabezado);
function pedido(id: number, mes: string, estado = "Siniestrado", valor = "1250.50") {
  const resultado = parsearPedido([String(id), `${mes}-01`, "2026-09-06", estado, valor], mapa);
  assert.ok(resultado);
  return resultado;
}

test("el valor declarado conserva decimales y distingue cero de desconocido", () => {
  assert.equal(pedido(1, "2026-09").valorProducto, 1250.5);
  assert.equal(pedido(1, "2026-09", "Siniestrado", "0").valorProducto, 0);
  for (const valor of ["", "null", "NaN", "Infinity", "no informado"]) {
    assert.equal(pedido(1, "2026-09", "Siniestrado", valor).valorProducto, null);
  }
  const sinColumna = parsearPedido(["1", "2026-09-01", "2026-09-06", "Siniestrado"],
    mapearColumnas(encabezado.slice(0, 4)));
  assert.equal(sinColumna?.valorProducto, null);
  assert.equal(mapearColumnas(["ValorProducto"]).valorProducto, 0);
  assert.ok(camposPresentes(mapa).includes("valorProducto"));
  assert.equal(columnasPara(camposPresentes(mapa)).find(c => c.clave === "valorProducto")?.tipo, "decimal");
  assert.equal(columnasPara(camposPresentes(mapa)).find(c => c.clave === "valorProducto")?.titulo, "Valor producto");
  assert.equal(filasDePedidos([pedido(1, "2026-09")])[0].valorProducto, 1250.5);
});

test("la ventana operativa coincide con Mensual, incluido el corte en hora de México", () => {
  const pedidos = [pedido(1, "2026-08"), pedido(2, "2026-09", " SINIESTRADO "),
    pedido(3, "2026-07"), pedido(4, "2026-09", "Entregado"), pedido(5, "2026-10")];
  assert.deepEqual(siniestradosOperativos(pedidos, new Date("2026-09-10T05:59:59Z")).map(p => p.id), [1, 2]);
  assert.deepEqual(siniestradosOperativos(pedidos, new Date("2026-09-10T06:00:00Z")).map(p => p.id), [2]);
  const anioNuevo = [pedido(6, "2026-12"), pedido(7, "2027-01")];
  assert.equal(siniestradosOperativos(anioNuevo, new Date("2027-01-09T18:00:00Z")).length, 2);
  assert.deepEqual(siniestradosOperativos(anioNuevo, new Date("2027-01-10T18:00:00Z")).map(p => p.id), [7]);
});

test("el cobro distingue false de datos ausentes y el 70% viene de la base", () => {
  const mapaCobros = mapearColumnas([...encabezado, "valor_70", "cobrado"]);
  const fila = ["123", "2026-09-01", "2026-09-06", "Siniestrado", "1250.50", "875.35"];
  const cobrado = parsearPedido([...fila, "true"], mapaCobros)!;
  assert.equal(cobrado.valor70, 875.35);
  assert.equal(cobrado.cobrado, true);
  assert.equal(parsearPedido([...fila, "false"], mapaCobros)?.cobrado, false);
  assert.equal(parsearPedido([...fila, ""], mapaCobros)?.cobrado, null);
  assert.equal(pedido(1, "2026-09").valor70, null);
  assert.equal(pedido(1, "2026-09").cobrado, null);
  assert.equal(filasDePedidos([cobrado])[0].cobrado, true);
  assert.equal(filasDePedidos([cobrado])[0].valor70, 875.35);
  assert.deepEqual(COLUMNAS_COBRO.map(c => c.clave), ["valor70", "cobrado"]);
  assert.equal(esOrigenCobro("mensual"), true);
  assert.equal(esOrigenCobro("historico"), true);
  for (const origen of [null, "perfiles", "mensual_historico", "", 1, {}]) {
    assert.equal(esOrigenCobro(origen), false);
  }
});

test("el histórico conserva el mes de creación y responde al rango y al estado actualizado", () => {
  const pedidos = [pedido(1, "2026-07"), pedido(2, "2026-08"), pedido(3, "2026-09", "Entregado")];
  const rango = { desde: "2026-07", hasta: "2026-08" };
  assert.deepEqual(siniestradosHistoricos(pedidos, rango).map(p => p.id), [1, 2]);
  pedidos[1] = { ...pedidos[1], ultimoMovimiento: new Date("2026-10-01"), valorProducto: 1500 };
  assert.equal(siniestradosHistoricos(pedidos, rango)[1].mes, "2026-08");
  assert.equal(siniestradosHistoricos(pedidos, rango)[1].valorProducto, 1500);
  const disponibles = mesesDisponibles(pedidos.map(p => p.mes));
  assert.deepEqual(resolverRango({}, disponibles), { desde: "2026-09", hasta: "2026-09" });
  pedidos[2] = { ...pedidos[2], estado: "Siniestrado" };
  assert.equal(siniestradosHistoricos(pedidos, { desde: "2026-09", hasta: "2026-09" }).length, 1);
  pedidos[1] = { ...pedidos[1], estado: "Devuelto" };
  assert.deepEqual(siniestradosHistoricos(pedidos, rango).map(p => p.id), [1]);
});

test("los totales suman centavos y señalan importes faltantes", () => {
  const pedidos = [pedido(1, "2026-09", "Siniestrado", "0.10"),
    pedido(2, "2026-09", "Siniestrado", "0.20"), pedido(3, "2026-09", "Siniestrado", ""),
    pedido(4, "2026-09", "Siniestrado", "0")];
  assert.deepEqual(resumenSiniestrados(pedidos), { casos: 4, valorTotal: 0.3, sinValor: 1 });
  assert.deepEqual(resumenSiniestrados([]), { casos: 0, valorTotal: 0, sinValor: 0 });
});

type Nodo = { name: string; parameters: {
  query?: string;
  jsCode?: string;
  columns?: { value: Record<string, string> };
  options?: { queryReplacement?: string };
} };
const flujos = [
  ["01-ingesta-diaria.json", "Casos fallidos del día", "A columnas de la base", "Guardar en Mensual"],
  ["02-refresco-estados.json", "Estados actuales · Mensual", "A columnas · Mensual", "Actualizar Mensual"],
  ["04-refresco-historico.json", "Estados actuales", "A columnas", "Guardar"],
];
for (const [archivo, consulta, transformar, guardar] of flujos) {
  test(`${archivo}: el importe llega a Postgres sin tocar soporte`, () => {
    const flujo = JSON.parse(readFileSync(new URL(`../../n8n/${archivo}`, import.meta.url), "utf8"));
    const nodo = (nombre: string): Nodo => {
      const encontrado = flujo.nodes.find((n: Nodo) => n.name === nombre);
      assert.ok(encontrado);
      return encontrado;
    };
    assert.match(nodo(consulta).parameters.query!, /CAST\(V\.ValorDeclaradoCompleto AS DECIMAL\(18, 2\)\) AS ValorProducto/);
    const convertir = new Function("$input", nodo(transformar).parameters.jsCode!);
    for (const [valor, esperado] of [["12.35", 12.35], [0, 0], [null, null], ["", null], ["no informado", null]]) {
      const salida = convertir({ all: () => [{ json: { Id: 123, ValorProducto: valor } }] });
      assert.equal(salida[0].json.valor_producto, esperado);
    }
    const columnas = nodo(guardar).parameters.columns!.value;
    assert.equal(columnas.valor_producto, "={{ $json.valor_producto }}");
    for (const campo of ["reclamo_tienda", "ubicacion", "telefono", "aviso", "avisado_en", "foto", "editado_por", "editado_en", "cobrado", "valor_70"]) {
      assert.ok(!(campo in columnas), `No debe actualizar ${campo}`);
    }
    if (archivo.startsWith("04")) {
      assert.ok(!("fecha_creacion" in columnas));
      assert.match(nodo("Ids del período").parameters.query!, /coalesce\(m.fecha_creacion, m.fecha_programado\)/);
      assert.match(nodo("Ids del período").parameters.options!.queryReplacement!, /desde/);
      assert.match(nodo("Ids del período").parameters.options!.queryReplacement!, /hasta/);
    }
  });
}

test("la migración y la instalación nueva usan la misma rotación y conservan el importe", () => {
  const inicial = readFileSync(new URL("../supabase/historico.sql", import.meta.url), "utf8");
  const migracion = readFileSync(new URL("../supabase/migracion-03-cobros-siniestrados.sql", import.meta.url), "utf8");
  const patron = /create or replace function public\.mover_a_historico\(fecha_corte date\)[\s\S]*?\n\$\$;/;
  const funcion = inicial.match(patron)?.[0];
  assert.ok(funcion);
  assert.equal(migracion.match(patron)?.[0], funcion);
  assert.match(funcion, /visitas,\s+valor_producto,\s+cobrado,\s+reclamo_tienda/g);
  assert.match(funcion, /valor_producto = excluded.valor_producto/);
  assert.match(funcion, /cobrado = excluded.cobrado/);
  assert.match(funcion, /for update\s+on conflict/);
  assert.doesNotMatch(funcion, /valor_70/);
  assert.match(migracion, /generated always as \(round\(valor_producto \* 0.70, 2\)\) stored/);
  assert.match(migracion, /cobrado boolean not null default false/);
  assert.doesNotMatch(migracion, /create table/i);
  assert.match(migracion, /begin;/);
  assert.match(migracion, /commit;/);
  assert.doesNotMatch(migracion, /select \*\s+from public\.mover_a_historico/);
});
