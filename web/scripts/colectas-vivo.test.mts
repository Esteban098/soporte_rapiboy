import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  alertasDelDia,
  estadoColecta,
  faseDe,
  hitosDe,
  horaMexico,
  paquetesDe,
  prepararColecta,
  recorridoHecho,
  resumirPorDriver,
  rutaPendiente,
  tiendasVisitadas,
  totalesDelDia,
  trazoDeRuta,
  ventanaDe,
  type ColectaVivoFila,
  type ColectasDelDia,
  type DriverVivoFila,
} from "../src/lib/colectas-vivo";
import { leerColectasDelDia, leerRecorridos } from "../src/lib/colectas-vivo-datos";
import { dispararColectasVivo } from "../src/lib/colectas-vivo-sync";
import { BODEGA } from "../src/lib/tracker";

/**
 * Pruebas de las colectas en vivo del mapa de Tiendas.
 *
 * Cubren cuatro cosas: las reglas puras (estado, ruta calculada, paquetes,
 * alertas), la lectura contra una base simulada —incluido que el rol
 * comercial no reciba coordenadas—, el disparo del flujo, y el flujo 12 de
 * n8n mismo: su consulta, sus nodos Code ejecutados de verdad y que sus
 * columnas coincidan con la migración.
 */

/* ---------------------------------------------------------------------------
 * Datos de prueba
 * ------------------------------------------------------------------------- */

const DIA = "2026-09-21";

function colecta(over: Partial<ColectaVivoFila> = {}): ColectaVivoFila {
  return {
    id_colecta: 1,
    fecha_operacion: DIA,
    id_estado: 7,
    creada_en: "2026-09-21T15:02:00.000Z",
    solicitada_en: null,
    colectada_en: null,
    llego_deposito_en: null,
    cancelada_en: null,
    estado_desde: "2026-09-21T16:00:00.000Z",
    aceptada_en: "2026-09-21T16:00:00.000Z",
    en_camino_en: null,
    en_local_en: null,
    retirada_en: null,
    finalizada_en: null,
    en_deposito_en: null,
    hora_desde: null,
    hora_hasta: null,
    id_turno: 1,
    id_reserva: 500,
    reserva_cancelada: false,
    id_motoboy: 10,
    id_motoboy_reserva: 10,
    id_seller: 100,
    seller: "Tienda A",
    direccion_seller: "Calle 1",
    latitud_tienda: 19.4,
    longitud_tienda: -99.1,
    cantidad_pedidos: 5,
    paquetes_solicitados: 0,
    paquetes_colectados: 0,
    cantidad_bultos: 0,
    id_deposito: null,
    depositos_visitados: null,
    comentario: null,
    sincronizado_en: "2026-09-21T19:00:00.000Z",
    ...over,
  };
}

function driver(over: Partial<DriverVivoFila> = {}): DriverVivoFila {
  return {
    id_motoboy: 10,
    fecha_operacion: DIA,
    nombre: "Ana",
    apellido: "Pérez",
    latitud: 19.4,
    longitud: -99.2,
    posicion_en: "2026-09-21T18:55:00.000Z",
    sincronizado_en: "2026-09-21T19:00:00.000Z",
    ...over,
  };
}

function dia(colectas: ColectaVivoFila[], drivers: DriverVivoFila[] = [driver()], over: Partial<ColectasDelDia> = {}): ColectasDelDia {
  return { dia: DIA, colectas, drivers, lugarDeColecta: {}, sinPosiciones: false, ...over };
}

/* ---------------------------------------------------------------------------
 * Estados
 * ------------------------------------------------------------------------- */

test("el estado sale del catálogo de colectas, y la cancelación manda sobre el número", () => {
  const esperado: Record<number, string> = {
    1: "ASIGNADA", 2: "EN_CAMINO", 3: "RETIRADA", 4: "FINALIZADA",
    5: "FINALIZADA_PARCIAL", 6: "EN_LOCAL", 7: "ACEPTADA", 8: "EN_DEPOSITO",
  };
  for (const [id, estado] of Object.entries(esperado)) {
    assert.equal(estadoColecta({ id_estado: Number(id), cancelada_en: null }), estado);
  }
  assert.equal(estadoColecta({ id_estado: 3, cancelada_en: "2026-09-21T16:00:00Z" }), "CANCELADA");
  assert.equal(estadoColecta({ id_estado: 99, cancelada_en: null }), "SIN_CLASIFICAR");
  assert.equal(estadoColecta({ id_estado: null, cancelada_en: null }), "SIN_CLASIFICAR");

  assert.equal(faseDe("ACEPTADA"), "PENDIENTE");
  assert.equal(faseDe("EN_LOCAL"), "EN_CURSO");
  assert.equal(faseDe("RETIRADA"), "RETIRADA");
  assert.equal(faseDe("EN_DEPOSITO"), "CERRADA");
});

test("una ventana vacía, invertida o 01:00–01:00 no es una ventana", () => {
  assert.deepEqual(ventanaDe("13:00", "13:15"), { desde: 780, hasta: 795 });
  assert.equal(ventanaDe("01:00", "01:00"), null);
  assert.equal(ventanaDe("14:00", "13:00"), null);
  assert.equal(ventanaDe(null, "13:00"), null);
  assert.equal(ventanaDe("1:00", "13:00"), null);
});

test("los paquetes que faltan solo existen en una colecta cerrada", () => {
  const retirada = prepararColecta(colecta({ id_estado: 3, paquetes_solicitados: 10, paquetes_colectados: 0 }));
  assert.equal(paquetesDe(retirada).faltantes, null, "retirada con 0 en bodega no es una falta: todavía no llegó");

  const cerrada = prepararColecta(colecta({ id_estado: 4, paquetes_solicitados: 10, paquetes_colectados: 7 }));
  assert.equal(paquetesDe(cerrada).faltantes, 3);
  assert.equal(paquetesDe(cerrada).porcentaje, 70);
});

/* ---------------------------------------------------------------------------
 * Ruta calculada
 * ------------------------------------------------------------------------- */

test("la ruta pone primero lo comprometido y después lo más cercano, sin las ya retiradas", () => {
  const origen = { lat: 19.4, lon: -99.2 };
  const cerca = prepararColecta(colecta({ id_colecta: 1, latitud_tienda: 19.4, longitud_tienda: -99.19 }));
  const lejos = prepararColecta(colecta({ id_colecta: 2, latitud_tienda: 19.4, longitud_tienda: -99.0 }));
  const medio = prepararColecta(colecta({ id_colecta: 3, latitud_tienda: 19.4, longitud_tienda: -99.1 }));
  const enLocal = prepararColecta(colecta({ id_colecta: 4, id_estado: 6, latitud_tienda: 19.5, longitud_tienda: -98.9 }));
  const retirada = prepararColecta(colecta({ id_colecta: 5, id_estado: 3 }));
  const sinPunto = prepararColecta(colecta({ id_colecta: 6, latitud_tienda: 0, longitud_tienda: 0 }));

  /*
   * La que está en el local va primero aunque quede lejos. Desde ahí —y no
   * desde el repartidor— sigue la más cercana: el vecino más cercano mide
   * siempre desde la parada anterior. Las sin coordenadas, al final.
   */
  const ruta = rutaPendiente(origen, [lejos, retirada, sinPunto, medio, cerca, enLocal]);
  assert.deepEqual(ruta.map((c) => c.id_colecta), [4, 2, 3, 1, 6]);

  // Sin la que está en el local, arranca por la más cercana al repartidor.
  assert.deepEqual(rutaPendiente(origen, [lejos, medio, cerca]).map((c) => c.id_colecta), [1, 3, 2]);
});

test("una ventana horaria que cierra antes va primero, aunque quede más lejos", () => {
  const origen = { lat: 19.4, lon: -99.2 };
  const cerca = prepararColecta(colecta({ id_colecta: 1, latitud_tienda: 19.4, longitud_tienda: -99.19 }));
  const conVentana = prepararColecta(colecta({ id_colecta: 2, latitud_tienda: 19.4, longitud_tienda: -99.0, hora_desde: "09:00", hora_hasta: "10:00" }));
  assert.deepEqual(rutaPendiente(origen, [cerca, conVentana]).map((c) => c.id_colecta), [2, 1]);
});

test("sin posición del repartidor el orden sigue siendo estable", () => {
  const a = prepararColecta(colecta({ id_colecta: 7, creada_en: "2026-09-21T15:00:00Z" }));
  const b = prepararColecta(colecta({ id_colecta: 3, creada_en: "2026-09-21T15:00:00Z" }));
  const c = prepararColecta(colecta({ id_colecta: 5, creada_en: "2026-09-21T14:00:00Z" }));
  assert.deepEqual(rutaPendiente(null, [a, b, c]).map((x) => x.id_colecta), [5, 3, 7]);
  assert.deepEqual(rutaPendiente(null, [c, a, b]).map((x) => x.id_colecta), [5, 3, 7]);
});

test("la línea termina en la bodega", () => {
  const parada = prepararColecta(colecta());
  const trazo = trazoDeRuta({ lat: 19.3, lon: -99.2 }, [parada], false);
  assert.deepEqual(trazo.at(-1), BODEGA);
  assert.equal(trazo.length, 3);

  // Sin paradas pero con paquetes encima: del repartidor a la bodega.
  assert.equal(trazoDeRuta({ lat: 19.3, lon: -99.2 }, [], true).length, 2);
  // Sin nada que hacer, no hay línea.
  assert.deepEqual(trazoDeRuta({ lat: 19.3, lon: -99.2 }, [], false), []);
});

/* ---------------------------------------------------------------------------
 * Resúmenes y alertas
 * ------------------------------------------------------------------------- */

test("agrupa por repartidor, con las colectas sin repartidor primero", () => {
  const resumen = resumirPorDriver(
    dia([
      colecta({ id_colecta: 1 }),
      colecta({ id_colecta: 2, id_estado: 4, paquetes_solicitados: 8, paquetes_colectados: 8 }),
      colecta({ id_colecta: 3, id_motoboy: null, id_motoboy_reserva: null }),
      colecta({ id_colecta: 4, id_motoboy: null, id_motoboy_reserva: 20 }),
    ]),
  );

  assert.deepEqual(resumen.map((r) => r.id), [null, 10, 20]);
  assert.equal(resumen[0].nombre, "Sin repartidor");
  assert.equal(resumen[1].nombre, "Ana Pérez");
  assert.equal(resumen[2].nombre, "Repartidor 20", "sin fila de repartidor, se nombra por id");
  assert.equal(resumen[1].porFase.PENDIENTE, 1);
  assert.equal(resumen[1].porFase.CERRADA, 1);
  assert.deepEqual(resumen[1].posicion, { lat: 19.4, lon: -99.2 });
});

test("sin posiciones no hay repartidor en el mapa, pero la ruta sigue saliendo", () => {
  const resumen = resumirPorDriver(dia([colecta()], [driver()], { sinPosiciones: true }));
  assert.equal(resumen[0].posicion, null);
  assert.equal(resumen[0].posicionEn, null);
  assert.equal(resumen[0].ruta.length, 1);
  assert.deepEqual(resumen[0].trazo[0], { lat: 19.4, lon: -99.1 }, "arranca en la tienda, no en el repartidor");
});

test("los totales cuentan fases, paquetes y el tiempo de la tienda a la bodega", () => {
  const totales = totalesDelDia(
    dia([
      colecta({ id_colecta: 1, cantidad_pedidos: 5 }),
      colecta({
        id_colecta: 2,
        id_estado: 4,
        paquetes_solicitados: 10,
        paquetes_colectados: 9,
        retirada_en: "2026-09-21T17:00:00Z",
        finalizada_en: "2026-09-21T18:30:00Z",
        sincronizado_en: "2026-09-21T19:05:00.000Z",
      }),
    ]),
  );
  assert.equal(totales.colectas, 2);
  assert.equal(totales.porFase.PENDIENTE, 1);
  assert.equal(totales.porFase.CERRADA, 1);
  assert.equal(totales.paquetes.faltantes, 1);
  assert.equal(totales.minutosABodega, 90);
  assert.equal(totales.sincronizadoEn, "2026-09-21T19:05:00.000Z");
});

test("las alertas marcan lo que no cierra, y sin reloj omiten las que dependen de la hora", () => {
  const datos = dia(
    [
      colecta({ id_colecta: 1, id_motoboy: null, id_motoboy_reserva: null }),
      colecta({ id_colecta: 2, id_estado: 6, estado_desde: "2026-09-21T18:30:00Z" }),
      colecta({ id_colecta: 3, id_motoboy: 10, id_motoboy_reserva: 11 }),
      colecta({ id_colecta: 4, reserva_cancelada: true }),
      colecta({ id_colecta: 5, sincronizado_en: "2026-09-21T18:00:00.000Z" }),
      colecta({ id_colecta: 6, id_estado: 4, paquetes_solicitados: 5, paquetes_colectados: 5, colectada_en: null }),
    ],
    [driver({ posicion_en: "2026-09-21T17:00:00.000Z" })],
  );

  const ahora = Date.parse("2026-09-21T19:00:00Z");
  const tipos = alertasDelDia(datos, ahora).map((a) => `${a.tipo}:${a.id_colecta ?? a.id_motoboy}`);

  for (const esperado of [
    "SIN_REPARTIDOR:1",
    "EN_LOCAL_DEMORADA:2",
    "REPARTIDOR_DISTINTO:3",
    "RESERVA_CANCELADA:4",
    "NO_SINCRONIZADA:5",
    "CERRADA_SIN_FECHA:6",
    "POSICION_VIEJA:10",
  ]) {
    assert.ok(tipos.includes(esperado), `falta ${esperado} en ${tipos.join(", ")}`);
  }

  // Las urgentes arriba.
  const niveles = alertasDelDia(datos, ahora).map((a) => a.nivel);
  assert.deepEqual(niveles, [...niveles].sort((a, b) => Number(b === "critica") - Number(a === "critica")));

  const sinReloj = alertasDelDia(datos, null).map((a) => a.tipo);
  assert.ok(!sinReloj.includes("EN_LOCAL_DEMORADA"));
  assert.ok(!sinReloj.includes("POSICION_VIEJA"));
  assert.ok(sinReloj.includes("SIN_REPARTIDOR"));

  // Un comercial no ve posiciones, así que tampoco recibe alertas sobre ellas.
  const comercial = alertasDelDia({ ...datos, sinPosiciones: true }, ahora).map((a) => a.tipo);
  assert.ok(!comercial.includes("POSICION_VIEJA"));
});

test("las horas se muestran en Ciudad de México y los hitos salen en orden", () => {
  assert.equal(horaMexico("2026-09-21T19:05:00.000Z"), "13:05");
  assert.equal(horaMexico(null), "—");

  const hitos = hitosDe(
    colecta({ creada_en: "2026-09-21T15:00:00Z", aceptada_en: "2026-09-21T16:00:00Z", retirada_en: "2026-09-21T15:30:00Z" }),
  );
  assert.deepEqual(hitos.map((h) => h.etiqueta), ["Creada", "Retirada", "Aceptada"]);
});

/* ---------------------------------------------------------------------------
 * Lectura
 * ------------------------------------------------------------------------- */

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

test("la lectura filtra por el día de México y le saca las coordenadas al comercial", async (t) => {
  conEntorno(t, BASE);
  const pedidas: URL[] = [];
  const simulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    pedidas.push(url);
    const tabla = url.pathname.replace("/rest/v1/", "");
    if (Number(url.searchParams.get("offset") ?? 0) > 0) return Response.json([]);
    if (tabla === "colectas_vivo") return Response.json([colecta()]);
    if (tabla === "colectas_vivo_drivers") return Response.json([driver()]);
    if (tabla === "colectas_asignacion") return Response.json([{ id_usuario: 100, lugar_colecta: "dropOFF Teresita" }]);
    return new Response(`{"code":"PGRST205"}`, { status: 404 });
  });
  t.after(() => simulado.mock.restore());

  const operador = await leerColectasDelDia({ sinPosiciones: false }, DIA);
  assert.equal(operador.drivers[0].latitud, 19.4);
  assert.deepEqual(operador.lugarDeColecta, { 100: "dropOFF Teresita" });
  assert.ok(pedidas.some((u) => u.pathname.endsWith("colectas_vivo") && u.searchParams.get("fecha_operacion") === `eq.${DIA}`));

  const comercial = await leerColectasDelDia({ sinPosiciones: true }, DIA);
  assert.equal(comercial.sinPosiciones, true);
  assert.equal(comercial.drivers[0].latitud, null);
  assert.equal(comercial.drivers[0].longitud, null);
  assert.equal(comercial.drivers[0].posicion_en, null);
  assert.equal(comercial.drivers[0].nombre, "Ana", "el nombre sí llega: la pantalla de colectas ya lo muestra");
});

test("sin la tabla de asignación, las colectas salen igual", async (t) => {
  conEntorno(t, BASE);
  const simulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const tabla = new URL(String(input)).pathname.replace("/rest/v1/", "");
    if (tabla === "colectas_asignacion") return new Response(`{"code":"PGRST205"}`, { status: 404 });
    return Response.json([]);
  });
  t.after(() => simulado.mock.restore());

  const datos = await leerColectasDelDia({ sinPosiciones: false }, DIA);
  assert.deepEqual(datos.lugarDeColecta, {});
});

/* ---------------------------------------------------------------------------
 * Disparo del flujo
 * ------------------------------------------------------------------------- */

test("sin sesión no se dispara nada, y sin webhook se dice cuál falta", async (t) => {
  conEntorno(t, { N8N_WEBHOOKS_COLECTAS_VIVO: undefined });
  const simulado = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
  t.after(() => simulado.mock.restore());

  assert.equal((await dispararColectasVivo(false)).ok, false);
  const sinFlujo = await dispararColectasVivo(true);
  assert.equal(sinFlujo.ok, false);
  assert.match(sinFlujo.mensaje ?? "", /N8N_WEBHOOKS_COLECTAS_VIVO/);
  assert.equal(simulado.mock.callCount(), 0);
});

test("el tablero manda el día de México y reporta un 404 de n8n", async (t) => {
  conEntorno(t, { N8N_WEBHOOKS_COLECTAS_VIVO: "https://n8n.invalid/webhook/colectas-en-vivo" });
  const cuerpos: Record<string, unknown>[] = [];
  let estado = 200;
  const simulado = t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    cuerpos.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: estado });
  });
  t.after(() => simulado.mock.restore());

  // 03:30 UTC del 22 son las 21:30 del 21 en México: el día sigue siendo el 21.
  const bien = await dispararColectasVivo(true, new Date("2026-09-22T03:30:00Z"));
  assert.deepEqual(bien, { ok: true, mensaje: null });
  assert.equal(cuerpos[0].dia, "2026-09-21");
  assert.equal(cuerpos[0].zona, "America/Mexico_City");

  estado = 404;
  const mal = await dispararColectasVivo(true);
  assert.equal(mal.ok, false);
  assert.match(mal.mensaje ?? "", /404/);
});

/* ---------------------------------------------------------------------------
 * El flujo 12
 * ------------------------------------------------------------------------- */

type Nodo = {
  name: string;
  type: string;
  parameters: Record<string, unknown> & {
    query?: string;
    jsCode?: string;
    operation?: string;
    table?: { value: string };
    columns?: { value: Record<string, string>; matchingColumns: string[] };
  };
  credentials?: Record<string, { id: string }>;
};

const FLUJO = JSON.parse(
  readFileSync(new URL("../../n8n/12-colectas-vivo.json", import.meta.url), "utf8"),
) as { active: boolean; nodes: Nodo[]; connections: Record<string, { main: { node: string }[][] }>; settings: { timezone?: string } };

const MIGRACION = readFileSync(new URL("../supabase/migracion-15-colectas-vivo.sql", import.meta.url), "utf8");
const MIGRACION_RECORRIDO = readFileSync(
  new URL("../supabase/migracion-16-colectas-vivo-recorrido.sql", import.meta.url),
  "utf8",
);

function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function nodo(nombre: string): Nodo {
  const encontrado = FLUJO.nodes.find((n) => n.name === nombre);
  assert.ok(encontrado, `el flujo 12 no tiene el nodo «${nombre}»`);
  return encontrado;
}

/** Ejecuta un nodo Code del flujo con la entrada dada, como lo haría n8n. */
function correr(nombre: string, json: unknown, items: unknown[] = []) {
  const codigo = nodo(nombre).parameters.jsCode as string;
  const $input = { all: () => items.map((j) => ({ json: j })) };
  return new Function("$json", "$input", codigo)(json, $input) as { json: Record<string, unknown> }[];
}

/** Las columnas de una tabla de las migraciones. */
function columnasDe(tabla: string): string[] {
  const cuerpo = new RegExp(`create table if not exists public\\.${tabla} \\(([\\s\\S]*?)\\n\\);`).exec(
    sinComentarios(MIGRACION + "\n" + MIGRACION_RECORRIDO),
  );
  assert.ok(cuerpo, `la migración no crea ${tabla}`);
  return [...cuerpo[1].matchAll(/^\s+([a-z_]+)\s+[a-z]/gm)]
    .map((m) => m[1])
    .filter((c) => !["primary", "unique", "constraint"].includes(c));
}

test("el flujo se importa apagado, con credenciales por referencia y en hora de México", () => {
  const texto = JSON.stringify(FLUJO);
  assert.equal(FLUJO.active, false);
  assert.equal(FLUJO.settings.timezone, "America/Mexico_City");
  assert.ok(!/password|apikey|api_key|service_role|secret/i.test(texto));
  for (const n of FLUJO.nodes) {
    for (const cred of Object.values(n.credentials ?? {})) {
      assert.ok(["REEMPLAZAR", "F5EJUfXcquXz7Rf3"].includes(cred.id), `${n.name}: ${cred.id}`);
    }
  }
});

test("el flujo solo escribe sus tres tablas, con upsert y todas las columnas de la migración", () => {
  const escrituras = FLUJO.nodes.filter((n) => n.type === "n8n-nodes-base.postgres" && n.parameters.operation === "upsert");
  assert.deepEqual(
    escrituras.map((n) => n.parameters.table?.value).sort(),
    ["colectas_vivo", "colectas_vivo_drivers", "colectas_vivo_posiciones"],
  );

  const CLAVE: Record<string, string[]> = {
    colectas_vivo: ["id_colecta"],
    colectas_vivo_drivers: ["id_motoboy"],
    colectas_vivo_posiciones: ["id_motoboy", "posicion_en"],
  };
  for (const n of escrituras) {
    const tabla = n.parameters.table?.value as string;
    const mapeadas = Object.keys(n.parameters.columns?.value ?? {}).sort();
    assert.deepEqual(mapeadas, columnasDe(tabla).sort(), `${n.name}: columnas distintas de la migración`);
    assert.deepEqual(n.parameters.columns?.matchingColumns, CLAVE[tabla]);
  }

  // El único otro nodo de Postgres recorta el recorrido viejo, y solo ese.
  const otros = FLUJO.nodes.filter((n) => n.type === "n8n-nodes-base.postgres" && n.parameters.operation !== "upsert");
  assert.deepEqual(otros.map((n) => n.name), ["Recortar recorrido viejo"]);
  const recorte = sinComentarios(otros[0].parameters.query as string);
  assert.match(recorte, /^\s*delete from public\.colectas_vivo_posiciones\s+where fecha_operacion < current_date - 30;\s*$/);

  for (const n of FLUJO.nodes.filter((x) => x.type === "n8n-nodes-base.microsoftSql")) {
    assert.equal(n.parameters.operation, "executeQuery", n.name);
  }
});

test("la consulta lee sin bloquear, convierte las fechas y no usa el destino del paquete", () => {
  const sql = sinComentarios(nodo("Colectas del día").parameters.query as string);

  assert.ok(!/\b(insert|update|delete|merge|drop|alter|exec)\b/i.test(sql), "la consulta solo lee");
  assert.ok(!/LatitudDestino/i.test(sql), "la posición del repartidor no sale de Viaje");
  assert.match(sql, /M\.Latitud\s+AS LatitudRepartidor/);
  assert.match(sql, /AT TIME ZONE @Zona/);
  assert.match(sql, /DECLARE @Zona\s+VARCHAR\(60\) = 'Argentina Standard Time'/);
  assert.match(sql, /C\.Fecha >= @Desde\s+AND C\.Fecha <\s+@Hasta/, "rango semiabierto contra la columna sin envolver");
  assert.ok(!/CAST\(C\.Fecha AS DATE\)/i.test(sql));

  // Cada tabla del sistema con NOLOCK.
  const tablas = [...sql.matchAll(/(?:FROM|JOIN)\s+dbo\.(\w+)(?:\s+(?!WITH\b)\w+)?(\s+WITH \(NOLOCK\))?/g)];
  assert.ok(tablas.length >= 6);
  for (const m of tablas) assert.ok(m[2], `dbo.${m[1]} sin NOLOCK`);

  // El historial se agrega antes de unirse: nunca crudo.
  assert.match(sql, /GROUP BY H\.IdColecta/);
  assert.match(sql, /H\.Id > @DesdeHistorial/, "el historial se acota por su índice");

  // Solo tres valores entran por expresión, y los tres los arma el nodo anterior.
  const expresiones = [...(nodo("Colectas del día").parameters.query as string).matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(expresiones)].sort(), ["$json.desde", "$json.dia", "$json.hasta", "$json.sincronizado_en"]);
});

test("el día de operación se convierte al reloj del sistema y no deja pasar texto libre", () => {
  const [pedido] = correr("Día de operación", { body: { dia: "2026-09-21" } });
  assert.equal(pedido.json.dia, "2026-09-21");
  assert.equal(pedido.json.desde, "2026-09-21 03:00:00");
  assert.equal(pedido.json.hasta, "2026-09-22 03:00:00");
  assert.equal(pedido.json.origen, "tablero");

  const [inyectado] = correr("Día de operación", { body: { dia: "2026-09-21'; DROP TABLE Colecta; --" } });
  assert.match(String(inyectado.json.dia), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(inyectado.json.origen, "horario");
  assert.match(String(inyectado.json.desde), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

const FILA_SQL = {
  Dia: DIA,
  SincronizadoEn: "2026-09-21T19:00:00.000Z",
  IdColecta: 460655,
  IdEstado: 3,
  CreadaEn: "2026-09-21T15:05:00Z",
  ColectadaEn: "2026-09-21T19:05:00Z",
  EstadoDesde: "2026-09-21T19:04:49Z",
  HoraDesde: "01:00",
  HoraHasta: "01:00",
  IdTurno: 1,
  IdReserva: 10184568,
  ReservaCancelada: false,
  IdMotoboyReserva: 711802,
  IdMotoboy: 711802,
  NombreRepartidor: "Roberto",
  ApellidoRepartidor: "Estevez",
  LatitudRepartidor: 19.3292321,
  LongitudRepartidor: -99.2010625,
  PosicionEn: "2026-09-21T18:58:00Z",
  IdSeller: 55676,
  Seller: "DropOff Powerbatt",
  LatitudTienda: 19.3198315,
  LongitudTienda: -99.1079217,
  PaquetesSolicitados: 66,
  PaquetesColectados: 0,
  IdPedidos: "30823700,30837388,30837388, 30837389",
};

test("las colectas pasan a columnas: ids de pedidos distintos, coordenadas validadas", () => {
  const salida = correr("A columnas · colectas", null, [
    FILA_SQL,
    { ...FILA_SQL, IdColecta: 2, LatitudTienda: 0, LongitudTienda: 0, IdPedidos: null },
    { ...FILA_SQL, IdColecta: null },
  ]);
  assert.equal(salida.length, 2, "una fila sin id no se guarda");
  const [a, b] = salida.map((s) => s.json);

  assert.equal(a.cantidad_pedidos, 3, "el id repetido cuenta una vez");
  assert.equal(a.colectada_en, "2026-09-21T19:05:00.000Z");
  assert.equal(a.hora_desde, "01:00", "se guarda crudo; la web decide que no es ventana");
  assert.equal(a.latitud_tienda, 19.3198315);
  assert.equal(b.latitud_tienda, null, "el 0,0 no es una tienda");
  assert.equal(b.cantidad_pedidos, null);

  // Cada columna que escribe el nodo existe en la migración.
  const columnas = new Set(columnasDe("colectas_vivo"));
  for (const clave of Object.keys(a)) assert.ok(columnas.has(clave), `colectas_vivo no tiene ${clave}`);
});

test("un repartidor con diez colectas es una sola fila, y sin señal queda sin posición", () => {
  const salida = correr("A columnas · repartidores", null, [
    FILA_SQL,
    { ...FILA_SQL, IdColecta: 2 },
    { ...FILA_SQL, IdColecta: 3, IdMotoboy: null, IdMotoboyReserva: 5, LatitudRepartidor: 0, LongitudRepartidor: 0 },
    { ...FILA_SQL, IdColecta: 4, IdMotoboy: null, IdMotoboyReserva: null },
  ]).map((s) => s.json);

  assert.deepEqual(salida.map((d) => d.id_motoboy), [711802, 5]);
  assert.equal(salida[0].posicion_en, "2026-09-21T18:58:00.000Z");
  assert.equal(salida[1].latitud, null);
  assert.equal(salida[1].posicion_en, null, "sin punto, la fecha del punto no significa nada");
});

test("los nodos Code leen su entrada y ninguna expresión cruza el grafo", () => {
  for (const n of FLUJO.nodes) {
    const texto = `${n.parameters.query ?? ""}\n${n.parameters.jsCode ?? ""}`;
    assert.ok(!/\$\(\s*['"]/.test(texto), `${n.name} lee de otro nodo`);
  }
  // Los dos caminos de escritura salen de la misma consulta.
  assert.deepEqual(
    FLUJO.connections["Colectas del día"].main[0].map((d) => d.node).sort(),
    ["A columnas · colectas", "A columnas · recorrido", "A columnas · repartidores"],
  );
});

/* ---------------------------------------------------------------------------
 * Recorrido hecho
 * ------------------------------------------------------------------------- */

test("el recorrido junta tiendas visitadas y reportes del teléfono en orden de hora", () => {
  const primera = prepararColecta(colecta({
    id_colecta: 1, id_estado: 4, latitud_tienda: 19.40, longitud_tienda: -99.10,
    en_local_en: "2026-09-21T16:00:00Z", retirada_en: "2026-09-21T16:05:00Z",
    finalizada_en: "2026-09-21T18:00:00Z",
  }));
  const segunda = prepararColecta(colecta({
    id_colecta: 2, id_estado: 3, latitud_tienda: 19.42, longitud_tienda: -99.12,
    en_local_en: null, retirada_en: "2026-09-21T17:00:00Z",
  }));
  const pendiente = prepararColecta(colecta({ id_colecta: 3, id_estado: 7, latitud_tienda: 19.5, longitud_tienda: -99.0 }));

  const gps = [
    { lat: 19.38, lon: -99.08, en: "2026-09-21T15:40:00Z" },
    { lat: 19.41, lon: -99.11, en: "2026-09-21T16:30:00Z" },
    // A 5 m de la primera tienda, a la misma hora: es la tienda.
    { lat: 19.40003, lon: -99.10003, en: "2026-09-21T16:01:00Z" },
  ];

  const pasos = recorridoHecho(
    [pendiente, segunda, primera],
    gps,
    { punto: { lat: 19.45, lon: -99.2 }, en: "2026-09-21T18:30:00Z" },
  );

  assert.deepEqual(
    pasos.map((p) => `${p.tipo}${p.id_colecta ?? ""}`),
    ["GPS", "TIENDA1", "GPS", "TIENDA2", "BODEGA", "ACTUAL"],
    "la pendiente no está: todavía no pasó por ahí",
  );
});

test("una posición actual más vieja que la última tienda no cierra el recorrido", () => {
  const c = prepararColecta(colecta({ id_estado: 3, en_local_en: "2026-09-21T17:00:00Z", latitud_tienda: 19.4, longitud_tienda: -99.1 }));
  const pasos = recorridoHecho(
    [c],
    [{ lat: 19.3, lon: -99.0, en: "2026-09-21T16:00:00Z" }],
    { punto: { lat: 19.5, lon: -99.3 }, en: "2026-09-21T15:00:00Z" },
  );
  assert.deepEqual(pasos.map((p) => p.tipo), ["GPS", "TIENDA"]);

  // Con un solo punto no hay camino que dibujar.
  assert.deepEqual(recorridoHecho([c], [], null), []);
});

test("las tiendas visitadas salen en el orden en que pasó, sin las pendientes", () => {
  const visitadas = tiendasVisitadas([
    prepararColecta(colecta({ id_colecta: 1, id_estado: 4, retirada_en: "2026-09-21T17:00:00Z" })),
    prepararColecta(colecta({ id_colecta: 2, id_estado: 3, en_local_en: "2026-09-21T16:00:00Z" })),
    prepararColecta(colecta({ id_colecta: 3, id_estado: 6, en_local_en: "2026-09-21T18:00:00Z" })),
    prepararColecta(colecta({ id_colecta: 4, id_estado: 4 })),
  ]);
  assert.deepEqual(visitadas.map((c) => c.id_colecta), [2, 1]);
});

test("el recorrido se pide solo para los elegidos y sin la tabla vuelve vacío", async (t) => {
  conEntorno(t, BASE);
  const pedidas: URL[] = [];
  let hayTabla = true;
  const simulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    pedidas.push(url);
    if (!hayTabla) return new Response(`{"code":"PGRST205"}`, { status: 404 });
    if (Number(url.searchParams.get("offset") ?? 0) > 0) return Response.json([]);
    return Response.json([
      { id_motoboy: 10, posicion_en: "2026-09-21T16:00:00Z", latitud: 19.4, longitud: -99.1 },
      { id_motoboy: 10, posicion_en: "2026-09-21T16:05:00Z", latitud: 19.41, longitud: -99.1 },
      { id_motoboy: 11, posicion_en: "2026-09-21T16:00:00Z", latitud: 19.5, longitud: -99.2 },
    ]);
  });
  t.after(() => simulado.mock.restore());

  const r = await leerRecorridos([10, 11, 10, -3, 1.5], DIA);
  assert.equal(r[10].length, 2);
  assert.equal(r[11].length, 1);
  assert.equal(pedidas[0].searchParams.get("id_motoboy"), "in.(10,11)", "ids repetidos o inválidos no entran");
  assert.equal(pedidas[0].searchParams.get("fecha_operacion"), `eq.${DIA}`);

  assert.deepEqual(await leerRecorridos([], DIA), {});
  hayTabla = false;
  assert.deepEqual(await leerRecorridos([10], DIA), {});
});

test("el flujo guarda en el recorrido solo posiciones válidas reportadas ese día", () => {
  const salida = correr("A columnas · recorrido", null, [
    FILA_SQL,
    { ...FILA_SQL, IdColecta: 2 },
    { ...FILA_SQL, IdMotoboy: 5, IdMotoboyReserva: 5, LatitudRepartidor: 0, LongitudRepartidor: 0 },
    // Reportó ayer a la noche en México: no es parte del recorrido de hoy.
    { ...FILA_SQL, IdMotoboy: 6, IdMotoboyReserva: 6, PosicionEn: "2026-09-21T04:00:00Z" },
  ]).map((x) => x.json);

  assert.deepEqual(salida, [
    { id_motoboy: 711802, posicion_en: "2026-09-21T18:58:00.000Z", fecha_operacion: DIA, latitud: 19.3292321, longitud: -99.2010625 },
  ]);
});
