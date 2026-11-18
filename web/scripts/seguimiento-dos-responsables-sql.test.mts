/** PostgreSQL aislado en memoria. No utiliza Supabase ni credenciales reales. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

assert.ok(process.env.PGLITE_MODULE, "Indicá PGLITE_MODULE con una instalación temporal de @electric-sql/pglite");
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint);
    create table mensual (id bigint,repartidor text,tienda text);
    create table mensual_historico (like mensual);
    alter default privileges in schema public grant execute on functions to anon,authenticated;`);
  await db.exec(await readFile(new URL("../supabase/seguimiento.sql", import.meta.url), "utf8"));
  const id = randomUUID();
  await db.query(`insert into seguimiento(id,caso_id,comentario_original,creado_por,tomado_por,tomado_en,abierto_en)
    values($1,'12345678','Motivo original','creador@example.test','a@example.test','2026-11-01T13:00:00Z','2026-11-01T12:00:00Z')`, [id]);
  const sql = await readFile(new URL("../supabase/migracion-55-seguimiento-dos-responsables.sql", import.meta.url), "utf8");
  await db.exec(sql); await db.exec(sql);
  const fila = async () => (await db.query("select * from seguimiento where id=$1", [id])).rows[0];
  const tomar = async (actor: string, toma = true, objetivo: string | null = null, admin = false) =>
    (await db.query("select seguimiento_tomar_doble($1,$2,$3,$4,$5) as r", [id,actor,toma,objetivo,admin])).rows[0].r;
  const base = await fila();
  assert.equal(base.tomado_por, "a@example.test");
  assert.equal((await db.query("select count(*)::int as c from seguimiento_comentarios")).rows[0].c, 1, "migración idempotente");
  assert.equal((await tomar("b@example.test")).ok, true);
  const dos = await fila();
  assert.equal(dos.tomado_por, base.tomado_por);
  assert.deepEqual(dos.tomado_en, base.tomado_en);
  assert.equal(dos.tomado_por_2, "b@example.test");
  assert.equal((await tomar("c@example.test")).ok, false, "el tercero no desplaza a nadie");
  assert.equal((await tomar("c@example.test", false, "a@example.test")).ok, false, "no puede quitar a otra persona");
  assert.equal((await tomar("b@example.test")).ok, true, "doble clic idempotente");
  assert.equal((await fila()).revision, dos.revision);
  assert.equal((await tomar("a@example.test", false)).ok, true);
  assert.equal((await fila()).tomado_por, "b@example.test");
  assert.deepEqual((await fila()).tomado_en, dos.tomado_en_2, "la persona restante conserva su fecha");
  assert.equal((await tomar("a@example.test")).ok, true);
  assert.equal((await tomar("admin@example.test", false, "b@example.test", true)).ok, true);
  assert.equal((await fila()).tomado_por, "a@example.test");
  assert.deepEqual((await fila()).abierto_en, base.abierto_en, "las tomas y salidas no reinician la antigüedad");
  await assert.rejects(db.query("update seguimiento set tomado_por_2=tomado_por,tomado_en_2=now() where id=$1", [id]));
  await assert.rejects(db.query("update seguimiento set tomado_por_2='b@example.test',tomado_en_2=null where id=$1", [id]));
  const solicitud = randomUUID();
  const comentar = async (actor: string, texto: string, req = randomUUID()) =>
    (await db.query("select seguimiento_agregar_comentario($1,$2,$3,$4) as r", [id,actor,texto,req])).rows[0].r;
  assert.equal((await comentar("a@example.test", "Primera novedad", solicitud)).ok, true);
  assert.equal((await comentar("a@example.test", "Primera novedad", solicitud)).repetida, true);
  assert.equal((await comentar("a@example.test", "Texto distinto", solicitud)).ok, false);
  assert.equal((await comentar("b@example.test", "Segunda novedad")).ok, true);
  assert.equal((await fila()).comentario_original, "Motivo original");
  assert.equal((await fila()).ultimo_comentario, "Segunda novedad");
  assert.equal((await fila()).ultimo_comentario_por, "b@example.test");
  assert.equal((await fila()).comentario_actualizado_en, null, "no simula una corrección del motivo");
  const comentarios = (await db.query("select * from seguimiento_comentarios order by orden")).rows;
  assert.equal(comentarios.length, 3);
  assert.deepEqual(comentarios.map((c: { autor: string }) => c.autor), ["creador@example.test","a@example.test","b@example.test"]);
  await db.query("update seguimiento set comentario_original='Motivo corregido',comentario_actualizado_por='editor@example.test',comentario_actualizado_en=now() where id=$1", [id]);
  const correccion = (await db.query("select * from seguimiento_comentarios order by orden desc limit 1")).rows[0];
  assert.equal(correccion.anterior, "Motivo original");
  assert.equal(correccion.texto, "Motivo corregido");
  assert.equal(correccion.autor, "editor@example.test");
  const revision = (await fila()).revision;
  const primera = await db.query("update seguimiento set seller='Primero' where id=$1 and revision=$2 returning id", [id, revision]);
  const vieja = await db.query("update seguimiento set seller='Obsoleto' where id=$1 and revision=$2 returning id", [id, revision]);
  assert.equal(primera.rows.length, 1); assert.equal(vieja.rows.length, 0);
  await db.query("update seguimiento set estado='cerrado',atendido_por='b@example.test',atendido_en=now() where id=$1", [id]);
  assert.equal((await tomar("c@example.test")).ok, false);
  assert.equal((await comentar("a@example.test", "Cerrado")).ok, false);
  assert.equal((await fila()).tomado_por, "a@example.test", "cerrar no borra responsables");
  await db.query("update seguimiento set estado='abierto',abierto_en=now(),atendido_por=null,atendido_en=null where id=$1", [id]);
  assert.equal((await fila()).tomado_por, "a@example.test", "reabrir tampoco pierde la toma");
  await db.exec(`create function fallar_cache() returns trigger language plpgsql as $$ begin
    if new.ultimo_comentario='FALLAR' then raise exception 'Prueba de atomicidad'; end if; return new; end $$;
    create trigger fallo_cache before update on seguimiento for each row execute function fallar_cache();`);
  const cantidad = (await db.query("select count(*)::int as c from seguimiento_comentarios")).rows[0].c;
  await assert.rejects(comentar("a@example.test", "FALLAR"));
  assert.equal((await db.query("select count(*)::int as c from seguimiento_comentarios")).rows[0].c, cantidad, "comentario y caché son atómicos");
  assert.equal((await comentar("a@example.test", " ")).ok, false);
  assert.equal((await comentar("a@example.test", "x".repeat(4001))).ok, false);
  for (const rol of ["anon", "authenticated"]) for (const fn of ["seguimiento_tomar_doble(uuid,text,boolean,text,boolean)", "seguimiento_agregar_comentario(uuid,text,text,uuid)"]) {
    assert.equal((await db.query("select has_function_privilege($1,$2,'execute') as p", [rol,fn])).rows[0].p, false);
  }
  assert.equal((await db.query("select has_table_privilege('service_role','seguimiento_comentarios','update') as p")).rows[0].p, false);
  // Reproduce el rol real de PostgREST, no solo el propietario de las tablas.
  await db.exec("grant select,update on public.seguimiento to service_role; set role service_role");
  assert.equal((await tomar("c@example.test")).ok, true);
  assert.equal((await comentar("a@example.test", "Comentario desde service_role")).ok, true);
  await db.exec("reset role");
  console.log("✓ PostgreSQL: dos lugares, permisos, tomas conservadas, comentarios, idempotencia, CAS y atomicidad");
} finally { await db.close(); }
