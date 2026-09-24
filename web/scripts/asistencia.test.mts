import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { fechaOperacionAsistencia, respuestaAsistencia, telefonoAsistencia } from "../src/lib/asistencia";

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("normaliza solamente votos y teléfonos válidos", () => {
  assert.equal(respuestaAsistencia("Ruta y colecta"), "RUTA_Y_COLECTA");
  assert.equal(respuestaAsistencia("Ruta"), "RUTA");
  assert.equal(respuestaAsistencia("No asiste"), "NO_ASISTE");
  assert.equal(respuestaAsistencia("quizás"), null);
  assert.equal(telefonoAsistencia("+52 1 55 1234 5678"), "525512345678");
  assert.equal(telefonoAsistencia("123"), null);
  assert.equal(fechaOperacionAsistencia("2026-09-24"), "2026-09-24");
  assert.equal(fechaOperacionAsistencia("24/09/2026"), null);
});

test("la migración conserva la integridad por IdMotoboy y jornada", () => {
  const sql = fuente("../supabase/migracion-27-asistencia.sql");
  assert.match(sql, /references public\.drivers_activos\(id_motoboy\)/);
  assert.match(sql, /unique \(fecha_operacion, id_motoboy\)/);
  assert.match(sql, /respuesta in \('RUTA_Y_COLECTA', 'RUTA', 'NO_ASISTE'\)/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /id_colecta|id_usuario/i);
});

test("el flujo de encuesta usa la API de la plataforma y no Google Sheets", () => {
  const flujo = JSON.parse(fuente("../../n8n/14-asistencia-supabase.json")) as { active: boolean; nodes: { type: string; parameters?: { url?: string } }[] };
  assert.equal(flujo.active, false);
  assert.equal(flujo.nodes.some((n) => n.type.includes("googleSheets")), false);
  const http = flujo.nodes.find((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.match(http?.parameters?.url ?? "", /ASISTENCIA_PLATAFORMA_URL/);
});

test("el endpoint no expone la clave de Supabase y exige su secreto propio", () => {
  const ruta = fuente("../src/app/api/asistencia/votos/route.ts");
  assert.match(ruta, /ASISTENCIA_WEBHOOK_SECRET/);
  assert.match(ruta, /authorization/);
  assert.match(ruta, /TABLA_ASISTENCIA_CONTACTOS/);
  assert.doesNotMatch(ruta, /SUPABASE_SERVICE_KEY/);
});
