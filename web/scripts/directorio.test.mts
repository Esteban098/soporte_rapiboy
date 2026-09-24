import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { fechaCalendario, fechaHoraMexico, resumirDirectorio } from "../src/lib/directorio";

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("resume vínculos automáticos, manuales y pendientes", () => {
  assert.deepEqual(
    resumirDirectorio([
      { grupoWhatsapp: "Grupo A", asignacion: "AUTOMATICO" },
      { grupoWhatsapp: "Grupo B", asignacion: "MANUAL" },
      { grupoWhatsapp: null, asignacion: null },
    ]),
    { total: 3, vinculados: 2, manuales: 1, pendientes: 1 },
  );
});

test("las fechas de calendario no cambian de día y las horas usan México", () => {
  assert.equal(fechaCalendario("2026-09-22"), "22/09/2026");
  assert.equal(fechaCalendario(""), "");

  const fecha = fechaHoraMexico("2026-09-22T15:00:00.000Z").toLowerCase();
  assert.match(fecha, /22/);
  assert.match(fecha, /sep/);
  assert.match(fecha, /12:00/);
  assert.match(fecha, /hs arg/);
});

test("las dos rutas están en el sidebar y leen mediante una capa server-only", () => {
  const shell = fuente("../src/components/Shell.tsx");
  assert.match(shell, /href: "\/sellers"/);
  assert.match(shell, /href: "\/drivers"/);

  const datos = fuente("../src/lib/directorio-datos.ts");
  assert.match(datos, /^import "server-only";/);

  // El JID es para los futuros flujos WAHA. La interfaz pública de las páginas
  // recibe el nombre del grupo, no el identificador técnico del chat.
  const tipos = fuente("../src/lib/directorio.ts");
  assert.doesNotMatch(tipos, /grupoJid/);
});

test("las pantallas explican cómo instalar el directorio si falta la migración", () => {
  for (const ruta of [
    "../src/app/(tablero)/sellers/page.tsx",
    "../src/app/(tablero)/drivers/page.tsx",
  ]) {
    const pagina = fuente(ruta);
    assert.match(pagina, /migracion-(17-directorio-activos-whatsapp|18-sellers-activos-consolidados)\.sql/);
    assert.match(pagina, /13-directorio-activos-whatsapp\.json/);
  }
});
