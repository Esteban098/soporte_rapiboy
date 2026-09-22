import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { ETIQUETA_ROL, RUTAS_COMERCIAL, aRol, inicioDe, puedeVerRuta } from "../src/lib/permisos";

/**
 * Pruebas del rol comercial.
 *
 * La regla es pura y se prueba directo. Lo que no se puede ejercitar sin
 * next-auth —el proxy, la sesión, las acciones— se comprueba sobre la fuente:
 * son las líneas que, si alguien las saca, abren el tablero entero a un
 * comercial sin que ninguna pantalla lo note.
 */

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("un comercial ve Tiendas y Colectas, y nada más", () => {
  for (const ruta of ["/tiendas", "/colectas", "/colectas/historial", "/tiendas/", "/colectas/historial/"]) {
    assert.ok(puedeVerRuta("comercial", ruta), ruta);
  }
  for (const ruta of [
    "/",
    "/operacion",
    "/seguimiento",
    "/perfiles",
    "/live-tracker",
    "/sellers",
    "/drivers",
    "/cobertura",
    "/colectas/otra",
    "/tiendasx",
    "/api/live-tracker/datos",
  ]) {
    assert.equal(puedeVerRuta("comercial", ruta), false, ruta);
  }
  assert.deepEqual([...RUTAS_COMERCIAL], ["/tiendas", "/colectas", "/colectas/historial"]);
});

test("admin, operador y quien entra por Google siguen viendo todo", () => {
  for (const rol of ["admin", "operador", undefined, null] as const) {
    assert.ok(puedeVerRuta(rol, "/seguimiento"));
    assert.ok(puedeVerRuta(rol, "/api/live-tracker/datos"));
    assert.equal(inicioDe(rol), "/");
  }
  assert.equal(inicioDe("comercial"), "/tiendas");
});

test("un rol desconocido baja a operador, nunca sube a admin", () => {
  assert.equal(aRol("comercial"), "comercial");
  assert.equal(aRol("admin"), "admin");
  assert.equal(aRol("superusuario"), "operador");
  assert.equal(aRol(null), "operador");
  assert.equal(ETIQUETA_ROL.comercial, "Comercial");
});

test("el proxy aplica la regla y la sesión deja afuera al comercial por defecto", () => {
  const proxy = fuente("../src/proxy.ts");
  assert.match(proxy, /puedeVerRuta\(/);
  assert.match(proxy, /inicioDe\(/);

  /*
   * `operadorActual` y `usuarioActual` son lo que chequean todas las acciones
   * y los endpoints. Que devuelvan `null` para un comercial es lo que cierra
   * casos, seguimiento, cobros, notificaciones y el tracker de una vez; se
   * habilita a mano solo donde corresponde.
   */
  const sesion = fuente("../src/lib/sesion.ts");
  assert.match(sesion, /esComercial\(/);

  assert.match(fuente("../src/app/responsables.ts"), /sesionActual\(/);
  const actualizar = fuente("../src/app/actualizar.ts");
  assert.match(actualizar, /sesionActual\(/);
  assert.match(actualizar, /"colectas"/);
});

test("perfiles.sql trae el rol comercial en una base nueva y en una existente", () => {
  const sql = fuente("../supabase/perfiles.sql").replace(/--[^\n]*/g, "");

  // Base nueva: el tipo nace con los tres roles.
  assert.match(sql, /create type public\.rol_perfil as enum \('admin', 'operador', 'comercial'\)/);

  // Base existente: el `create type` choca con el tipo que ya está y no hace
  // nada, así que sin esta línea el rol nunca llegaría.
  assert.match(sql, /alter type public\.rol_perfil add value if not exists 'comercial'/);

  // Y ya no hay una migración aparte que pueda quedar sin correr.
  assert.throws(() => fuente("../supabase/migracion-14-rol-comercial.sql"));
});
