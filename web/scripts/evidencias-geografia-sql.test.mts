/** PostgreSQL aislado en memoria. PGLITE_MODULE debe apuntar al módulo PGlite
 * instalado en un directorio temporal; nunca utiliza credenciales de Supabase. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

assert.ok(process.env.PGLITE_MODULE, "Indicá PGLITE_MODULE (módulo temporal @electric-sql/pglite)");
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table public.mensual (id bigint primary key, ubicacion text, telefono text);
    create table public.mensual_historico (like public.mensual including all);
  `);
  // Supabase puede otorgar EXECUTE por defecto directamente a estos roles.
  await db.exec("alter default privileges in schema public grant execute on functions to anon, authenticated");
  for (const file of ["migracion-38-evidencias-entrega.sql", "migracion-41-evidencias-valor-probatorio.sql", "migracion-45-evidencias-reabrir.sql", "migracion-48-evidencias-geografia.sql", "migracion-48-evidencias-geografia.sql", "migracion-49-evidencias-visitas-domicilio.sql", "migracion-49-evidencias-visitas-domicilio.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8"));
  }
  let idViaje = 0;
  async function evaluar({ distancia = 100, estado = "Entregado", recibido = true,
    tabla, ubicacion, telefono, calidad = "ACEPTABLE", visitado = false, domicilio = "Calle de prueba 100" }: {
    distancia?: number | string | null; estado?: string | null; recibido?: boolean;
    tabla?: "mensual" | "mensual_historico"; ubicacion?: string; telefono?: string;
    calidad?: "ACEPTABLE" | "DUDOSA";
    visitado?: boolean; domicilio?: string;
  } = {}) {
    const viaje = ++idViaje;
    if (tabla) await db.query(`insert into public.${tabla} values ($1, $2, $3)`, [viaje, ubicacion ?? null, telefono ?? null]);
    const claim = await db.query("select public.evidencia_entrega_reclamar($1, $2, $2, null, null, now()) as id", [`test:${viaje}`, viaje]);
    const id = claim.rows[0].id;
    const params = [id, "test.jpg", "image/jpeg", 100, calidad,
      calidad === "DUDOSA" ? "BORROSA" : "NINGUNO", "prueba", 0.9, "test", 1, 1, recibido, estado, distancia, visitado, domicilio];
    const sql = `select public.evidencia_entrega_finalizar_visita(${params.map((_, i) => `$${i + 1}`).join(",")}) as resultado`;
    const result = (await db.query(sql, params)).rows[0].resultado;
    assert.equal(result.ok, true);
    const revision = (await db.query("select * from public.evidencias_entrega_revision where id=$1", [id])).rows[0];
    const historial = (await db.query("select * from public.evidencias_entrega_historial where revision_id=$1", [id])).rows[0];
    assert.equal(historial.estado_geografico, result.estado);
    assert.equal(revision.estado_geografico, result.estado);
    assert.equal(historial.distancia_entrega_m, revision.distancia_entrega_m);
    assert.equal((await db.query(sql, params)).rows[0].resultado.ok, false, "no finaliza dos veces");
    return { revision, historial };
  }
  for (const distance of [0, 299.9, 300]) {
    const { revision } = await evaluar({ distancia: distance });
    assert.equal(revision.estado_geografico, "DENTRO_DEL_RANGO");
    assert.equal(revision.estado_proceso, "ANALIZADA");
  }
  const far = await evaluar({ distancia: 300.0001 });
  assert.equal(far.revision.estado_geografico, "FUERA_DEL_RANGO");
  assert.equal(far.revision.estado_proceso, "PENDIENTE_REVISION");
  assert.equal(far.revision.calidad_modelo, "ACEPTABLE");
  assert.equal(far.historial.fue_dudosa, true);
  assert.equal(far.historial.decision_humana, null);
  for (const table of ["mensual", "mensual_historico"] as const) {
    for (const data of [{ ubicacion: "nueva dirección" }, { telefono: "123" }]) {
      const { revision } = await evaluar({ tabla: table, ...data, distancia: 2000 });
      assert.equal(revision.estado_geografico, "OMITIDA_DATOS_TIENDA");
      assert.equal(revision.distancia_entrega_m, null);
      assert.equal(revision.estado_proceso, "ANALIZADA");
    }
  }
  assert.equal((await evaluar({ tabla: "mensual", ubicacion: "  ", telefono: "  " })).revision.estado_geografico, "DENTRO_DEL_RANGO");
  for (const distancia of [null, -1, "NaN", "Infinity", "-Infinity"]) {
    const { revision } = await evaluar({ distancia });
    assert.equal(revision.estado_geografico, "SIN_COORDENADAS");
    assert.equal(revision.estado_proceso, "ANALIZADA");
  }
  assert.equal((await evaluar({ estado: "Pedido no entregado", distancia: 2000 })).revision.estado_geografico, "NO_ES_ENTREGA");
  const intento = await evaluar({ estado: "Pedido no entregado", visitado: true, distancia: 2000 });
  assert.equal(intento.revision.estado_geografico, "FUERA_DEL_RANGO");
  assert.equal(intento.revision.estado_proceso, "PENDIENTE_REVISION");
  assert.equal(intento.revision.estado_evento, "Pedido no entregado");
  assert.equal(intento.revision.visitado_evento, true);
  assert.equal(intento.revision.domicilio_destino, "Calle de prueba 100");
  assert.ok(!("domicilio_destino" in intento.historial));
  assert.equal((await evaluar({ estado: "Pedido no entregado", visitado: true, distancia: 20 })).revision.estado_geografico, "DENTRO_DEL_RANGO");
  assert.equal((await evaluar({ estado: "Pedido no entregado", visitado: true, distancia: null })).revision.estado_geografico, "SIN_COORDENADAS");
  assert.equal((await evaluar({ recibido: false, distancia: 2000 })).revision.estado_geografico, "NO_EVALUADA");
  assert.equal((await evaluar({ calidad: "DUDOSA", distancia: 20 })).revision.estado_proceso, "PENDIENTE_REVISION");
  assert.equal((await evaluar({ calidad: "DUDOSA", tabla: "mensual", telefono: "123" })).revision.estado_proceso, "PENDIENTE_REVISION", "omitir GPS no oculta un problema visual");
  await db.exec("update public.evidencias_entrega_config set radio_geografico_m=1000");
  assert.equal((await evaluar({ distancia: 900 })).revision.estado_geografico, "DENTRO_DEL_RANGO");
  assert.equal((await db.query("select radio_geografico_m from public.evidencias_entrega_revision where id=$1", [far.revision.id])).rows[0].radio_geografico_m, 300, "el rango anterior no cambia");
  await assert.rejects(db.exec("update public.evidencias_entrega_config set radio_geografico_m=0"));
  const idRollback = (await db.query("select public.evidencia_entrega_reclamar('rollback', 9999, 9999, null, null, now()) as id")).rows[0].id;
  await assert.rejects(db.query(`select public.evidencia_entrega_finalizar_visita($1, 'test.jpg', 'image/jpeg', -1,
    'ACEPTABLE', 'NINGUNO', 'prueba', 0.9, 'test', 1, 1, true, 'Entregado', 2000, true, 'Calle 100')`, [idRollback]));
  const rollback = (await db.query("select estado_proceso,estado_geografico from public.evidencias_entrega_revision where id=$1", [idRollback])).rows[0];
  assert.equal(rollback.estado_proceso, "PROCESANDO");
  assert.equal(rollback.estado_geografico, "NO_EVALUADA");
  assert.equal((await db.query("select count(*)::int as total from public.evidencias_entrega_historial where revision_id=$1", [idRollback])).rows[0].total, 0);
  assert.equal((await db.query(`select has_function_privilege('anon',
    'public.evidencia_entrega_finalizar_visita(uuid,text,text,integer,text,text,text,numeric,text,integer,integer,boolean,text,double precision,boolean,text)', 'execute') as permiso`)).rows[0].permiso, false);
  assert.equal((await db.query(`select has_function_privilege('authenticated',
    'public.evidencia_entrega_finalizar_visita(uuid,text,text,integer,text,text,text,numeric,text,integer,integer,boolean,text,double precision,boolean,text)', 'execute') as permiso`)).rows[0].permiso, false);
  console.log("✓ PostgreSQL: migración idempotente, omisiones, límites, GPS inválido, revisión y finalización atómica");
} finally { await db.close(); }
