import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { fechaCalendario, fechaHoraMexico, resumirDirectorio } from "../src/lib/directorio";
import { FAMILIAS_NAVEGACION, SECCIONES_PRINCIPALES } from "../src/lib/navegacion";
import { armarPuntosDirectorio, coordenadaDirectorio, enlaceMapaDirectorio, filtrarPuntosDirectorio, puntoDirectorioValido } from "../src/lib/directorio-mapa";
import type { DriverDirectorio, SellerDirectorio } from "../src/lib/directorio";

test("el mapa no convierte ausencias en 0 y conserva manual, sistema y sucursales", () => {
  for (const valor of [null, undefined, "", " ", "inválido"]) assert.equal(coordenadaDirectorio(valor), null);
  assert.equal(coordenadaDirectorio("19.4"), 19.4);
  assert.equal(puntoDirectorioValido(0, 0), false);
  assert.equal(puntoDirectorioValido(91, -99), false);
  const seller = { id: 1, nombre: "Café Centro", ubicacionManual: "Manual 123", direccion: "Sistema 456", latitudManual: 19.4, longitudManual: -99.1 } as SellerDirectorio;
  const driver = { id: 2, nombre: "Driver Sur", ubicacionManual: "Casa", latitudManual: null, longitudManual: null } as DriverDirectorio;
  const puntos = armarPuntosDirectorio([seller], [driver], [
    { id: 1, tipo: "seller", clave: "a", nombre: "Sucursal A", lat: 19.5, lon: -99.2 },
    { id: 1, tipo: "seller", clave: "b", nombre: "Sucursal B", lat: 19.6, lon: -99.3 },
    { id: 2, tipo: "driver", clave: "2", nombre: "Casa sistema", lat: 19.3, lon: -99.4 },
    { id: 3, tipo: "driver", clave: "3", nombre: "Inactivo", lat: 19.3, lon: -99.4 },
  ]);
  assert.equal(puntos.length, 4);
  assert.equal(new Set(puntos.map((p) => p.clave)).size, 4);
  assert.equal(filtrarPuntosDirectorio(puntos, "cafe", "seller", "sistema").length, 2);
  assert.equal(filtrarPuntosDirectorio(puntos, "2", "driver", "sistema").length, 1);
  assert.equal(armarPuntosDirectorio([seller], [], [{ id: 2, tipo: "driver", clave: "2", nombre: "Privado", lat: 19.3, lon: -99.4 }]).some((p) => p.tipo === "driver"), false);
  assert.equal(enlaceMapaDirectorio("seller", 1), "/sellers/mapa?tipo=seller&id=1&origen=manual");
});

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("el mapa comercial nunca consulta domicilios de drivers ni envía contactos", async () => {
  const originalFetch = globalThis.fetch;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = "https://directorio.example.test";
  process.env.SUPABASE_SERVICE_KEY = "clave-ficticia";
  const llamadas: string[] = [];
  globalThis.fetch = async (input) => {
    const tabla = new URL(String(input)).pathname.split("/").at(-1)!;
    llamadas.push(tabla);
    const filas: Record<string, unknown[]> = {
      sellers_activos: [{ id_usuario: 1, nombre: "Seller", direccion: "Sistema", email: "privado@example.test", celular: "5555555555", latitud_manual: 19.4, longitud_manual: -99.1 }],
      drivers_activos: [{ id_motoboy: 2, nombre: "Driver", latitud_manual: 19.5, longitud_manual: -99.2 }],
      tracker_tiendas: [{ id_tienda: 1, nombre_mapa: "Punto", nombre: "Sistema", latitud: 19.41, longitud: -99.11 }],
      tracker_choferes: [{ id_motoboy: 2, nombre: "Casa", latitud: 19.51, longitud: -99.21 }],
    };
    return new Response(JSON.stringify(filas[tabla] ?? []), { status: 200 });
  };
  try {
    const { leerMapaDirectorio } = await import("../src/lib/directorio-mapa-datos");
    const comercial = await leerMapaDirectorio(false);
    assert.ok(comercial.puntos.length > 0);
    assert.ok(comercial.puntos.every((p) => p.tipo === "seller"));
    assert.ok(!llamadas.includes("drivers_activos") && !llamadas.includes("tracker_choferes"));
    assert.doesNotMatch(JSON.stringify(comercial), /privado@example|5555555555/);
    const soporte = await leerMapaDirectorio(true);
    assert.ok(soporte.puntos.some((p) => p.tipo === "driver" && p.origen === "manual"));
    assert.ok(soporte.puntos.some((p) => p.tipo === "driver" && p.origen === "sistema"));
  } finally {
    globalThis.fetch = originalFetch;
    if (url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = url;
    if (key === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = key;
  }
});

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

test("las dos rutas están en la navegación y leen mediante una capa server-only", () => {
  const shell = fuente("../src/components/Shell.tsx");
  const navegacion = fuente("../src/components/NavegacionHorizontal.tsx");
  const rutas = FAMILIAS_NAVEGACION.flatMap((familia) => familia.entradas.map((entrada) => entrada.href));
  assert.ok(rutas.includes("/sellers"));
  assert.ok(rutas.includes("/drivers"));
  assert.ok(SECCIONES_PRINCIPALES.some((seccion) => seccion.href === "/sellers"));
  assert.match(shell, /SECCIONES_PRINCIPALES/);
  assert.match(navegacion, /familiaDeRuta/);

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
