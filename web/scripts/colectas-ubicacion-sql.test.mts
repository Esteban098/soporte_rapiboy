/** PostgreSQL aislado: PGLITE_MODULE apunta a una instalación temporal de
 * @electric-sql/pglite. No usa conexión ni credenciales de Supabase. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

assert.ok(process.env.PGLITE_MODULE, "Indicá PGLITE_MODULE (módulo temporal @electric-sql/pglite)");
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec("alter default privileges in schema public grant execute on functions to anon, authenticated");
  for (const file of ["migracion-15-colectas-vivo.sql", "migracion-16-colectas-vivo-recorrido.sql",
    "migracion-50-colectas-ultima-ubicacion.sql", "migracion-50-colectas-ultima-ubicacion.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8"));
  }
  const anterior = { lat: 19.4, lon: -99.1, fecha: "2026-09-21T18:00:00.000Z" };
  let id = 0;
  async function guardar({ lat = 19.5, lon = -99.2, fecha = "2026-09-21T19:00:00Z",
    latAnterior = anterior.lat, fechaAnterior = anterior.fecha }: {
    lat?: number | string | null; lon?: number | string | null; fecha?: string | null;
    latAnterior?: number; fechaAnterior?: string | null;
  } = {}) {
    const driver = ++id;
    await db.query(`insert into public.colectas_vivo_drivers
      (id_motoboy,fecha_operacion,nombre,latitud,longitud,posicion_en,sincronizado_en)
      values ($1,'2026-09-21','Anterior',$2,$3,$4,'2026-09-21T18:00:00Z')`,
    [driver, latAnterior, anterior.lon, fechaAnterior]);
    await db.query(`insert into public.colectas_vivo_drivers
      (id_motoboy,fecha_operacion,nombre,latitud,longitud,posicion_en,sincronizado_en)
      values ($1,'2026-09-22','Actualizado',$2,$3,$4,'2026-09-22T19:00:00Z')
      on conflict (id_motoboy) do update set fecha_operacion=excluded.fecha_operacion,
        nombre=excluded.nombre,latitud=excluded.latitud,longitud=excluded.longitud,
        posicion_en=excluded.posicion_en,sincronizado_en=excluded.sincronizado_en`,
    [driver, lat, lon, fecha]);
    const fila = (await db.query(`select latitud,longitud,
      to_char(posicion_en at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as posicion,
      to_char(fecha_operacion,'YYYY-MM-DD') as dia,nombre,
      to_char(sincronizado_en at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as sincronizado
      from public.colectas_vivo_drivers where id_motoboy=$1`, [driver])).rows[0];
    assert.equal(fila.dia, "2026-09-22", "la jornada sí cambia");
    assert.equal(fila.nombre, "Actualizado", "se actualizan los demás datos");
    assert.equal(fila.sincronizado, "2026-09-22T19:00:00.000Z", "sincronizar no rejuvenece el GPS");
    return fila;
  }
  for (const datos of [
    { fecha: "2026-09-21T17:59:59Z" }, { fecha: null },
    { lat: null }, { lon: null }, { lat: 0, lon: 0 },
    { lat: 91 }, { lon: -181 }, { lat: "NaN" }, { lon: "Infinity" },
  ]) {
    const fila = await guardar(datos);
    assert.equal(fila.latitud, anterior.lat);
    assert.equal(fila.longitud, anterior.lon);
    assert.equal(fila.posicion, anterior.fecha);
  }
  const nuevo = await guardar();
  assert.equal(nuevo.latitud, 19.5);
  assert.equal(nuevo.longitud, -99.2);
  assert.equal(nuevo.posicion, "2026-09-21T19:00:00.000Z");
  for (const datos of [{ latAnterior: 91 }, { fechaAnterior: null }]) {
    const reparado = await guardar({ ...datos, fecha: "2026-09-21T17:00:00Z" });
    assert.equal(reparado.latitud, 19.5, "un punto previo inválido no bloquea el GPS válido");
    assert.equal(reparado.posicion, "2026-09-21T17:00:00.000Z");
  }
  assert.equal((await db.query("select count(*)::int as total from public.colectas_vivo_posiciones")).rows[0].total, 0,
    "el trigger no inventa reportes para el recorrido");
  for (const rol of ["anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,'public.colectas_conservar_ultima_ubicacion()','execute') as permiso", [rol])).rows[0].permiso, false);
  }
  console.log("✓ PostgreSQL: migración idempotente, upsert sin regresiones, cambio de jornada y permisos");
} finally { await db.close(); }
