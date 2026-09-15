import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  RESPONSABLES,
  claveTienda,
  indexarResponsables,
  limpiarAlias,
  responsableDe,
  revisarTienda,
  type FilaResponsable,
} from "../src/lib/responsables";

/**
 * Pruebas de la distribución de tiendas.
 *
 * Cubren la regla que decide el color de cada comercio en todo el tablero —la
 * clave por nombre y los alias—, las validaciones antes de guardar y la carga
 * inicial de la migración.
 */

const MIGRACION = readFileSync(
  new URL("../supabase/migracion-13-tiendas-responsables.sql", import.meta.url),
  "utf8",
);

function fila(over: Partial<FilaResponsable> = {}): FilaResponsable {
  return {
    id: "1",
    nombre: "SATUS",
    clave: "satus",
    alias: [],
    responsable: "esteban@rapiboy.com",
    seccion: "COLECTA",
    editado_por: null,
    editado_en: null,
    ...over,
  };
}

const [ESTEBAN, CANDE] = RESPONSABLES;

/* ---------------------------------------------------------------------------
 * La clave
 * ------------------------------------------------------------------------- */

test("el mismo comercio escrito distinto da la misma clave", () => {
  // Así aparece en mensual, en colectas y en el mapa, según quién lo cargó.
  assert.equal(claveTienda("Mayor Bag"), claveTienda("MayorBag"));
  assert.equal(claveTienda("Bache Crítico"), claveTienda("bache critico"));
  assert.equal(claveTienda("D´leo"), claveTienda("D’leo"));
  assert.equal(claveTienda("Volk's Coruña"), claveTienda("VOLKS CORUNA"));
  assert.equal(claveTienda("  Sano Mundo "), claveTienda("Sano Mundo"));
});

test("dos comercios distintos no comparten clave", () => {
  assert.notEqual(claveTienda("Marlovet"), claveTienda("Marlovet 2"));
  assert.notEqual(claveTienda("Corporativo gracia de dios"), claveTienda("Corporativo Garcia de Dios"));
});

/* ---------------------------------------------------------------------------
 * El color
 * ------------------------------------------------------------------------- */

test("Esteban es azul y Candelaria rosa, y son distintos", () => {
  assert.equal(ESTEBAN.email, "esteban@rapiboy.com");
  assert.equal(ESTEBAN.grupo, "A");
  assert.match(ESTEBAN.color, /--tienda-esteban/);
  assert.equal(CANDE.email, "candelaria@rapiboy.com");
  assert.equal(CANDE.grupo, "B");
  assert.match(CANDE.color, /--tienda-candelaria/);
  assert.notEqual(ESTEBAN.color, CANDE.color);

  // Las variables tienen que existir en los tres bloques del tema: claro,
  // oscuro por sistema y oscuro elegido a mano.
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.equal([...css.matchAll(/--tienda-esteban:/g)].length, 3);
  assert.equal([...css.matchAll(/--tienda-candelaria:/g)].length, 3);
});

test("el dueño se encuentra por nombre o por cualquiera de sus alias", () => {
  const indice = indexarResponsables([
    fila({ nombre: "DropOff MayorBag (MayorBag)", alias: ["Mayor Bag", "dropOFF MayorBag"], responsable: CANDE.email }),
    fila({ id: "2", nombre: "SATUS" }),
  ]);

  assert.equal(responsableDe(indice, "Mayor Bag")?.grupo, "B");
  assert.equal(responsableDe(indice, "dropOFF MayorBag")?.grupo, "B");
  assert.equal(responsableDe(indice, "DropOff MayorBag (MayorBag)")?.grupo, "B");
  assert.equal(responsableDe(indice, "satus")?.grupo, "A");

  // Sin asignar, sin nombre o con un correo que no es de nadie: sin color.
  assert.equal(responsableDe(indice, "Otra tienda"), null);
  assert.equal(responsableDe(indice, ""), null);
  assert.equal(responsableDe(indice, null), null);
  assert.equal(responsableDe({ satus: "otra@rapiboy.com" }, "SATUS"), null);
});

/* ---------------------------------------------------------------------------
 * Antes de guardar
 * ------------------------------------------------------------------------- */

test("los alias vacíos, repetidos o iguales al nombre se descartan", () => {
  assert.deepEqual(
    limpiarAlias("Mayor Bag", ["", "  MayorBag ", "dropOFF  MayorBag", "dropoff mayorbag", "mayor bag"]),
    ["dropOFF MayorBag"],
  );
});

test("una tienda no puede tener dos dueños ni compartir un alias", () => {
  const existentes = [
    fila({ id: "1", nombre: "SATUS", alias: ["Satus MX"] }),
    fila({ id: "2", nombre: "Marlovet", responsable: CANDE.email }),
  ];
  const datos = { nombre: "Nueva", alias: [], responsable: ESTEBAN.email, seccion: "NUEVA" };

  assert.equal(revisarTienda(datos, existentes, null), null);
  assert.match(revisarTienda({ ...datos, nombre: "satus" }, existentes, null) ?? "", /SATUS/);
  assert.match(revisarTienda({ ...datos, alias: ["SATUS mx"] }, existentes, null) ?? "", /SATUS/);

  // Editar la propia fila no choca consigo misma.
  assert.equal(revisarTienda({ ...datos, nombre: "SATUS", alias: ["Satus MX"] }, existentes, "1"), null);
});

test("sin nombre, dueño o sección válidos no se guarda", () => {
  const datos = { nombre: "Nueva", alias: [], responsable: ESTEBAN.email, seccion: "NUEVA" };
  assert.match(revisarTienda({ ...datos, nombre: "  " }, [], null) ?? "", /nombre/);
  assert.match(revisarTienda({ ...datos, responsable: "otra@rapiboy.com" }, [], null) ?? "", /quién/);
  assert.match(revisarTienda({ ...datos, seccion: "OTRA" }, [], null) ?? "", /sección/);
});

/* ---------------------------------------------------------------------------
 * La migración
 * ------------------------------------------------------------------------- */

type Carga = { nombre: string; clave: string; alias: string[]; responsable: string; seccion: string };

function cargaInicial(): Carga[] {
  const texto = (t: string) => t.replace(/''/g, "'");
  const filas: Carga[] = [];
  const patron =
    /^ {2}\('((?:[^']|'')*)', '((?:[^']|'')*)', (array\[(?:[^\]])*\]|'\{\}'::text\[\]), '([^']*)', '([^']*)'\)/gm;
  for (const m of MIGRACION.matchAll(patron)) {
    const alias = m[3].startsWith("array")
      ? [...m[3].matchAll(/'((?:[^']|'')*)'/g)].map((a) => texto(a[1]))
      : [];
    filas.push({ nombre: texto(m[1]), clave: texto(m[2]), alias, responsable: m[4], seccion: m[5] });
  }
  return filas;
}

test("la migración es aditiva y no pisa lo editado desde la web", () => {
  assert.match(MIGRACION, /create table if not exists public\.tiendas_responsables/);
  assert.match(MIGRACION, /clave\s+text not null unique/);
  assert.match(MIGRACION, /enable row level security/);
  assert.match(MIGRACION, /on conflict \(clave\) do nothing/);
  assert.doesNotMatch(MIGRACION, /\b(delete from|truncate|drop table if exists)\b/i);
});

test("la carga inicial trae la lista completa, repartida entre los dos", () => {
  const carga = cargaInicial();
  assert.equal(carga.length, 364);
  assert.equal(carga.filter((f) => f.responsable === ESTEBAN.email).length, 181);
  assert.equal(carga.filter((f) => f.responsable === CANDE.email).length, 183);

  const porNombre = new Map(carga.map((f) => [f.nombre, f]));
  assert.equal(porNombre.get("DropOff TERESITA EXPRESS")?.responsable, ESTEBAN.email);
  assert.equal(porNombre.get("DropOff Powerbatt (PowerBatt)")?.responsable, CANDE.email);
  assert.equal(porNombre.get("Altra Pisos")?.seccion, "NO_COLECTA");
  assert.equal(porNombre.get("Salud natural")?.seccion, "NUEVA");
});

test("cada clave de la carga es la que calcula la web, y ningún alias se repite", () => {
  const carga = cargaInicial();
  const vistas = new Map<string, string>();
  for (const f of carga) {
    assert.equal(f.clave, claveTienda(f.nombre), f.nombre);
    for (const texto of [f.nombre, ...f.alias]) {
      const clave = claveTienda(texto);
      const previa = vistas.get(clave);
      assert.ok(!previa || previa === f.nombre, `«${texto}» figura en «${previa}» y en «${f.nombre}»`);
      vistas.set(clave, f.nombre);
    }
  }

  // Los dropoff del mapa y de colectas toman el color de su tienda.
  const indice = indexarResponsables(
    carga.map((f, i) => fila({ id: String(i), ...f, seccion: f.seccion as FilaResponsable["seccion"] })),
  );
  assert.equal(responsableDe(indice, "Powerbatt")?.grupo, "B");
  assert.equal(responsableDe(indice, "dropOFF MiMoto")?.grupo, "A");
});
