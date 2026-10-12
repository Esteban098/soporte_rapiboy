import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../", import.meta.url);
const workflow = JSON.parse(
  readFileSync(new URL("n8n/16-resumen-semanal-tiendas.json", raiz), "utf8"),
);
const migracion = readFileSync(
  new URL("web/supabase/migracion-37-resumen-semanal-tiendas.sql", raiz),
  "utf8",
);

test("el flujo resume la semana anterior en horario de México", () => {
  assert.equal(workflow.settings.timezone, "America/Mexico_City");
  const trigger = workflow.nodes.find((n: { name: string }) => n.name === "17:00 cada lunes");
  assert.equal(trigger.parameters.rule.interval[0].expression, "0 0 17 * * 1");
  assert.match(
    workflow.nodes.find((n: { name: string }) => n.name === "Preparar resúmenes").parameters.query,
    /preparar_resumenes_tiendas_semanales/,
  );
});

test("la selección exige entrega e información anterior", () => {
  assert.match(migracion, /lower\(btrim\(coalesce\(c\.estado, ''\)\)\) = 'entregado'/);
  assert.match(migracion, /c\.fecha_programado between inicio and fin/);
  assert.match(migracion, /c\.editado_en is not null/);
  assert.match(migracion, /c\.editado_en at time zone 'America\/Mexico_City'/);
});

test("agrupa por seller, evita reenvíos y excluye comerciales de la alerta", () => {
  assert.match(migracion, /group by e\.id_usuario/);
  assert.match(migracion, /unique \(semana_desde, id_usuario\)/);
  assert.match(migracion, /estado in \('ENVIANDO', 'ENVIADO'\)/);
  assert.match(migracion, /set estado = 'ENVIANDO'/);
  assert.match(migracion, /p\.rol <> 'comercial'/);
  assert.match(migracion, /'tienda_sin_grupo'/);
});

test("los flujos que alimentan casos guardan Usuario.Id", () => {
  for (const archivo of [
    "n8n/01-ingesta-diaria.json",
    "n8n/02-refresco-estados.json",
    "n8n/04-refresco-historico.json",
  ]) {
    const contenido = readFileSync(new URL(archivo, raiz), "utf8");
    assert.match(contenido, /U\.Id AS IdUsuario/);
    assert.match(contenido, /"id_usuario": "=\{\{ \$json\.id_usuario \}\}"/);
  }
});
