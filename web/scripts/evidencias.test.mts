import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { diaEvidencias, enVentanaEvidencias, extensionDeMime } from "../src/lib/evidencias-reglas";

assert.equal(enVentanaEvidencias(new Date("2026-10-14T20:59:00Z")), false);
assert.equal(enVentanaEvidencias(new Date("2026-10-14T21:00:00Z")), true);
assert.equal(enVentanaEvidencias(new Date("2026-10-15T05:00:00Z")), true);
assert.equal(enVentanaEvidencias(new Date("2026-10-15T05:01:00Z")), false);
assert.equal(diaEvidencias(new Date("2026-10-15T04:59:00Z")), "2026-10-14");
assert.equal(diaEvidencias(new Date("2026-10-15T06:00:00Z")), "2026-10-15");
assert.equal(extensionDeMime("image/jpeg"), "jpg");
assert.equal(extensionDeMime("image/svg+xml"), null);

const flujo = await readFile(new URL("../../n8n/19-revision-evidencias-entrega.json", import.meta.url), "utf8");
const migracion = await readFile(new URL("../supabase/migracion-38-evidencias-entrega.sql", import.meta.url), "utf8");
const migracionValorProbatorio = await readFile(new URL("../supabase/migracion-41-evidencias-valor-probatorio.sql", import.meta.url), "utf8");
const modelo = await readFile(new URL("../src/lib/evidencias.ts", import.meta.url), "utf8");
const proxy = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");

for (const fragmento of ["U.IdLocalidad = 9", "U.IdModalidad IN (5, 7)", "DriverEvento", "H.Foto", "H.Fecha >= @InicioUtc", "H.Fecha < @FinUtc", "Claves ya vistas hoy"]) {
  assert.ok(flujo.includes(fragmento), `falta la relación verificada: ${fragmento}`);
}
assert.ok(!flujo.includes("dbo.FotoViaje") && !flujo.includes("V.Foto"), "solo se analizan fotos cargadas hoy en HistorialViaje");
assert.ok(flujo.includes("H.IdEstado <> 14") && !flujo.includes("= 'Entregado'"), "solo Cancelado queda excluido");
assert.ok(flujo.includes("INTO #ViajesHoy") && flujo.includes("CREATE UNIQUE CLUSTERED INDEX IX_ViajesHoy") && flujo.includes("INNER LOOP JOIN dbo.HistorialViaje"), "la consulta diaria debe acotar viajes antes de leer el historial");
assert.ok(flujo.includes("INDEX(IX_HistorialViaje_IdViaje)") && flujo.includes("V.FechaProgramado >= @HoyMx"), "la consulta debe conservar el índice y rango que evitan el timeout");
assert.ok(flujo.includes("R.Id = X.IdReserva") && flujo.includes("R.IdMotoboy"), "el driver debe salir de la reserva del evento histórico");
assert.ok(!flujo.includes("V.IdReserva"), "no debe usar la asignación actual del viaje");
assert.ok(flujo.includes("const lote = new Set()") && flujo.includes("lote.has(claveOrigen)"), "el lote deduplica la URL fuera de SQL");
assert.ok(
  flujo.includes('"timezone": "America/Argentina/Buenos_Aires"') &&
    flujo.includes("0 */10 18-23 * * *") &&
    flujo.includes("0 */10 0-1 * * *") &&
    flujo.includes("0 0 2 * * *"),
  "el cron argentino debe equivaler a cada 10 minutos de 15:00 a 22:50 y una última vez a las 23:00 de México",
);
assert.ok(flujo.includes('"genericAuthType": "httpHeaderAuth"') && !flujo.includes("$env.EVIDENCIAS_"), "n8n debe usar una credencial cifrada y no variables bloqueadas");
assert.ok(migracion.includes("interval '7 days'") && migracion.includes("interval '30 days'"));
assert.ok(migracion.includes("decision_humana = 'CONFIRMADA'") && migracion.includes("minimo_muestra_score"));
const historial = migracion.slice(migracion.indexOf("create table if not exists public.evidencias_entrega_historial"), migracion.indexOf("create index if not exists evidencias_historial_score_idx")).replace(/--.*$/gm, "");
assert.ok(!/foto_ruta|foto_mime|foto_bytes|url/i.test(historial), "el historial durable no conserva fotos o URLs");
assert.ok(modelo.includes('detalle: "low"') && modelo.includes('detalle: "high"') && modelo.includes("max_output_tokens: 180"));
assert.ok(modelo.includes("No evalúes fraude") && modelo.includes("calidad_evidencia"));
assert.ok(modelo.includes('if (primera.calidad === "ACEPTABLE") return primera'), "solo las dudas deben pagar una segunda evaluación");
assert.ok(modelo.includes("sumarTokens(primera.tokensEntrada") && modelo.includes('calidad === "ACEPTABLE"') && modelo.includes('? "NINGUNO"'), "debe sumar consumo y normalizar resultados aceptables");
assert.ok(modelo.includes("pendientesHoy") && modelo.includes("pendientesAnteriores"), "la bandeja separa hoy de los pendientes retenidos");
for (const criterio of ["captura de Mercado Libre", "texto puede ser ilegible", "Un domicilio visible es suficiente", "No exijas contexto", "paquete o etiqueta reconocible"]) {
  assert.ok(modelo.includes(criterio), `falta el criterio de calibración: ${criterio}`);
}
assert.ok(modelo.includes("Si se distinguen una persona con un paquete o un domicilio, necesariamente es ACEPTABLE"), "la segunda pasada debe evitar el falso positivo observado");
const analizador = modelo.slice(modelo.indexOf("async function analizarFoto"), modelo.indexOf("function extraerTexto"));
assert.ok(!analizador.includes("SOLO_PAQUETE") && !analizador.includes("SIN_CONTEXTO_DE_ENTREGA"), "el modelo nuevo no debe rechazar fotos solo por falta de contexto de entrega");
assert.ok(migracionValorProbatorio.includes("SOLO_PAQUETE") && migracionValorProbatorio.includes("SIN_CONTEXTO_DE_ENTREGA"));
assert.ok(proxy.includes('ruta.startsWith("/api/evidencias/")'), "el webhook debe omitir la sesión y validar su propio Bearer");

console.log("✓ ventana México, retención, atribución histórica y límites del modelo");
