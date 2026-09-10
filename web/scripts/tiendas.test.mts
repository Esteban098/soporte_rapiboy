import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  COLOR_TIPO,
  enlaceAGoogleMaps,
  filtrarLugares,
  ordenarLugares,
  type LugarFila,
} from "../src/lib/tiendas";
import { leerLugares } from "../src/lib/tiendas-datos";

/**
 * Pruebas del mapa de tiendas.
 *
 * Van aparte de las del live tracker a propósito: esta pantalla no comparte
 * datos con aquella, no tiene día ni jornada, y la única razón para juntarlas
 * sería que las dos dibujan puntos.
 *
 * Cubren tres cosas: el SQL que genera el importador desde el KMZ, las reglas
 * de orden y búsqueda, y la lectura contra una base simulada.
 */

const LUGARES = readFileSync(
  new URL("../supabase/migracion-06-lugares.sql", import.meta.url),
  "utf8",
);

/**
 * El SQL sin sus comentarios: las migraciones de este proyecto explican en
 * prosa lo que hacen y lo que no, así que buscar sobre el archivo entero
 * encuentra la advertencia y no el código.
 */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function conEntorno(t: { after: (f: () => void) => void }, vars: Record<string, string | undefined>) {
  const antes = new Map<string, string | undefined>();
  for (const [clave, valor] of Object.entries(vars)) {
    antes.set(clave, process.env[clave]);
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  t.after(() => {
    for (const [clave, valor] of antes) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  });
}

const BASE = { SUPABASE_URL: "https://base-de-prueba.invalid", SUPABASE_SERVICE_KEY: "clave-de-prueba" };

function baseSimulada(
  t: { mock: { method: typeof import("node:test").mock.method } },
  tablas: Record<string, unknown[]>,
) {
  const simulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const tabla = url.pathname.replace("/rest/v1/", "");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const filas = tablas[tabla];
    if (filas === undefined) return new Response(`{"code":"PGRST205"}`, { status: 404 });
    return Response.json(offset === 0 ? filas : []);
  });
  return { restore: () => simulado.mock.restore() };
}

function fila(over: Partial<LugarFila> = {}): LugarFila {
  return {
    nombre_mapa: "#24626 SATUS",
    id_tienda: 24626,
    nombre: "SATUS",
    tipo: "TIENDA",
    latitud: 19.345,
    longitud: -99.168,
    ...over,
  };
}

/* ---------------------------------------------------------------------------
 * El SQL que sale del KMZ
 * ------------------------------------------------------------------------- */

test("el SQL de lugares se puede volver a correr sin duplicar nada", () => {
  const sinComentar = sinComentarios(LUGARES);

  // Reemplazo completo y en una transacción: un punto borrado del mapa tiene
  // que desaparecer, y un fallo a mitad no puede dejar las tablas vacías.
  assert.match(sinComentar, /begin;/);
  assert.match(sinComentar, /delete from public\.tracker_tiendas;/);
  assert.match(sinComentar, /delete from public\.tracker_choferes;/);
  assert.match(sinComentar, /commit;/);
  assert.ok(
    sinComentar.indexOf("delete from public.tracker_tiendas") <
      sinComentar.indexOf("insert into public.tracker_tiendas"),
    "el borrado tiene que ir antes de la carga",
  );

  // Mismo criterio que el resto del tracker: nada de acceso directo por API.
  assert.match(sinComentar, /alter table public\.tracker_tiendas\s+enable row level security/);
  assert.match(sinComentar, /alter table public\.tracker_choferes enable row level security/);
});


test("el id de la tienda no es la clave, porque no es único", () => {
  /*
   * #55004 está dos veces en el mapa: «Marlovet» y «Marlovet 2», dos
   * sucursales del mismo vendedor. Con `id_tienda` como clave primaria, una de
   * las dos se perdería en silencio en cada importación.
   */
  const sinComentar = sinComentarios(LUGARES);
  assert.match(sinComentar, /nombre_mapa\s+text primary key/);
  assert.doesNotMatch(sinComentar, /id_tienda\s+integer primary key/);
  assert.doesNotMatch(sinComentar, /unique[^\n]*\(id_tienda\)/);

  const marlovet = [...LUGARES.matchAll(/\('#55004 [^']*', 55004,/g)];
  assert.equal(marlovet.length, 2, "se perdió una de las dos sucursales de #55004");
});


test("los puntos del mapa se leen enteros, con id, apóstrofos y tabulaciones", () => {
  // `#73517 Volk's Coruña` viene envuelto en CDATA por el apóstrofo. Sin
  // desenvolverlo, el envoltorio se llevaría puesto el id.
  assert.match(LUGARES, /\('#73517 Volk''s Coruña', 73517, 'Volk''s Coruña'/);

  // Dos nombres traen tabulación en vez de espacio, y uno viene sin `#`. Son
  // errores de tipeo de quien cargó el punto, no una convención distinta.
  assert.match(LUGARES, /\('#77134 FUXION MÉXICO', 77134,/);
  assert.match(LUGARES, /\(196984, 'Yazmin Vera Camacho'/);

  // Y los tres puntos sin id quedan con id nulo, no con uno inventado.
  assert.match(LUGARES, /\('SPG Benito Juarez', null,/);
  assert.match(LUGARES, /\('David', null,/);
});


test("el mapa distingue dropoff de tienda por el color del ícono", () => {
  /*
   * My Maps no guarda una categoría, así que la capa la codificó con el color.
   * La lectura se confirma contra el flujo de colectas, que ya trae la lista
   * de dropoff por nombre: si el color significara otra cosa, estos no
   * estarían todos del mismo lado.
   */
  for (const dropoff of ["Teresita", "Powerbatt", "Mi moto", "Mayor Bag", "Bache Critico"]) {
    const fila = new RegExp(`\\('#\\d+ [^']*${dropoff}[^']*', \\d+, '[^']*', 'DROPOFF'`, "i");
    assert.match(LUGARES, fila, `${dropoff} tendría que estar marcado como DROPOFF`);
  }

  /*
   * Y la bodega es la única de su tipo: es el origen de toda ruta propuesta.
   * Se cuentan filas de datos y no apariciones del texto, que también está en
   * el `check` del esquema.
   */
  const filasBodega = [...LUGARES.matchAll(/^ {2}\('[^']*', (?:\d+|null), '[^']*', 'BODEGA',/gm)];
  assert.equal(filasBodega.length, 1);
});


/* ---------------------------------------------------------------------------
 * Orden y búsqueda
 * ------------------------------------------------------------------------- */

test("la bodega va primera y las tiendas por nombre", () => {
  const lugares = ordenarLugares([
    fila({ nombre_mapa: "#77963 Salud Natural", id_tienda: 77963, nombre: "Salud Natural" }),
    fila({ nombre_mapa: "Bodega", id_tienda: null, nombre: "Bodega", tipo: "BODEGA" }),
    fila({ nombre_mapa: "#24626 SATUS", nombre: "SATUS" }),
    fila({ nombre_mapa: "#55401 Powerbatt", id_tienda: 55401, nombre: "Powerbatt", tipo: "DROPOFF" }),
  ]);

  /*
   * La bodega primero porque es el punto contra el que se ubica todo lo demás,
   * y los dropoff antes que las tiendas porque son once contra cincuenta y
   * tres y son los que más se buscan.
   */
  assert.deepEqual(
    lugares.map((l) => l.nombre),
    ["Bodega", "Powerbatt", "Salud Natural", "SATUS"],
  );
});

test("un ID que está en dos puntos queda marcado en los dos", () => {
  const lugares = ordenarLugares([
    fila({ nombre_mapa: "#55004 Marlovet", id_tienda: 55004, nombre: "Marlovet" }),
    fila({ nombre_mapa: "#55004 Marlovet 2", id_tienda: 55004, nombre: "Marlovet 2" }),
    fila({ nombre_mapa: "#24626 SATUS", nombre: "SATUS" }),
  ]);

  /*
   * Se avisa en vez de esconderlo. Quien busque #55004 tiene que saber que hay
   * dos direcciones y que el sistema no dice cuál corresponde a cada pedido:
   * mostrar una sola sería contestar una pregunta que nadie puede responder.
   */
  assert.deepEqual(
    lugares.map((l) => [l.nombre, l.compartido]),
    [["Marlovet", true], ["Marlovet 2", true], ["SATUS", false]],
  );
});

test("un punto sin ID no se marca como compartido con los otros sin ID", () => {
  const lugares = ordenarLugares([
    fila({ nombre_mapa: "SPG Benito Juarez", id_tienda: null, nombre: "SPG Benito Juarez" }),
    fila({ nombre_mapa: "David", id_tienda: null, nombre: "David" }),
  ]);

  // Nulo no es un valor repetido: son dos puntos distintos que el mapa no ató
  // a ningún comercio, no dos sucursales del mismo.
  assert.deepEqual(lugares.map((l) => l.compartido), [false, false]);
});

test("se busca por nombre sin acentos y por ID", () => {
  const lugares = ordenarLugares([
    fila({ nombre_mapa: "#73517 Volk's Coruña", id_tienda: 73517, nombre: "Volk's Coruña" }),
    fila({ nombre_mapa: "#24626 SATUS", nombre: "SATUS" }),
  ]);

  // Nadie escribe «Coruña» con la eñe cuando está buscando una dirección.
  assert.deepEqual(filtrarLugares(lugares, "coruna").map((l) => l.nombre), ["Volk's Coruña"]);
  assert.deepEqual(filtrarLugares(lugares, "CORUÑA").map((l) => l.nombre), ["Volk's Coruña"]);
  assert.deepEqual(filtrarLugares(lugares, "24626").map((l) => l.nombre), ["SATUS"]);

  // Sin texto, todo. Con texto que no está, nada: no se cae a «mostrar todo».
  assert.equal(filtrarLugares(lugares, "   ").length, 2);
  assert.equal(filtrarLugares(lugares, "zzz").length, 0);
});

test("los tres tipos se ven distintos entre sí", () => {
  assert.equal(new Set(Object.values(COLOR_TIPO)).size, 3);
});

test("el enlace lleva al punto exacto en Google Maps", () => {
  /*
   * El mapa del tablero ubica contra las zonas de reparto, que es lo que sirve
   * para decidir; para llegar hasta la puerta hace falta un mapa de calles.
   */
  assert.equal(
    enlaceAGoogleMaps({ lat: 19.455207, lon: -99.105858 }),
    "https://www.google.com/maps/search/?api=1&query=19.455207,-99.105858",
  );
});

/* ---------------------------------------------------------------------------
 * La lectura
 * ------------------------------------------------------------------------- */

test("la pantalla lee la tabla y la devuelve ordenada", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_tiendas: [
      fila({ nombre_mapa: "#24626 SATUS", nombre: "SATUS" }),
      fila({ nombre_mapa: "Bodega", id_tienda: null, nombre: "Bodega", tipo: "BODEGA" }),
    ],
  });
  t.after(base.restore);

  const lugares = await leerLugares();
  assert.deepEqual(lugares.map((l) => l.tipo), ["BODEGA", "TIENDA"]);
});

test("sin la tabla, la pantalla dice qué migración correr", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {});
  t.after(base.restore);

  /*
   * Acá sí se propaga el error, al revés que en el tracker: allá los
   * domicilios son un dato accesorio de una pantalla que sirve igual sin
   * ellos, y acá la tabla ES la pantalla. Sin ella no hay nada que mostrar, y
   * fingir una lista vacía sería decir que no hay tiendas cargadas.
   */
  await assert.rejects(() => leerLugares(), /tracker_tiendas/);

  const pagina = readFileSync(
    new URL("../src/app/(tablero)/tiendas/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pagina, /migracion-06-lugares\.sql/);
  assert.match(pagina, /TablaFaltante/);
});

test("la tabla vacía no es lo mismo que la tabla que falta", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, { tracker_tiendas: [] });
  t.after(base.restore);

  assert.deepEqual(await leerLugares(), []);

  // Y la pantalla lo dice con sus palabras, en vez de mostrar un mapa pelado.
  const pagina = readFileSync(
    new URL("../src/app/(tablero)/tiendas/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pagina, /La tabla está vacía/);
});

test("las tiendas no entraron de vuelta al live tracker", () => {
  /*
   * Se pidió expresamente que esta pantalla fuera independiente. El tracker no
   * tiene por qué leer la tabla de tiendas ni dibujar comercios, y esta prueba
   * es lo que hace que no vuelvan a colarse sin que nadie lo decida.
   */
  for (const archivo of [
    "../src/lib/tracker-datos.ts",
    "../src/components/MapaTracker.tsx",
    "../src/components/LiveTracker.tsx",
  ]) {
    const fuente = readFileSync(new URL(archivo, import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /tracker_tiendas|TABLA_TRACKER_TIENDAS/, archivo);
  }

  /*
   * Y la consulta de paquetes no devuelve el comercio: se agregó para atarlo
   * al mapa de tiendas y esa razón dejó de existir.
   *
   * El `JOIN ... ON U.Id = V.IdUsuario` sí tiene que seguir: es lo que acota
   * el universo a `IdModalidad = 5` e `IdLocalidad = 9`, y no tiene nada que
   * ver con las tiendas. Por eso se busca la columna en la salida y no el
   * nombre suelto en el archivo.
   */
  const flujo = readFileSync(new URL("../../n8n/09-tracker-paquetes.json", import.meta.url), "utf8");
  assert.doesNotMatch(flujo, /AS IdUsuario|AS Seller|id_usuario:|seller:/);
  assert.match(flujo, /ON U\.Id = V\.IdUsuario/, "el join que acota por comercio tiene que seguir");
});
