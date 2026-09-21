import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  BODEGA,
  clasificarPaquete,
  clasificarRuta,
  colorDeClasificacion,
  colorDeDriver,
  coordenadaValida,
  desenlaceDe,
  diaDeOperacion,
  diaDePaquetes,
  distanciaKm,
  entregadosPorHora,
  enlaceAlOperador,
  estadosDelSistemaSinCategoria,
  estadoPosicion,
  estadoDemoraDriver,
  largoDeRuta,
  paqueteCoincideConBusqueda,
  paqueteUnicoDeBusqueda,
  proponerRuta,
  proyectarEn,
  porcentajeEntregado,
  recorridoPendiente,
  resumirRuta,
  rutaPorCercania,
  secuenciaConfiable,
  COLOR_CLASIFICACION,
  COLOR_DRIVER,
  type Clasificacion,
} from "../src/lib/tracker";
import { proyectar, ventanaProyeccion } from "../src/lib/cobertura";
import { leerTracker } from "../src/lib/tracker-datos";
import {
  ejecutarSync,
  registrarMotivoDemora,
  responderJornada,
} from "../src/app/api/live-tracker/nucleo";
import type { Operador } from "../src/lib/sesion";

/**
 * Pruebas del live tracker.
 *
 * Cubren las tres piezas por separado: las reglas puras, la lectura de la
 * jornada contra una base simulada y los endpoints. Lo que no se prueba acá es
 * el dibujo del SVG; para eso está la comprobación a mano que documenta el
 * README.
 */

const OPERADOR: Operador = { email: "operador@prueba.invalid", rol: "operador" };

/**
 * El SQL sin sus comentarios.
 *
 * Las consultas de este proyecto explican en prosa lo que hacen y lo que
 * deliberadamente no hacen —«no se usa LatitudDestino», «no hay un IN de ids
 * guardados»— así que buscar esos textos sobre el archivo entero encuentra
 * siempre la advertencia y nunca el código. Lo que hay que revisar es lo que
 * la base va a ejecutar.
 */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** La consulta de un nodo de un flujo, por nombre. */
function consultaDe(flujo: string, nodo: string): string {
  const json = JSON.parse(
    readFileSync(new URL(`../../n8n/${flujo}`, import.meta.url), "utf8"),
  ) as { nodes: { name: string; parameters: { query?: string } }[] };

  const encontrado = json.nodes.find((n) => n.name === nodo)?.parameters.query;
  assert.ok(encontrado, `el flujo ${flujo} no tiene un nodo "${nodo}" con consulta`);
  return encontrado;
}

/* ---------------------------------------------------------------------------
 * Andamiaje
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

function driver(over: Record<string, unknown> = {}) {
  return {
    id_motoboy: 7,
    nombre: "Ana",
    apellido: "Ruiz",
    latitud: 19.43,
    longitud: -99.13,
    fecha_ultima_posicion: new Date().toISOString(),
    ultima_movimiento_en: new Date().toISOString(),
    ultima_info: null,
    id_reserva: 100,
    id_localidad: 9,
    id_modalidad: 5,
    fecha_operacion: "2026-09-10",
    activo: true,
    primera_deteccion: "2026-09-10T12:00:00Z",
    ultima_deteccion: "2026-09-10T12:00:00Z",
    sincronizado_en: "2026-09-10T12:00:00Z",
    sync_id: "s1",
    minutos_sin_actualizar: 2,
    minutos_sin_movimiento: 2,
    estado_posicion: "RECIENTE",
    ...over,
  };
}

function paquete(over: Record<string, unknown> = {}) {
  return {
    id_viaje: 1,
    tracking_id: "1",
    referencia_auxiliar: null,
    id_usuario: 9,
    tienda: null,
    id_motoboy: 7,
    id_motoboy_balanceado: null,
    id_reserva: 100,
    id_ruta: 55,
    id_estado: 11,
    nombre_estado: "Retirado en camino a destino",
    orden: 1,
    direccion: "Calle 1",
    telefono: null,
    ciudad: null,
    barrio: null,
    codigo_postal: null,
    observacion_direccion: null,
    es_laboral: false,
    poligono: null,
    nombre_recibe: null,
    comentario_motoboy: null,
    comentario_estado: null,
    motivo_no_entregado: null,
    motivo_no_devuelto: null,
    evidencia_foto: null,
    evidencia_tipo: null,
    fecha_evidencia: null,
    latitud_destino: 19.44,
    longitud_destino: -99.14,
    visitado: false,
    fecha_visita: null,
    clasificacion: "PENDIENTE_NO_VISITADO",
    fecha_ruta: "2026-09-10",
    fecha_programado: null,
    fecha_programado_hasta: null,
    fecha_cambio_estado: null,
    activo_en_ruta: true,
    retirado_de_ruta_en: null,
    primera_deteccion: "2026-09-10T12:00:00Z",
    ultima_deteccion: "2026-09-10T12:00:00Z",
    sincronizado_en: "2026-09-10T12:00:00Z",
    sync_id: "s1",
    ...over,
  };
}

/**
 * Simula PostgREST. Devuelve lo que le corresponda a cada tabla y registra
 * todo lo que se le pidió, para poder afirmar también lo que NO se escribió.
 */
function baseSimulada(
  t: { mock: { method: typeof import("node:test").mock.method } },
  tablas: Record<string, unknown[]>,
) {
  const pedidos: { metodo: string; ruta: string }[] = [];

  const simulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const tabla = url.pathname.replace("/rest/v1/", "");
    pedidos.push({ metodo: init?.method ?? "GET", ruta: url.pathname });

    const offset = Number(url.searchParams.get("offset") ?? 0);
    const filas = tablas[tabla] ?? (tabla === "tracker_demoras" ? [] : undefined);
    if (filas === undefined) {
      return new Response(`{"code":"PGRST205"}`, { status: 404 });
    }
    return Response.json(offset === 0 ? filas : []);
  });

  return { pedidos, restore: () => simulado.mock.restore() };
}

/* ---------------------------------------------------------------------------
 * 1-2. Carga inicial
 * ------------------------------------------------------------------------- */

test("1. la jornada sin repartidores devuelve la pantalla vacía, no un error", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, { tracker_drivers_vista: [], tracker_paquetes: [], tracker_sincronizaciones: [] });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");
  assert.deepEqual(datos.drivers, []);
  assert.deepEqual(datos.huerfanos, []);
  assert.equal(datos.sincronizaciones.drivers, null);
  assert.equal(datos.dia, "2026-09-10");
});

test("2. con varios repartidores, cada uno queda con sus paquetes y su resumen", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ id_motoboy: 7 }), driver({ id_motoboy: 8, nombre: "Beto" })],
    tracker_paquetes: [
      paquete({ id_viaje: 1, id_motoboy: 7, orden: 1 }),
      paquete({ id_viaje: 2, id_motoboy: 7, orden: 2, nombre_estado: "Entregado", visitado: true }),
      paquete({ id_viaje: 3, id_motoboy: 8, orden: 1 }),
    ],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const { drivers } = await leerTracker("2026-09-10");
  assert.equal(drivers.length, 2);
  assert.deepEqual(drivers[0].paquetes.map((p) => p.id_viaje), [1, 2]);
  assert.deepEqual(drivers[1].paquetes.map((p) => p.id_viaje), [3]);
  assert.equal(drivers[0].resumen.entregados, 1);
  assert.equal(drivers[0].resumen.pendientes, 1);
  assert.equal(drivers[0].resumen.avance, 50);
  assert.deepEqual(drivers[0].rutas, [55]);
});

test("2b. el paquete conserva los datos y la evidencia que sincronizó el sistema", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [paquete({
      id_viaje: 300,
      direccion: "Calle Uno 20",
      poligono: "Norte",
      telefono: "5551234",
      observacion_direccion: "Portón azul",
      es_laboral: true,
      tienda: "Tienda Uno",
      evidencia_foto: "https://files.rapiboy.com/evidencia.jpg",
      evidencia_tipo: "foto_viaje",
    })],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const { drivers } = await leerTracker("2026-09-10");
  assert.equal(drivers[0].paquetes[0].poligono, "Norte");
  assert.equal(drivers[0].paquetes[0].telefono, "5551234");
  assert.equal(drivers[0].paquetes[0].es_laboral, true);
  assert.equal(drivers[0].paquetes[0].evidencia_foto, "https://files.rapiboy.com/evidencia.jpg");
});

test("2c. una fila sin evidencia conserva el dato nulo del sistema", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [paquete({ id_viaje: 301 })],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const { drivers } = await leerTracker("2026-09-10");
  assert.equal(drivers[0].paquetes[0].evidencia_foto, null);
});

/* ---------------------------------------------------------------------------
 * 3-4. Coordenadas
 * ------------------------------------------------------------------------- */

test("3. un repartidor sin coordenadas aparece igual, sin posición", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ latitud: null, longitud: null, estado_posicion: "SIN_POSICION" })],
    tracker_paquetes: [paquete()],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const { drivers } = await leerTracker("2026-09-10");
  assert.equal(drivers.length, 1, "sigue en el panel porque tiene una ruta");
  assert.equal(drivers[0].posicion, null, "pero no se lo dibuja en ningún lado");
  assert.equal(drivers[0].estadoPosicion, "SIN_POSICION");
  assert.deepEqual(drivers[0].poligonos, []);
});

test("4. las coordenadas inválidas se rechazan, incluido el (0, 0)", () => {
  assert.ok(coordenadaValida(19.43, -99.13));
  assert.ok(coordenadaValida(-33.4, 18.4));

  // El caso que más importa: es un par válido como número y no como posición.
  // Es lo que reporta un equipo sin señal, y cae en el Atlántico.
  assert.equal(coordenadaValida(0, 0), false);

  assert.equal(coordenadaValida(91, 0), false);
  assert.equal(coordenadaValida(-91, 0), false);
  assert.equal(coordenadaValida(0, 181), false);
  assert.equal(coordenadaValida(0, -181), false);
  assert.equal(coordenadaValida(NaN, 0), false);
  assert.equal(coordenadaValida(Infinity, 0), false);
  assert.equal(coordenadaValida(null, null), false);
  assert.equal(coordenadaValida("19.43", "-99.13"), false, "el texto no pasa: llegaría como NaN al SVG");
  assert.equal(coordenadaValida(undefined, 1), false);
});

test("4b. la proyección del cliente da exactamente lo mismo que la del servidor", () => {
  // Si las dos se separaran, los marcadores quedarían corridos respecto de los
  // polígonos del fondo, que se dibujan con la otra.
  const v = ventanaProyeccion();
  for (const punto of [
    { lon: -99.13, lat: 19.43 },
    { lon: -99.39, lat: 19.21 },
    { lon: -98.93, lat: 19.74 },
  ]) {
    assert.deepEqual(proyectarEn(punto, v), proyectar(punto));
  }
});

/* ---------------------------------------------------------------------------
 * 5-6. Selección
 * ------------------------------------------------------------------------- */

test("5-6. la API agrupa por repartidor y no mezcla paquetes entre rutas", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ id_motoboy: 7 }), driver({ id_motoboy: 8 }), driver({ id_motoboy: 9 })],
    tracker_paquetes: [
      paquete({ id_viaje: 1, id_motoboy: 7 }),
      paquete({ id_viaje: 2, id_motoboy: 8 }),
      paquete({ id_viaje: 3, id_motoboy: null }),
    ],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const { drivers, huerfanos } = await leerTracker("2026-09-10");
  const porId = new Map(drivers.map((d) => [d.id, d]));

  // La selección del navegador es una lista de ids, y cada id trae sus propios
  // paquetes: no hay forma de que el mapa mezcle rutas aunque quisiera.
  assert.deepEqual(porId.get(7)!.paquetes.map((p) => p.id_viaje), [1]);
  assert.deepEqual(porId.get(8)!.paquetes.map((p) => p.id_viaje), [2]);
  assert.equal(porId.has(9), false, "sin ruta activa no aparece en el tracker");

  // Un paquete sin repartidor no se le cuelga a nadie.
  assert.deepEqual(huerfanos.map((p) => p.id_viaje), [3]);

  // El color se deriva del id, así que no cambia cuando entra alguien nuevo.
  assert.equal(colorDeDriver(7), colorDeDriver(7));
  assert.notEqual(colorDeDriver(7), colorDeDriver(8));
});

/* ---------------------------------------------------------------------------
 * 7. Actualizar posiciones
 * ------------------------------------------------------------------------- */

test("7. actualizar posiciones dispara su webhook y devuelve el resumen real", async (t) => {
  conEntorno(t, { ...BASE, N8N_WEBHOOKS_TRACKER_POSICIONES: "https://n8n.invalid/webhook/tracker-posiciones" });

  let cuerpoEnviado: Record<string, unknown> = {};
  const simulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://n8n.invalid/webhook/tracker-posiciones");
    assert.equal(init?.method, "POST");
    cuerpoEnviado = JSON.parse(String(init?.body));
    return Response.json([
      { estado: "success", fecha_operacion: "2026-09-10", registros_leidos: 12,
        registros_insertados: 2, registros_actualizados: 10, registros_desactivados: 1,
        registros_omitidos: 3, registros_con_error: 0, mensaje_error: null },
    ]);
  });
  t.after(() => simulado.mock.restore());

  const respuesta = await ejecutarSync("trackerPosiciones", "drivers", OPERADOR);
  assert.equal(respuesta.status, 200);

  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.leidos, 12);
  assert.equal(cuerpo.insertados, 2);
  assert.equal(cuerpo.omitidos, 3, "los que se guardaron sin posición");
  assert.equal(cuerpo.desactivados, 1);

  // El día de la ruta visible decide también qué repartidores refrescar.
  assert.equal(cuerpoEnviado.dia, diaDePaquetes());
  assert.equal(cuerpoEnviado.zona, "America/Mexico_City");
  assert.equal(cuerpoEnviado.alcance, "trackerPosiciones");
});

test("7b. sin webhook cargado el botón lo dice, en vez de fallar en silencio", async (t) => {
  conEntorno(t, { ...BASE, N8N_WEBHOOKS_TRACKER_POSICIONES: "" });
  const respuesta = await ejecutarSync("trackerPosiciones", "drivers", OPERADOR);
  assert.equal(respuesta.status, 503);
  assert.match((await respuesta.json()).error, /N8N_WEBHOOKS_TRACKER_POSICIONES/);
});

/* ---------------------------------------------------------------------------
 * 8, 12, 13. Estados y desenlaces
 * ------------------------------------------------------------------------- */

test("8. la clasificación sale del nombre real del estado, sin inventar IdEstado", () => {
  // El vocabulario es el de `lib/estados.ts`, armado contra lo que devuelve
  // EstadoViaje.NombreCompleto de verdad.
  assert.equal(desenlaceDe("Entregado"), "ENTREGADO");
  assert.equal(desenlaceDe("Pedido no entregado"), "NO_ENTREGADO");
  assert.equal(desenlaceDe("En deposito"), "NO_ENTREGADO");
  assert.equal(desenlaceDe("Siniestrado"), "NO_ENTREGADO");
  assert.equal(desenlaceDe("Cancelado"), "CANCELADO");
  assert.equal(desenlaceDe("Retirado en camino a destino"), "EN_RUTA");
  assert.equal(desenlaceDe("Para retirar"), "EN_RUTA");

  // Un estado que nadie mapeó no se adivina.
  assert.equal(desenlaceDe("Estado nuevo que no conocemos"), "DESCONOCIDO");
  assert.equal(desenlaceDe(null), "DESCONOCIDO");
  assert.equal(
    clasificarPaquete({ nombre_estado: "Estado nuevo", visitado: false, activo_en_ruta: true }),
    "SIN_CLASIFICAR",
  );
});

test("12. un paquete entregado cuenta como visitado aunque falte la marca", () => {
  // No hay forma de entregar sin pasar: el estado es evidencia suficiente.
  assert.equal(
    clasificarPaquete({ nombre_estado: "Entregado", visitado: false, activo_en_ruta: true }),
    "VISITADO_ENTREGADO",
  );
});

test("13. no entregado exige evidencia de visita; sin ella queda sin clasificar", () => {
  assert.equal(
    clasificarPaquete({ nombre_estado: "Pedido no entregado", visitado: true, activo_en_ruta: true }),
    "VISITADO_NO_ENTREGADO",
  );

  // «Se intentó y no se pudo» sin ninguna visita registrada es una
  // contradicción. Se marca para que se note, no se cuenta como intento.
  assert.equal(
    clasificarPaquete({ nombre_estado: "Pedido no entregado", visitado: false, activo_en_ruta: true }),
    "SIN_CLASIFICAR",
  );
});

test("la tarjeta desglosa con los nombres de estado que informa el sistema", () => {
  assert.deepEqual(
    estadosDelSistemaSinCategoria([
      { clasificacion: "SIN_CLASIFICAR", nombre_estado: "Pedido no entregado" },
      { clasificacion: "SIN_CLASIFICAR", nombre_estado: "Pedido no entregado" },
      { clasificacion: "SIN_CLASIFICAR", nombre_estado: "En camino" },
      { clasificacion: "SIN_CLASIFICAR", nombre_estado: "  " },
      { clasificacion: "PENDIENTE_NO_VISITADO", nombre_estado: "Para retirar" },
    ]),
    [
      { estado: "Pedido no entregado", cantidad: 2 },
      { estado: "En camino", cantidad: 1 },
      { estado: "Estado no informado", cantidad: 1 },
    ],
  );
});

test("el buscador identifica una parada por sus datos y solo la enfoca si es única", () => {
  const primera = paquete({
    id_viaje: 30448011,
    tracking_id: "RAP-ABC-01",
    referencia_auxiliar: "PEDIDO-TIENDA-77",
    direccion: "Av. División del Norte 123",
    telefono: "5512345678",
    barrio: "Narvarte Poniente",
    codigo_postal: "03020",
    tienda: "Farmacia Central",
    nombre_recibe: "María López",
    nombre_estado: "Pedido no entregado",
    poligono: "Iztapalapa Norte B",
  });
  const segunda = paquete({
    id_viaje: 30448012,
    tracking_id: "RAP-ABC-02",
    direccion: "Av. División del Norte 900",
    telefono: "30448011",
  });
  const drivers = [
    { id: 7, paquetes: [primera] },
    { id: 8, paquetes: [segunda] },
  ];

  for (const texto of ["#30448011", "rap-abc-01", "pedido-tienda-77", "division del norte 123", "5512345678", "maria lopez", "03020", "farmacia central", "pedido no entregado", "iztapalapa norte b"]) {
    assert.equal(paqueteCoincideConBusqueda(primera, texto), true, texto);
    assert.equal(paqueteUnicoDeBusqueda(drivers, texto)?.paquete.id_viaje, 30448011, texto);
  }
  assert.equal(paqueteUnicoDeBusqueda(drivers, "division del norte"), null, "no elige entre dos domicilios");
  assert.equal(paqueteUnicoDeBusqueda(drivers, "30448011")?.driver.id, 7, "el IdViaje exacto gana sobre otro campo");
});

/* ---------------------------------------------------------------------------
 * 9-11. Reconciliación
 * ------------------------------------------------------------------------- */

test("9. un paquete agregado después de la carga inicial aparece solo, y el total sube", async (t) => {
  conEntorno(t, BASE);

  const treinta = Array.from({ length: 30 }, (_, i) =>
    paquete({ id_viaje: i + 1, tracking_id: String(i + 1), orden: i + 1 }));

  const primera = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: treinta,
    tracker_sincronizaciones: [],
  });
  const antes = await leerTracker("2026-09-10");
  primera.restore();
  assert.equal(antes.drivers[0].resumen.enRuta, 30);

  // La reconciliación vuelve a preguntar por la ruta entera, así que el
  // paquete 31 -que nadie conocía- entra sin que nadie reinicie nada.
  const segunda = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [...treinta, paquete({ id_viaje: 31, tracking_id: "31", orden: 31 })],
    tracker_sincronizaciones: [],
  });
  t.after(segunda.restore);

  const despues = await leerTracker("2026-09-10");
  assert.equal(despues.drivers[0].resumen.enRuta, 31);
  assert.ok(despues.drivers[0].paquetes.some((p) => p.tracking_id === "31"));
});

test("10. un paquete reasignado se mueve entero al repartidor nuevo", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ id_motoboy: 7 }), driver({ id_motoboy: 8 })],
    // Misma fila, misma clave: el upsert por id_viaje la movió de dueño.
    tracker_paquetes: [paquete({ id_viaje: 1, id_motoboy: 8, id_reserva: 200 })],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const { drivers } = await leerTracker("2026-09-10");
  const porId = new Map(drivers.map((d) => [d.id, d]));
  assert.equal(porId.has(7), false, "sin ruta activa deja de aparecer en el tracker");
  assert.deepEqual(porId.get(8)!.paquetes.map((p) => p.id_viaje), [1]);
});

test("11. un paquete retirado de ruta se marca, no se borra ni se cuenta en el avance", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [
      paquete({ id_viaje: 1, orden: 1 }),
      paquete({ id_viaje: 2, orden: 2, activo_en_ruta: false, retirado_de_ruta_en: "2026-09-10T15:00:00Z" }),
    ],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const { drivers } = await leerTracker("2026-09-10");
  const retirado = drivers[0].paquetes.find((p) => p.id_viaje === 2)!;

  assert.equal(retirado.clasificacion, "RETIRADO_DE_RUTA");
  assert.equal(drivers[0].resumen.retirados, 1);

  // Fuera del denominador: no es una parada que el repartidor tenga que
  // resolver, y contarla haría bajar el avance justo cuando le aligeran el día.
  assert.equal(drivers[0].resumen.enRuta, 1);
});

/* ---------------------------------------------------------------------------
 * 14-15. Orden
 * ------------------------------------------------------------------------- */

test("14. sin orden no se señala próximo destino y no se dibuja recorrido", () => {
  const ruta = clasificarRuta([
    { id_viaje: 1, orden: null, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
    { id_viaje: 2, orden: null, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
  ]);

  assert.equal(ruta.filter((p) => p.clasificacion === "PROXIMO").length, 0);
  assert.deepEqual(ruta.map((p) => p.clasificacion), ["PENDIENTE_NO_VISITADO", "PENDIENTE_NO_VISITADO"]);

  // Sin secuencia declarada no se inventa una línea.
  assert.deepEqual(recorridoPendiente(ruta), []);
  assert.deepEqual(secuenciaConfiable(ruta), { confiable: false, sinOrden: 2, duplicados: 0 });
});

test("15. con el orden mínimo empatado tampoco se elige próximo", () => {
  const empate = clasificarRuta([
    { id_viaje: 1, orden: 1, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
    { id_viaje: 2, orden: 1, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
    { id_viaje: 3, orden: 2, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
  ]);
  assert.equal(empate.filter((p) => p.clasificacion === "PROXIMO").length, 0);
  assert.deepEqual(secuenciaConfiable(empate), { confiable: false, sinOrden: 0, duplicados: 2 });

  // Los empatados quedan fuera de la línea; el que tiene orden propio entra.
  assert.deepEqual(recorridoPendiente(empate).map((p) => p.id_viaje), [3]);

  // Con el orden limpio, el próximo es el primero y la línea sale completa.
  const limpio = clasificarRuta([
    { id_viaje: 3, orden: 2, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
    { id_viaje: 1, orden: 1, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
  ]);
  assert.equal(limpio.find((p) => p.clasificacion === "PROXIMO")!.id_viaje, 1);
  assert.deepEqual(recorridoPendiente(limpio).map((p) => p.id_viaje), [1, 3]);
  assert.equal(secuenciaConfiable(limpio).confiable, true);

  // Un entregado no compite por ser el próximo aunque tenga el orden más bajo.
  const conEntregado = clasificarRuta([
    { id_viaje: 1, orden: 1, nombre_estado: "Entregado", visitado: true, activo_en_ruta: true },
    { id_viaje: 2, orden: 2, nombre_estado: "Para retirar", visitado: false, activo_en_ruta: true },
  ]);
  assert.equal(conEntregado.find((p) => p.clasificacion === "PROXIMO")!.id_viaje, 2);
});

/* ---------------------------------------------------------------------------
 * 16-19. Fallas y concurrencia
 * ------------------------------------------------------------------------- */

test("16. un error de SQL Server llega como falla del flujo, sin romper la pantalla", async (t) => {
  conEntorno(t, { ...BASE, N8N_WEBHOOKS_TRACKER_PAQUETES: "https://n8n.invalid/webhook/tracker-paquetes" });
  const simulado = t.mock.method(globalThis, "fetch", async () =>
    new Response("Invalid object name 'dbo.Viaje'.", { status: 500 }));
  t.after(() => simulado.mock.restore());

  const respuesta = await ejecutarSync("trackerPaquetes", "paquetes", OPERADOR);
  assert.equal(respuesta.status, 502);
  assert.equal((await respuesta.json()).ok, false);
});

test("17. la base caída y la tabla faltante se distinguen", async (t) => {
  conEntorno(t, BASE);

  // Tabla faltante: es el estado normal antes de correr el script, no una falla.
  const falta = baseSimulada(t, { tracker_paquetes: [], tracker_sincronizaciones: [] });
  const sinTabla = await responderJornada(OPERADOR);
  falta.restore();
  assert.equal(sinTabla.status, 503);
  assert.match((await sinTabla.json()).error, /live-tracker\.sql/);

  // Base caída: el detalle no sale al navegador, porque puede traer domicilios.
  const rota = t.mock.method(globalThis, "fetch", async () =>
    new Response("select * from tracker_paquetes where direccion = 'Calle Falsa 123'", { status: 500 }));
  const errorSilencioso = t.mock.method(console, "error", () => {});
  const caida = await responderJornada(OPERADOR);
  rota.mock.restore();
  errorSilencioso.mock.restore();

  assert.equal(caida.status, 502);
  const cuerpo = await caida.json();
  assert.equal(cuerpo.error, "No se pudo leer la jornada desde la base.");
  assert.ok(!JSON.stringify(cuerpo).includes("Calle Falsa"), "el detalle no viaja al navegador");
});

test("18-19. dos corridas del mismo tipo: la segunda se rechaza con un mensaje que se entiende", async (t) => {
  conEntorno(t, { ...BASE, N8N_WEBHOOKS_TRACKER_PAQUETES: "https://n8n.invalid/webhook/tracker-paquetes" });
  const simulado = t.mock.method(globalThis, "fetch", async () =>
    new Response(`{"message":"Ya hay una sincronización de paquetes en curso.","code":"lock_not_available"}`,
      { status: 500 }));
  t.after(() => simulado.mock.restore());

  const respuesta = await ejecutarSync("trackerPaquetes", "paquetes", OPERADOR);

  // 409 y no 502: no es una falla, es que alguien más ya está corriendo lo mismo.
  assert.equal(respuesta.status, 409);
  assert.match((await respuesta.json()).error, /en curso/);
});

/* ---------------------------------------------------------------------------
 * 20-21. Lo que se conserva
 * ------------------------------------------------------------------------- */

test("20. releer no cambia la identidad de los repartidores: la selección sobrevive", async (t) => {
  conEntorno(t, BASE);

  const primera = baseSimulada(t, {
    tracker_drivers_vista: [driver({ id_motoboy: 7 }), driver({ id_motoboy: 8 })],
    tracker_paquetes: [paquete({ id_viaje: 1, id_motoboy: 7 })],
    tracker_sincronizaciones: [],
  });
  const antes = await leerTracker("2026-09-10");
  primera.restore();

  // Segunda lectura: se movieron las posiciones y entró un paquete nuevo.
  const segunda = baseSimulada(t, {
    tracker_drivers_vista: [
      driver({ id_motoboy: 7, latitud: 19.5, longitud: -99.2 }),
      driver({ id_motoboy: 8 }),
    ],
    tracker_paquetes: [paquete({ id_viaje: 1, id_motoboy: 7 }), paquete({ id_viaje: 9, id_motoboy: 7, orden: 2 })],
    tracker_sincronizaciones: [],
  });
  t.after(segunda.restore);
  const despues = await leerTracker("2026-09-10");

  // La selección del navegador es una lista de ids. Mientras los ids sean los
  // mismos, la pantalla conserva quién estaba elegido.
  assert.deepEqual(antes.drivers.map((d) => d.id), despues.drivers.map((d) => d.id));
  assert.notDeepEqual(antes.drivers[0].posicion, despues.drivers[0].posicion, "la posición sí cambió");
  assert.equal(despues.drivers[0].paquetes.length, 2);
});

test("21. una sincronización fallida no escribe una sola fila en Supabase", async (t) => {
  conEntorno(t, { ...BASE, N8N_WEBHOOKS_TRACKER_PAQUETES: "https://n8n.invalid/webhook/tracker-paquetes" });

  const llamadas: { url: string; metodo: string }[] = [];
  const simulado = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(input), metodo: init?.method ?? "GET" });
    return new Response("se cayó la conexión", { status: 500 });
  });
  t.after(() => simulado.mock.restore());

  await ejecutarSync("trackerPaquetes", "paquetes", OPERADOR);

  // El endpoint no escribe: quien escribe es n8n, con su propia credencial y
  // dentro de su transacción. Si esto tocara la base habría dos caminos de
  // escritura y el sync_id dejaría de contar la historia completa.
  assert.deepEqual(llamadas.map((l) => l.url), ["https://n8n.invalid/webhook/tracker-paquetes"]);
  assert.ok(!llamadas.some((l) => l.url.includes("base-de-prueba")));
});

/* ---------------------------------------------------------------------------
 * 22. Puertas cerradas
 * ------------------------------------------------------------------------- */

test("22. sin sesión no se lee la jornada ni se dispara ningún flujo", async (t) => {
  conEntorno(t, { ...BASE, N8N_WEBHOOKS_TRACKER_POSICIONES: "https://n8n.invalid/webhook/x" });

  const simulado = t.mock.method(globalThis, "fetch", async () => {
    assert.fail("no se puede salir a la red sin sesión");
  });
  t.after(() => simulado.mock.restore());

  for (const respuesta of [
    await responderJornada(null),
    await ejecutarSync("trackerPosiciones", "drivers", null),
    await ejecutarSync("trackerPaquetes", "paquetes", null),
  ]) {
    assert.equal(respuesta.status, 401);
    assert.equal((await respuesta.json()).ok, false);
  }
  assert.equal(simulado.mock.callCount(), 0);
});

test("el motivo de una demora guarda datos verificados por el servidor", async () => {
  let insercion: { tabla: string; fila: Record<string, unknown> } | null = null;
  const respuesta = await registrarMotivoDemora(
    OPERADOR,
    {
      idDriver: 7,
      motivo: "Rotura de la moto; no continuará la ruta",
      confirmaQueNoContinua: true,
    },
    new Date("2026-09-10T22:00:00Z"), // 16:00 MX
    {
      leer: async () => ({
        dia: "2026-09-10",
        tablasFaltantes: [],
        drivers: [{
          id: 7,
          nombre: "Ana Ruiz",
          fechaUltimoMovimiento: "2026-09-10T21:00:00Z",
          paquetes: [
            { orden: 1, visitado: true, clasificacion: "VISITADO_ENTREGADO", activo_en_ruta: true },
            { orden: 2, visitado: false, clasificacion: "PENDIENTE_NO_VISITADO", activo_en_ruta: true },
          ],
          demoraInformada: null,
        }],
      }) as unknown as Awaited<ReturnType<typeof leerTracker>>,
      insertar: async (tabla, fila) => {
        insercion = { tabla, fila };
        return null;
      },
    },
  );

  assert.equal(respuesta.status, 200);
  assert.deepEqual(insercion, {
    tabla: "tracker_demoras",
    fila: {
      fecha_operacion: "2026-09-10",
      id_motoboy: 7,
      nombre_driver: "Ana Ruiz",
      motivo: "Rotura de la moto; no continuará la ruta",
      ultima_movimiento_en: "2026-09-10T21:00:00Z",
      paquetes_sin_visitar: 1,
      registrado_por: OPERADOR.email,
    },
  });
});

test("no se puede silenciar una demora sin confirmar que el driver deja la ruta", async () => {
  const respuesta = await registrarMotivoDemora(OPERADOR, {
    idDriver: 7,
    motivo: "Está cargando combustible",
    confirmaQueNoContinua: false,
  });
  assert.equal(respuesta.status, 400);
  assert.match((await respuesta.json()).error, /Confirmá/);
});

test("22b. el esquema deja RLS prendido, sin políticas y con la vista en security_invoker", () => {
  const sql = sinComentarios(
    readFileSync(fileURLToPath(new URL("../supabase/live-tracker.sql", import.meta.url)), "utf8"));

  for (const tabla of [
    "tracker_drivers",
    "tracker_paquetes",
    "tracker_sincronizaciones",
    "tracker_demoras",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabla}\\s+enable row level security`),
      `${tabla} tiene que quedar con RLS`);
  }

  // Sin políticas: nadie lee con la anon key. El navegador nunca habla con
  // estas tablas; lee la web, desde el servidor y con el login del sitio.
  assert.ok(!/create policy/i.test(sql), "una política acá abriría la tabla al navegador");

  // Sin esto, la vista correría con los permisos de quien la creó y sería una
  // puerta de entrada a una tabla que tiene RLS justamente para evitarlo.
  assert.match(sql, /with \(security_invoker = true\)/);

  // Las funciones de sincronización no son públicas y no son security definer.
  assert.ok(!/security definer/i.test(sql));
  for (const fn of [
    "tracker_abrir_sync",
    "tracker_liberar_lock",
    "tracker_cerrar_drivers",
    "tracker_cerrar_paquetes",
    "tracker_fallar_sync",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[^;]*from public;`));
  }

  // Las de cierre cuentan solas: si volvieran a recibir el total, el nodo que
  // cierra tendría que ir a buscarlo a otro nodo y volvería el problema.
  for (const fn of ["tracker_cerrar_drivers", "tracker_cerrar_paquetes"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(\\s*p_sync\\s+uuid,\\s*p_fecha\\s+date\\s*\\)`), fn);
  }
});

test("el rechazo del lock arma el mensaje con format(), no con marcadores de RAISE", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../supabase/live-tracker.sql", import.meta.url)), "utf8");

  /*
   * RAISE no entiende `%L` ni `%s`: para él todo `%` es «acá va el siguiente
   * argumento». Un `%L` en la plantilla de RAISE dejaría una L suelta pegada al
   * texto y correría el resto de los valores un lugar, así que el mensaje que
   * lee quien se topa con el lock diría cualquier cosa. Se arma con `format()`
   * y RAISE lo lanza entero.
   */
  const raises = [...sql.matchAll(/raise exception\s+('(?:[^']|'')*')/g)].map((m) => m[1]);
  assert.ok(raises.length > 0, "no se encontró ningún raise");

  for (const plantilla of raises) {
    assert.ok(
      !/%[a-zA-Z]/.test(plantilla),
      `una plantilla de RAISE usa marcadores de format(): ${plantilla}`,
    );
  }

  // Y la migración tiene que traer la misma corrección.
  const migracion = readFileSync(
    fileURLToPath(new URL("../supabase/migracion-05-tracker-lock.sql", import.meta.url)), "utf8");
  for (const plantilla of [...migracion.matchAll(/raise exception\s+('(?:[^']|'')*')/g)].map((m) => m[1])) {
    assert.ok(!/%[a-zA-Z]/.test(plantilla), `la migración usa marcadores de format() en RAISE: ${plantilla}`);
  }

  // La migración es idempotente y transaccional: se puede volver a correr.
  assert.ok(!/create table|drop table|alter table/i.test(sinComentarios(migracion)),
    "la migración del lock no debe tocar tablas");
  assert.match(migracion, /^begin;/m);
  assert.match(migracion, /^commit;/m);
  assert.equal((migracion.match(/create or replace function/g) ?? []).length, 4);

  /*
   * Y las de cierre tienen que dropearse antes.
   *
   * `create or replace` no reemplaza una función cuya firma cambió: crea una
   * sobrecarga al lado de la vieja. Las dos convivirían y una llamada con tres
   * argumentos seguiría entrando por la anterior sin que nada avise. Encima
   * PostgreSQL rechaza un `replace` que cambie el tipo de retorno, y acá
   * cambió, así que sin el drop la migración ni siquiera corre.
   */
  const limpia = sinComentarios(migracion);
  for (const fn of ["tracker_cerrar_drivers", "tracker_cerrar_paquetes"]) {
    assert.match(
      limpia,
      new RegExp(`drop function if exists public\\.${fn}\\(uuid, date, integer\\);`),
      `la migración no dropea la versión vieja de ${fn}`,
    );
    assert.ok(
      limpia.indexOf(`drop function if exists public.${fn}`) <
        limpia.indexOf(`create or replace function public.${fn}`),
      `el drop de ${fn} tiene que ir antes del create`,
    );
  }
});

/* ---------------------------------------------------------------------------
 * Los flujos de n8n
 * ------------------------------------------------------------------------- */

function flujo(archivo: string) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../n8n/${archivo}`, import.meta.url)), "utf8"));
}

test("los flujos no traen credenciales ni se importan activos", () => {
  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    const f = flujo(archivo);
    const texto = JSON.stringify(f);

    assert.equal(f.active, false, `${archivo} tiene que importarse apagado`);

    // Las credenciales van por referencia, nunca por valor.
    assert.ok(!/password|apikey|api_key|service_role|secret/i.test(texto), archivo);
    for (const nodo of f.nodes) {
      for (const cred of Object.values(nodo.credentials ?? {}) as { id: string }[]) {
        assert.ok(["REEMPLAZAR", "F5EJUfXcquXz7Rf3"].includes(cred.id), `${archivo}: ${cred.id}`);
      }
    }
  }
});

test("cada nodo de base declara su operación, o n8n no muestra la consulta", () => {
  /*
   * Un `microsoftSql` o un `postgres` sin `operation` se importa igual y sin
   * ningún error: n8n cae en la operación por defecto del nodo, que no es
   * «ejecutar consulta», y el campo con el SQL directamente no aparece en
   * pantalla. El flujo queda mudo y el JSON parece perfecto.
   *
   * Los flujos 01 a 07 lo traen siempre. Esta prueba compara contra ellos en
   * vez de contra una lista escrita a mano, así que si mañana n8n cambia el
   * nombre de la clave, se entera por los que ya funcionan en producción.
   */
  const NODOS_DE_BASE = ["n8n-nodes-base.microsoftSql", "n8n-nodes-base.postgres"];

  const deBase = (archivo: string) =>
    flujo(archivo).nodes.filter((n: { type: string }) => NODOS_DE_BASE.includes(n.type));

  const referencia = deBase("02-refresco-estados.json");
  assert.ok(referencia.length > 0, "no se encontró el flujo de referencia");
  for (const nodo of referencia) {
    assert.ok(nodo.parameters.operation, `el flujo 02 cambió: ${nodo.name} ya no declara operation`);
  }

  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    const nodos = deBase(archivo);
    assert.ok(nodos.length > 0, archivo);

    for (const nodo of nodos) {
      assert.ok(nodo.parameters.operation, `${archivo}: ${nodo.name} no declara operation`);

      // Y el que dice ejecutar una consulta tiene que traerla, no vacía.
      if (nodo.parameters.operation === "executeQuery") {
        assert.equal(typeof nodo.parameters.query, "string", `${archivo}: ${nodo.name} sin query`);
        assert.ok(
          sinComentarios(nodo.parameters.query).trim().length > 0,
          `${archivo}: ${nodo.name} tiene una query que es solo comentarios`,
        );
      }

      // Y el que hace upsert tiene que decir por qué columna casa las filas: sin
      // `matchingColumns` insertaría una fila nueva en cada corrida en vez de
      // pisar la que ya está, y una reasignación se vería como dos paquetes.
      if (nodo.parameters.operation === "upsert") {
        assert.ok(
          (nodo.parameters.columns?.matchingColumns ?? []).length > 0,
          `${archivo}: ${nodo.name} no declara matchingColumns`,
        );
      }
    }
  }
});

test("ningún nodo puede fallar dejando la sincronización abierta para siempre", () => {
  /*
   * Una corrida que muere sin cerrar deja su fila en `running`, y con ella el
   * lock: el botón contesta «ya hay una en curso» hasta que vence el timeout.
   * Pasó de verdad -el flujo de paquetes se cortó en un nodo sin rama de error
   * y quedó colgado- así que acá se exige que todo nodo que pueda fallar tenga
   * a dónde ir.
   *
   * Las excepciones son los nodos anteriores a que exista la fila. `Día de
   * operación` corre antes de abrirla y `Abrir sincronización` es la que la
   * crea: si cualquiera de los dos falla no hay nada que marcar, y la falla
   * típica del segundo es «ya hay otra en curso», que justamente no debe pisar
   * la corrida ajena. Los dos últimos son la rama de error misma.
   */
  const EXENTOS = new Set([
    "Día de operación",
    "Abrir sincronización",
    "Motivo de la falla",
    "Marcar falla",
  ]);

  // El nodo «Resumen» se eliminó: la función de cierre ya devuelve el resumen
  // entero, incluidos omitidos y errores. Un nodo menos es una lectura cruzada
  // menos.
  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    assert.ok(
      !flujo(archivo).nodes.some((n: { name: string }) => n.name === "Resumen"),
      `${archivo}: volvió el nodo Resumen`,
    );
  }

  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    const f = flujo(archivo);
    const tipos = new Map<string, string>(
      f.nodes.map((n: { name: string; type: string }) => [n.name, n.type]),
    );

    for (const nodo of f.nodes as { name: string; type: string; onError?: string }[]) {
      if (nodo.type.includes("Trigger") || nodo.type.endsWith(".webhook")) continue;
      if (EXENTOS.has(nodo.name)) continue;

      assert.equal(
        nodo.onError,
        "continueErrorOutput",
        `${archivo}: ${nodo.name} puede fallar y no tiene rama de error`,
      );

      /*
       * Y la rama tiene que salir por el índice correcto. En n8n la salida de
       * error es la que va DESPUÉS de las propias del nodo: la 1 en uno normal,
       * pero la 2 en un If, que ya usa la 0 y la 1 para verdadero y falso.
       * Confundirlas manda «no hubo paquetes» -un final normal- al marcador de
       * fallas, y la jornada queda registrada como rota sin estarlo.
       */
      const salidas = f.connections[nodo.name]?.main ?? [];
      const indiceError = tipos.get(nodo.name) === "n8n-nodes-base.if" ? 2 : 1;

      assert.deepEqual(
        (salidas[indiceError] ?? []).map((d: { node: string }) => d.node),
        ["Motivo de la falla"],
        `${archivo}: ${nodo.name} no cablea su error en la salida ${indiceError}`,
      );

      if (indiceError === 2) {
        assert.ok(
          !(salidas[1] ?? []).some((d: { node: string }) => d.node === "Motivo de la falla"),
          `${archivo}: ${nodo.name} manda su rama falsa al marcador de fallas`,
        );
      }
    }

    // Y el marcador tiene que desembocar en la función que cierra la corrida.
    assert.deepEqual(
      f.connections["Motivo de la falla"].main[0].map((d: { node: string }) => d.node),
      ["Marcar falla"],
      archivo,
    );
  }
});

test("las expresiones solo nombran nodos que existen, y la rama de error no nombra ninguno", () => {
  /*
   * `ExpressionError: Node 'X' hasn't been executed` es el error que más cuesta
   * leer de n8n, porque tapa al de verdad: el flujo muere, y el mensaje habla
   * de un nodo que no tiene nada que ver.
   *
   * Sale por dos motivos. Uno es un nombre que no coincide -y con acentos y
   * puntos medios en los nombres, un carácter distinto no se ve a simple
   * vista-. El otro es referenciar un nodo que en esa corrida no llegó a
   * ejecutarse.
   */
  const expresiones = (texto: string): string[] =>
    [...texto.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]);

  const nodosNombrados = (texto: string): string[] =>
    expresiones(texto).flatMap((e) =>
      [...e.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    );

  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    const f = flujo(archivo);
    const existentes = new Set<string>(f.nodes.map((n: { name: string }) => n.name));

    for (const nodo of f.nodes as { name: string; parameters: Record<string, string> }[]) {
      const texto = `${nodo.parameters.query ?? ""}\n${nodo.parameters.jsCode ?? ""}`;

      for (const nombrado of nodosNombrados(texto)) {
        assert.ok(
          existentes.has(nombrado),
          `${archivo}: ${nodo.name} nombra a «${nombrado}», que no existe en el flujo`,
        );
      }

      /*
       * Y ninguna expresión puede nombrar a otro nodo, exista o no.
       *
       * `$('Otro nodo')` dentro de `{{ }}` depende de que n8n pueda rastrear la
       * cadena de items hasta ahí. Cuando esa cadena se corta -y se corta sola,
       * por ejemplo cuando un Code node devuelve un item nuevo- n8n responde
       * «el nodo no se ejecutó» y mata la corrida, con un mensaje que habla de
       * un nodo que no tiene nada que ver. Fue exactamente lo que rompió el
       * flujo de paquetes mientras el de repartidores, idéntico, funcionaba.
       *
       * La regla es que cada nodo lea de su entrada directa. Lo que haga falta
       * más abajo se arrastra en los datos: `Abrir sincronización` devuelve el
       * día, la consulta de SQL Server pega sync_id y día en cada fila, y el
       * cierre los toma de ahí.
       *
       * En un Code node sí se permite, porque ahí se puede atajar con
       * try/catch. Una expresión no.
       */
      const enExpresion = nodosNombrados(nodo.parameters.query ?? "");
      assert.deepEqual(
        enExpresion,
        [],
        `${archivo}: ${nodo.name} lee a través del grafo en una expresión (${enExpresion.join(", ")})`,
      );

      /*
       * La rama de error es la última línea de defensa contra una corrida que
       * queda en `running` reteniendo el lock, así que no puede depender de que
       * otro nodo haya corrido. `Motivo de la falla` sí lo consulta, pero desde
       * un Code node y con try/catch: eso se puede atajar, una expresión no.
       */
      if (nodo.name === "Marcar falla") {
        assert.deepEqual(
          nodosNombrados(texto),
          [],
          `${archivo}: Marcar falla no puede depender de otro nodo en una expresión`,
        );
        assert.match(nodo.parameters.query, /nullif\('\{\{ \$json\.sync_id \}\}', ''\)/, archivo);
      }

      if (nodo.name === "Motivo de la falla") {
        assert.match(nodo.parameters.jsCode, /try\s*\{[\s\S]*\$\('Abrir sincronización'\)/, archivo);
        assert.match(nodo.parameters.jsCode, /catch/, archivo);
      }
    }
  }
});

test("el día viaja como texto, no como date", () => {
  /*
   * `'...'::date as dia` hacía que el driver de Postgres lo entregara como Date
   * de JS, y n8n lo serializa `2026-09-09T00:00:00.000Z`. Ese texto entraba tal
   * cual en `DECLARE @Dia DATE = '...'` de SQL Server y el filtro dejaba de
   * encontrar nada: el flujo de repartidores pasó de 103 filas a 0 con la misma
   * fecha, y sin ningún error de por medio, que es lo peor del caso.
   */
  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    const f = flujo(archivo);
    const abrir = f.nodes.find((n: { name: string }) => n.name === "Abrir sincronización");
    assert.match(
      abrir.parameters.query,
      /to_char\('\{\{ \$json\.dia \}\}'::date, 'YYYY-MM-DD'\) as dia/,
      `${archivo}: el día tiene que salir como texto YYYY-MM-DD`,
    );

    // Y la consulta de SQL Server lo toma de su entrada directa.
    const sql = f.nodes.find(
      (n: { type: string }) => n.type === "n8n-nodes-base.microsoftSql",
    );
    assert.match(sql.parameters.query, /DECLARE @Dia\s+DATE = '\{\{ \$json\.dia \}\}'/, archivo);

    // El upsert devuelve DATE como objeto Date. El cierre no puede interpolarlo
    // directo porque n8n lo convierte a "Thu Sep ...", inválido para Postgres.
    const cerrar = f.nodes.find((n: { name: string }) => n.name === "Cerrar sincronización");
    const campo = archivo.startsWith("08-") ? "fecha_operacion" : "fecha_ruta";
    assert.match(
      cerrar.parameters.query,
      new RegExp(`new Date\\(\\$json\\.${campo}\\)\\.toISOString\\(\\)\\.slice\\(0, 10\\)`),
      `${archivo}: el cierre normaliza la fecha a YYYY-MM-DD`,
    );
  }
});

test("el universo de paquetes se acota por comercio, como el resto del tablero", () => {
  const consulta = sinComentarios(
    flujo("09-tracker-paquetes.json").nodes
      .find((n: { name: string }) => n.name === "Paquetes de las rutas del día").parameters.query);

  // Mismo alcance que Mensual, Ayer y Cancelados, para que los totales de esta
  // pantalla se puedan comparar con los de las otras.
  assert.match(consulta, /INNER JOIN dbo\.Usuario\s+U\s+WITH \(NOLOCK\) ON U\.Id = V\.IdUsuario/);
  assert.match(consulta, /U\.IdModalidad = 5/);
  assert.match(consulta, /U\.IdLocalidad = 9/);
});

test("la ficha del tracker se completa desde RapiboyData y no desde Mensual", () => {
  const flujoPaquetes = flujo("09-tracker-paquetes.json");
  const consulta = sinComentarios(
    flujoPaquetes.nodes
      .find((n: { name: string }) => n.name === "Paquetes y detalle del sistema").parameters.query,
  );

  for (const tabla of ["dbo.Viaje", "dbo.Direccion", "dbo.Poligono", "dbo.HistorialViaje", "dbo.FotoViaje"]) {
    assert.match(consulta, new RegExp(tabla.replace(/\./g, "\\.")));
  }
  assert.match(consulta, /COALESCE\(FV\.Foto, HF\.Foto/);
  assert.equal(flujoPaquetes.connections["Abrir sincronización"].main[0][0].node, "Paquetes y detalle del sistema");
});

test("la reconciliación de paquetes no parte de los ids ya guardados", () => {
  const consulta = sinComentarios(
    flujo("09-tracker-paquetes.json").nodes
      .find((n: { name: string }) => n.name === "Paquetes de las rutas del día").parameters.query);

  // Esta es la regla que hace que un paquete agregado a media mañana aparezca.
  // Con un `IN (...)` de los tracking id guardados, nunca se preguntaría por él.
  assert.ok(!/\bV\.Id\s+IN\b/i.test(consulta), "el universo lo define la ruta, no lo guardado");
  assert.ok(!/ids_concat/.test(consulta));

  // El universo son las reservas del día, con rango semiabierto y sin envolver
  // la columna filtrada en una función.
  assert.match(consulta, /R\.Fecha\s*>=\s*@Dia/);
  assert.match(consulta, /R\.Fecha\s*<\s*@Hasta/);
  assert.ok(!/CAST\(R\.Fecha AS DATE\)\s*=/.test(consulta));

  // Solo lectura: ningún flujo del tracker escribe en SQL Server.
  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    for (const nodo of flujo(archivo).nodes) {
      if (nodo.type !== "n8n-nodes-base.microsoftSql") continue;
      assert.ok(
        !/\b(insert|update|delete|merge|drop|truncate|alter)\b/i.test(sinComentarios(nodo.parameters.query)),
        `${archivo}: ${nodo.name} tiene que ser de solo lectura`,
      );
    }
  }
});

test("la posición del repartidor sale de Motoboy y nunca del destino del viaje", () => {
  const drivers = sinComentarios(
    flujo("08-tracker-drivers.json").nodes
      .find((n: { name: string }) => n.name === "Repartidores del día").parameters.query);

  assert.match(drivers, /M\.Latitud/);
  assert.match(drivers, /M\.Longitud/);
  assert.ok(!/LatitudDestino/.test(drivers), "eso es a dónde va el paquete, no dónde está él");

  // Y el mapeo del tracker nunca escribe latitud del driver desde el destino.
  const mapeo = flujo("09-tracker-paquetes.json").nodes
    .find((n: { name: string }) => n.name === "A columnas · paquetes").parameters.jsCode;
  assert.match(mapeo, /latitud_destino/);
  assert.ok(!/(^|[^_])latitud:/m.test(mapeo), "el paquete no tiene posición de repartidor");
});

test("la antigüedad de la posición corrige la zona de origen argentina", () => {
  const flujoDrivers = flujo("08-tracker-drivers.json");
  const correccion = flujoDrivers.nodes.find(
    (n: { name: string }) => n.name === "Corregir zona de posición",
  );
  assert.ok(correccion, "el flujo normaliza el reloj que devuelve Motoboy");
  assert.match(correccion.parameters.jsCode, /3 \* 60 \* 60 \* 1000/);
  assert.match(correccion.parameters.jsCode, /UltimaActualizacion/);
});

test("la clasificación de n8n y la de la web dan siempre el mismo resultado", () => {
  /*
   * La regla vive en dos lados por necesidad: la web la usa para pintar y n8n
   * para dejarla consultable en la base. Esta prueba extrae la implementación
   * del flujo y la corre contra la del tablero sobre todas las combinaciones,
   * que es lo único que evita que se separen en silencio.
   */
  const codigo = flujo("09-tracker-paquetes.json").nodes
    .find((n: { name: string }) => n.name === "A columnas · paquetes").parameters.jsCode;

  const desde = codigo.indexOf("const DESENLACE");
  const hasta = codigo.indexOf("const filas");
  assert.ok(desde > 0 && hasta > desde, "cambió la forma del nodo: revisá esta prueba");

  const clasificarN8n = new Function(
    `${codigo.slice(desde, hasta)}; return clasificar;`,
  )() as (estado: string | null, visitado: boolean, activo: boolean) => Clasificacion;

  const estados = [
    "Entregado", "Pedido no entregado", "En deposito", "Siniestrado", "Devuelto",
    "Devolucion", "Cancelado", "Retirado en camino a destino", "Para retirar",
    "Por colectar", "Colectado", "Reprogramado por comprador",
    "ENTREGADO", "  entregado  ", "Estado inventado", null,
  ];

  for (const nombre_estado of estados) {
    for (const visitado of [true, false]) {
      for (const activo_en_ruta of [true, false]) {
        assert.equal(
          clasificarN8n(nombre_estado, visitado, activo_en_ruta),
          clasificarPaquete({ nombre_estado, visitado, activo_en_ruta }),
          `difieren en ${nombre_estado} / visitado=${visitado} / activo=${activo_en_ruta}`,
        );
      }
    }
  }
});

/* ---------------------------------------------------------------------------
 * El día de operación
 * ------------------------------------------------------------------------- */

test("el día es el de México, aunque en Argentina ya sea otro", () => {
  /*
   * El caso que importa: son las 00:30 en Buenos Aires y en México todavía son
   * las 21:30 del día anterior. La jornada mexicana sigue abierta, así que los
   * paquetes que hay que mostrar son los de ESE día, no los de la jornada nueva
   * que en México todavía no empezó.
   *
   * Ciudad de México está tres horas detrás de Buenos Aires, así que la
   * ventana en la que las dos fechas no coinciden va de la medianoche a las
   * tres de la mañana argentinas.
   */
  assert.equal(diaDeOperacion(new Date("2026-09-11T03:00:00Z")), "2026-09-10"); // 00:00 ARG
  assert.equal(diaDeOperacion(new Date("2026-09-11T05:59:00Z")), "2026-09-10"); // 02:59 ARG

  // A las tres de la mañana argentinas México cruza la medianoche y recién ahí
  // cambia la jornada.
  assert.equal(diaDeOperacion(new Date("2026-09-11T06:00:00Z")), "2026-09-11"); // 03:00 ARG

  // Y durante el día no hay ninguna diferencia.
  assert.equal(diaDeOperacion(new Date("2026-09-10T18:00:00Z")), "2026-09-10"); // 15:00 ARG

  /*
   * El corte se resuelve con `Intl` y no restando seis horas. Hoy ninguno de
   * los dos países usa horario de verano, pero México lo dejó en 2022 y podría
   * volver: una constante movería el corte del día durante medio año sin que
   * nada avise. Esto se comprueba mirando un día de enero y uno de julio, que
   * es cuando un horario de verano estaría prendido o apagado.
   */
  assert.equal(diaDeOperacion(new Date("2026-01-15T05:30:00Z")), "2026-01-14");
  assert.equal(diaDeOperacion(new Date("2026-07-15T05:30:00Z")), "2026-07-14");
});

test("los paquetes cambian de ayer a hoy a las 15:00 de México", () => {
  assert.equal(diaDePaquetes(new Date("2026-09-10T20:59:00Z")), "2026-09-09");
  assert.equal(diaDePaquetes(new Date("2026-09-10T21:00:00Z")), "2026-09-10");

  // El retroceso también tiene que cruzar correctamente mes y año.
  assert.equal(diaDePaquetes(new Date("2026-01-01T12:00:00Z")), "2025-12-31");
});

test("el lunes conserva los pendientes del sábado y no busca una ruta del domingo", () => {
  // 20:59 UTC son las 14:59 del lunes en Ciudad de México.
  assert.equal(diaDePaquetes(new Date("2026-09-14T20:59:00Z")), "2026-09-12");

  // Al comenzar la operación del lunes cambia directamente a la ruta de hoy.
  assert.equal(diaDePaquetes(new Date("2026-09-14T21:00:00Z")), "2026-09-14");

  // También cruza correctamente el cambio de mes y año.
  assert.equal(diaDePaquetes(new Date("2026-01-05T12:00:00Z")), "2026-01-03");
});

test("la demora aparece recién tras un ciclo sin movimiento durante la ruta", () => {
  const detenido = {
    fechaUltimoMovimiento: "2026-09-10T20:00:00Z", // antes de las 15:00 MX
    paquetes: [
      { orden: 1, visitado: true, clasificacion: "VISITADO_ENTREGADO" as const, activo_en_ruta: true },
      { orden: 2, visitado: false, clasificacion: "PENDIENTE_NO_VISITADO" as const, activo_en_ruta: true },
    ],
    demoraInformada: null,
  };

  assert.equal(
    estadoDemoraDriver(detenido, new Date("2026-09-10T21:29:00Z")).demorado,
    false,
    "a las 15:29 todavía no completó el ciclo de gracia",
  );
  const aLasQuinceTreinta = estadoDemoraDriver(
    detenido,
    new Date("2026-09-10T21:30:00Z"),
  );
  assert.equal(aLasQuinceTreinta.demorado, true);
  assert.equal(aLasQuinceTreinta.notificar, true);
  assert.equal(aLasQuinceTreinta.minutosSinMovimiento, 30);
  assert.equal(aLasQuinceTreinta.paquetesSinVisitar, 1);

  assert.equal(
    estadoDemoraDriver(detenido, new Date("2026-09-11T06:00:00Z")).demorado,
    false,
    "a medianoche de México termina la ventana de alertas",
  );
});

test("sin paquetes por visitar o con motivo informado no se vuelve a notificar", () => {
  const momento = new Date("2026-09-10T22:00:00Z");
  const base = {
    fechaUltimoMovimiento: "2026-09-10T21:00:00Z",
    paquetes: [{ orden: 1, visitado: true, clasificacion: "VISITADO_ENTREGADO" as const, activo_en_ruta: true }],
    demoraInformada: null,
  };
  assert.equal(estadoDemoraDriver(base, momento).demorado, false);

  const conMotivo = estadoDemoraDriver(
    {
      ...base,
      paquetes: [
        { orden: 1, visitado: true, clasificacion: "VISITADO_ENTREGADO" as const, activo_en_ruta: true },
        { orden: 2, visitado: false, clasificacion: "PROXIMO" as const, activo_en_ruta: true },
      ],
      demoraInformada: { motivo: "Choque confirmado" },
    },
    momento,
  );
  assert.equal(conMotivo.demorado, true, "el contorno rojo conserva la señal operativa");
  assert.equal(conMotivo.notificar, false, "el motivo confirmado silencia el aviso");
});

test("la jornada conserva posiciones de hoy y la ruta completa de ayer antes de las 15", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [
      paquete({ id_viaje: 1, nombre_estado: "Para retirar" }),
      paquete({ id_viaje: 2, nombre_estado: "Entregado", visitado: true }),
      paquete({ id_viaje: 3, nombre_estado: "Para retirar", activo_en_ruta: false }),
    ],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const datos = await leerTracker(undefined, new Date("2026-09-10T18:00:00Z"));
  assert.equal(datos.diaPosiciones, "2026-09-10");
  assert.equal(datos.dia, "2026-09-09");
  assert.equal(datos.pendientesAnteriores, true);
  assert.deepEqual(datos.drivers[0].paquetes.map((p) => p.id_viaje), [1, 2, 3]);
  assert.equal("diasAtras" in datos, false, "quedó el resto del knob de días atrás");
});

test("el corte de paquetes no reintroduce un desplazamiento configurable", () => {
  for (const archivo of [
    "../src/lib/config.ts",
    "../src/lib/tracker.ts",
    "../src/lib/tracker-datos.ts",
    "../src/app/api/live-tracker/nucleo.ts",
    "../src/app/(tablero)/live-tracker/page.tsx",
    "../.env.example",
  ]) {
    const fuente = readFileSync(new URL(archivo, import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /TRACKER_DIAS_ATRAS|diasAtras/, archivo);
  }

  const drivers = flujo("08-tracker-drivers.json");
  const paquetes = flujo("09-tracker-paquetes.json");
  const codigoDrivers = drivers.nodes.find((n: { name: string }) => n.name === "Día de operación")
    .parameters.jsCode;
  const codigoPaquetes = paquetes.nodes.find((n: { name: string }) => n.name === "Día de operación")
    .parameters.jsCode;
  assert.doesNotMatch(JSON.stringify(drivers), /DIAS_ATRAS/);
  assert.doesNotMatch(JSON.stringify(paquetes), /DIAS_ATRAS/);
  assert.match(codigoDrivers, /diaSemana === 1 \? 2 : 1/);
  assert.match(codigoPaquetes, /diaSemana === 1 \? 2 : 1/);
  assert.match(codigoDrivers, /hora < 15 \? anterior : hoy/);
  assert.match(codigoPaquetes, /hora < 15 \? anterior : hoy/);
  assert.equal(drivers.settings.timezone, "America/Mexico_City");
  assert.equal(paquetes.settings.timezone, "America/Mexico_City");

  const horariosDrivers = drivers.nodes
    .find((n: { type: string }) => n.type.includes("scheduleTrigger")).parameters.rule.interval;
  const horariosPaquetes = paquetes.nodes
    .find((n: { type: string }) => n.type.includes("scheduleTrigger")).parameters.rule.interval;
  assert.deepEqual(horariosDrivers, [
    { triggerAtHour: 6, triggerAtMinute: 45 },
    { field: "cronExpression", expression: "0,30 15-23 * * 1-6" },
  ]);
  assert.deepEqual(horariosPaquetes, [
    { triggerAtHour: 7, triggerAtMinute: 15 },
    { field: "cronExpression", expression: "0,30 15-23 * * 1-6" },
  ]);
});

test("el flujo usa el día que manda el tablero y no vuelve a calcularlo", () => {
  for (const archivo of ["08-tracker-drivers.json", "09-tracker-paquetes.json"]) {
    const codigo = flujo(archivo).nodes
      .find((n: { name: string }) => n.name === "Día de operación").parameters.jsCode;

    // El botón manda el día ya resuelto y gana siempre: quien aprieta tiene que
    // ver lo que la pantalla le dijo que iba a ver.
    assert.match(codigo, /const dia = pedido \?\?/, archivo);

    assert.match(codigo, /diaSemana === 1 \? 2 : 1/, archivo);
    assert.match(codigo, /hora < 15 \? anterior : hoy/, archivo);
  }
});

/* ---------------------------------------------------------------------------
 * Antigüedad de la posición
 * ------------------------------------------------------------------------- */

test("la antigüedad de la posición se recalcula contra el reloj de quien mira", () => {
  const ahora = Date.parse("2026-09-10T18:00:00Z");
  const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();

  assert.deepEqual(estadoPosicion(19.4, -99.1, hace(2), ahora), { estado: "RECIENTE", minutos: 2 });
  assert.deepEqual(estadoPosicion(19.4, -99.1, hace(30), ahora), { estado: "DEMORADA", minutos: 30 });
  assert.deepEqual(estadoPosicion(19.4, -99.1, hace(120), ahora), { estado: "VIEJA", minutos: 120 });
  assert.equal(estadoPosicion(19.4, -99.1, null, ahora).estado, "SIN_FECHA");
  assert.equal(estadoPosicion(0, 0, hace(1), ahora).estado, "SIN_POSICION");

  // Una pantalla abierta media hora tiene que envejecer el punto sola: si esto
  // dependiera de lo que guardó la base, seguiría diciendo «hace 2 minutos».
  assert.equal(estadoPosicion(19.4, -99.1, hace(2), ahora + 60 * 60_000).estado, "VIEJA");
});

test("el resumen no cuenta como avance lo que le sacaron de la ruta", () => {
  const resumen = resumirRuta([
    { clasificacion: "VISITADO_ENTREGADO" },
    { clasificacion: "VISITADO_NO_ENTREGADO" },
    { clasificacion: "PROXIMO" },
    { clasificacion: "PENDIENTE_NO_VISITADO" },
    { clasificacion: "CANCELADO" },
    { clasificacion: "RETIRADO_DE_RUTA" },
  ]);

  assert.equal(resumen.total, 6);
  assert.equal(resumen.enRuta, 4);
  assert.equal(resumen.pendientes, 2, "el próximo sigue siendo un pendiente");
  assert.equal(resumen.avance, 50);
  assert.equal(porcentajeEntregado(resumen), 25, "el porcentaje entregado no suma intentos fallidos");

  // Sin paquetes no hay porcentaje: cero de cero no es cero por ciento.
  assert.equal(resumirRuta([]).avance, null);
  assert.equal(porcentajeEntregado(resumirRuta([])), null);
});

test("las entregas por hora usan el reloj de Ciudad de México", () => {
  const horas = entregadosPorHora([
    {
      clasificacion: "VISITADO_ENTREGADO",
      fecha_visita: "2026-09-10T15:05:00Z",
      fecha_cambio_estado: null,
    },
    {
      clasificacion: "VISITADO_ENTREGADO",
      fecha_visita: null,
      fecha_cambio_estado: "2026-09-10T15:55:00Z",
    },
    {
      clasificacion: "VISITADO_NO_ENTREGADO",
      fecha_visita: "2026-09-10T15:30:00Z",
      fecha_cambio_estado: null,
    },
  ]);

  assert.equal(horas.length, 24);
  assert.equal(horas[9].cantidad, 2, "15 UTC son las 09 en Ciudad de México");
  assert.equal(horas.reduce((suma, h) => suma + h.cantidad, 0), 2);
});

/* ---------------------------------------------------------------------------
 * Colores, enlace al operador y ruta propuesta
 * ------------------------------------------------------------------------- */

test("el color dice el estado del paquete y el aro dice de quién es", () => {
  const suyo = colorDeDriver(7);

  // Los tres desenlaces que el equipo pidió poder leer de un vistazo.
  assert.equal(colorDeClasificacion("VISITADO_ENTREGADO", suyo), COLOR_CLASIFICACION.VISITADO_ENTREGADO);
  assert.match(COLOR_CLASIFICACION.VISITADO_ENTREGADO ?? "", /estado-entregado/);
  assert.match(COLOR_CLASIFICACION.VISITADO_NO_ENTREGADO ?? "", /estado-noentregado/);
  assert.match(COLOR_CLASIFICACION.RETIRADO_DE_RUTA ?? "", /warning/);

  // Y los tres tienen que ser distintos entre sí, o no hay nada que leer.
  const resueltos = [
    COLOR_CLASIFICACION.VISITADO_ENTREGADO,
    COLOR_CLASIFICACION.VISITADO_NO_ENTREGADO,
    COLOR_CLASIFICACION.RETIRADO_DE_RUTA,
    COLOR_CLASIFICACION.CANCELADO,
  ];
  assert.equal(new Set(resueltos).size, 4, "dos estados comparten color");

  /*
   * Lo que todavía no pasó no tiene color propio: hereda el del repartidor.
   * Es lo que permite saber de quién es cada parada pendiente cuando hay
   * varios seleccionados, que es justamente cuando el mapa se llena.
   */
  for (const pendiente of ["PROXIMO", "PENDIENTE_NO_VISITADO", "SIN_CLASIFICAR"] as Clasificacion[]) {
    assert.equal(COLOR_CLASIFICACION[pendiente], null);
    assert.equal(colorDeClasificacion(pendiente, suyo), suyo);
  }
});

test("el pin del repartidor es negro y no el color que lo identifica", () => {
  const mapa = readFileSync(new URL("../src/components/MapaTracker.tsx", import.meta.url), "utf8");

  // Negro por `--ink` y no un `#000` literal: en tema oscuro un pin negro
  // sobre el mapa oscuro no se ve, y la tinta del tema se invierte sola.
  assert.match(COLOR_DRIVER, /--ink/);

  assert.match(
    mapa,
    /<circle r=\{r\} fill=\{COLOR_DRIVER\} stroke=\{color\}/,
    "el cuerpo del pin tiene que ir en negro y el aro en el color de la persona",
  );
  assert.doesNotMatch(
    mapa,
    /<circle r=\{r\} fill=\{color\}/,
    "el pin volvió a pintarse del color del repartidor",
  );
});

test("el id del viaje abre ese viaje en Rapiboy", () => {
  assert.equal(
    enlaceAlOperador(4830219),
    "https://rapiboy.com/Operador?modalidad=5&idviaje=4830219",
  );

  const panel = readFileSync(new URL("../src/components/LiveTracker.tsx", import.meta.url), "utf8");

  // El enlace usa `id_viaje`, que es lo que el sistema espera en `idviaje`.
  // `tracking_id` es el mismo número en texto y sirve para mostrarlo, pero la
  // que manda es la columna numérica.
  assert.match(panel, /enlaceAlOperador\(paquete\.id_viaje\)/);
  assert.match(panel, /rel="noopener noreferrer"/);

  /*
   * Un `<a>` adentro de un `<button>` es HTML inválido: el navegador lo
   * reacomoda y los lectores de pantalla anuncian cualquier cosa. La fila usa
   * el botón estirado por detrás justamente para no caer en eso.
   */
  assert.doesNotMatch(
    panel,
    /<button[\s\S]{0,600}<EnlaceViaje[\s\S]{0,600}<\/button>/,
    "el enlace quedó anidado adentro del botón de la fila",
  );
});

test("la ruta propuesta arranca apagada", () => {
  const panel = readFileSync(new URL("../src/components/LiveTracker.tsx", import.meta.url), "utf8");
  assert.match(
    panel,
    /const \[mostrarPropuesta, setMostrarPropuesta\] = useState\(false\)/,
    "encendida por defecto, alguien la leería como la ruta asignada",
  );
});

test("la distancia es la del globo, no la de restar coordenadas", () => {
  // Un grado de latitud son ~111,19 km en cualquier parte del planeta.
  assert.ok(Math.abs(distanciaKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111.195) < 0.01);

  // Un grado de longitud, en cambio, se acorta con la latitud. Restar y
  // elevar al cuadrado daría el mismo número en los dos casos, y ahí las
  // paradas al este y al oeste pesarían de más.
  const enElEcuador = distanciaKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  const enMexico = distanciaKm({ lat: 19.43, lon: -99.13 }, { lat: 19.43, lon: -98.13 });
  assert.ok(enMexico < enElEcuador * 0.95, "el meridiano no se acorta con la latitud");

  assert.equal(distanciaKm({ lat: 19.4, lon: -99.1 }, { lat: 19.4, lon: -99.1 }), 0);
});

test("la ruta propuesta arranca en la bodega y no pierde ninguna parada", () => {
  const origen = BODEGA;

  /*
   * Las paradas entran en el peor orden posible -la más lejana primero- para
   * que el resultado no pueda ser una copia de la entrada.
   */
  const paradas = [
    { id_viaje: 3, lat: 19.35, lon: -99.105858 },
    { id_viaje: 1, lat: 19.45, lon: -99.105858 },
    { id_viaje: 2, lat: 19.4, lon: -99.105858 },
  ];

  const orden = rutaPorCercania(origen, paradas);
  assert.deepEqual(orden.map((p) => p.id_viaje), [1, 2, 3]);

  // No se pierde ni se repite ninguna: el repartidor tiene que ir a todas.
  assert.equal(orden.length, paradas.length);
  assert.equal(new Set(orden.map((p) => p.id_viaje)).size, paradas.length);
});

test("cada parada de la propuesta es la más cercana a la anterior", () => {
  /*
   * La regla que definió la operación, comprobada paso por paso sobre cien
   * configuraciones al azar: en cada tramo, ninguna de las paradas que quedan
   * puede estar más cerca que la que se eligió. La semilla es fija para que un
   * fallo se pueda volver a ver.
   *
   * Es la prueba que impide reintroducir un optimizador por lo bajo. Un paso
   * de 2-opt daría rutas más cortas y rompería esta propiedad, que es
   * justamente la que permite seguir la ruta con el dedo sobre el mapa y
   * verificarla.
   */
  let semilla = 12345;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };

  for (let caso = 0; caso < 100; caso++) {
    const paradas = Array.from({ length: 9 }, (_, i) => ({
      id_viaje: i + 1,
      lat: 19.35 + azar() * 0.15,
      lon: -99.25 + azar() * 0.2,
    }));

    const orden = rutaPorCercania(BODEGA, paradas);
    assert.equal(orden.length, paradas.length, `caso ${caso}: se perdió una parada`);

    let actual: { lat: number; lon: number } = BODEGA;
    const pendientes = new Set(paradas.map((p) => p.id_viaje));

    for (const elegida of orden) {
      pendientes.delete(elegida.id_viaje);
      const aLaElegida = distanciaKm(actual, elegida);

      for (const otra of paradas.filter((p) => pendientes.has(p.id_viaje))) {
        assert.ok(
          aLaElegida <= distanciaKm(actual, otra) + 1e-9,
          `caso ${caso}: había una parada más cerca que la elegida`,
        );
      }
      actual = elegida;
    }
  }
});

test("la propuesta es siempre la misma para los mismos datos", () => {

  /*
   * Repetir la misma llamada tiene que dar siempre lo mismo. Si el resultado
   * bailara entre corridas, nadie podría decirle por teléfono a un repartidor
   * «tenés que ir primero al 4830219»: en la pantalla de al lado diría otra
   * cosa.
   */
  const paradas = [
    { id_viaje: 10, lat: 19.43, lon: -99.12 },
    { id_viaje: 20, lat: 19.39, lon: -99.07 },
    { id_viaje: 30, lat: 19.41, lon: -99.11 },
  ];

  const primera = rutaPorCercania(BODEGA, paradas).map((p) => p.id_viaje);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(rutaPorCercania(BODEGA, paradas).map((p) => p.id_viaje), primera);
  }

  /*
   * Y el empate de verdad: dos paquetes al mismo domicilio -el mismo edificio,
   * dos pedidos- están exactamente a la misma distancia. Ahí gana el primero
   * de la lista, que llega ordenada por `Orden` e `IdViaje` desde la base.
   *
   * Un empate «casi» exacto no sirve para probar esto: dos paradas a 0,01°
   * para cada lado del origen no dan la misma distancia en punto flotante, y
   * el desempate no llega a intervenir.
   */
  const mismoEdificio = [
    { id_viaje: 11, lat: 19.42, lon: -99.15 },
    { id_viaje: 22, lat: 19.42, lon: -99.15 },
  ];
  assert.deepEqual(
    rutaPorCercania(BODEGA, mismoEdificio).map((p) => p.id_viaje),
    [11, 22],
    "el empate exacto se resuelve por el orden de entrada",
  );
});

test("el ahorro solo se calcula cuando las dos rutas cubren las mismas paradas", () => {
  const paradas = [
    { id_viaje: 1, lat: 19.35, lon: -99.105858 },
    { id_viaje: 2, lat: 19.45, lon: -99.105858 },
    { id_viaje: 3, lat: 19.4, lon: -99.105858 },
  ];

  // Mismo conjunto, otro orden: hay con qué comparar.
  const completa = proponerRuta(paradas, [paradas[0], paradas[2], paradas[1]]);
  assert.ok(completa);
  assert.ok(completa.kmDeclarado != null);
  assert.ok(completa.km <= (completa.kmDeclarado as number) + 1e-9);

  // Y el número que se muestra es el de la secuencia que se muestra: se mide
  // el mismo recorrido que se dibuja, no otro.
  const enOrden = completa.secuencia.map((id) => paradas.find((p) => p.id_viaje === id)!);
  assert.equal(completa.km, largoDeRuta(BODEGA, enOrden));

  /*
   * El orden del sistema deja una parada afuera -sin `Orden`, o con el orden
   * repetido-. Restar los dos números mediría recorridos distintos y el
   * «ahorro» sería un artefacto de la resta, así que no se ofrece ninguno.
   */
  const parcial = proponerRuta(paradas, [paradas[0], paradas[1]]);
  assert.equal(parcial?.kmDeclarado, null);

  // Con una sola parada no hay nada que ordenar.
  assert.equal(proponerRuta([paradas[0]], [paradas[0]]), null);
});

test("la jornada trae la ruta propuesta armada desde el servidor", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ latitud: 19.4, longitud: -99.1 })],
    tracker_paquetes: [
      paquete({ id_viaje: 1, tracking_id: "1", orden: 1, latitud_destino: 19.43, longitud_destino: -99.1 }),
      paquete({ id_viaje: 2, tracking_id: "2", orden: 2, latitud_destino: 19.41, longitud_destino: -99.1 }),
      paquete({ id_viaje: 3, tracking_id: "3", orden: 3, latitud_destino: 19.42, longitud_destino: -99.1 }),
    ],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");
  const [conductor] = datos.drivers;

  /*
   * La bodega está en 19,4552, al norte de las tres paradas. La más cercana es
   * la de 19,43 -el viaje 1-, después la de 19,42 y por último la de 19,41,
   * que es justo el orden inverso al que declara el sistema para las dos
   * últimas.
   */
  assert.deepEqual(conductor.propuesta?.secuencia, [1, 3, 2]);
  assert.ok((conductor.propuesta?.km ?? 0) > 0);
  assert.ok((conductor.propuesta?.kmDeclarado ?? 0) > (conductor.propuesta?.km ?? 0));

  /*
   * Y lo más importante: proponer no cambia nada de lo real. El orden
   * declarado, la clasificación y cuál es el próximo destino siguen saliendo
   * de `Viaje.Orden`, no de la cercanía.
   */
  assert.deepEqual(conductor.paquetes.map((p) => p.orden), [1, 2, 3]);
  assert.equal(conductor.proximo?.id_viaje, 1);
  assert.deepEqual(conductor.recorrido.map((p) => p.id_viaje), [1, 2, 3]);
});

test("la propuesta existe aunque el repartidor no esté reportando posición", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ latitud: null, longitud: null, estado_posicion: "SIN_POSICION" })],
    tracker_paquetes: [
      paquete({ id_viaje: 1, tracking_id: "1", orden: 1 }),
      paquete({ id_viaje: 2, tracking_id: "2", orden: 2, latitud_destino: 19.45, longitud_destino: -99.2 }),
    ],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");

  /*
   * La ruta sale de la bodega, no de donde está la persona, así que el
   * teléfono apagado no impide proponerla. Es más: es el repartidor del que
   * menos se sabe, y el único de quien no se puede mirar por dónde va.
   */
  assert.equal(datos.drivers[0].posicion, null);
  assert.deepEqual(datos.drivers[0].propuesta?.secuencia, [1, 2]);
});

test("las paradas ya resueltas no entran en la ruta propuesta", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ latitud: 19.4, longitud: -99.1 })],
    tracker_paquetes: [
      paquete({ id_viaje: 1, tracking_id: "1", orden: 1, nombre_estado: "Entregado" }),
      paquete({ id_viaje: 2, tracking_id: "2", orden: 2, activo_en_ruta: false }),
      paquete({ id_viaje: 3, tracking_id: "3", orden: 3, nombre_estado: "Cancelado" }),
      paquete({ id_viaje: 4, tracking_id: "4", orden: 4, latitud_destino: 19.42, longitud_destino: -99.1 }),
      paquete({ id_viaje: 5, tracking_id: "5", orden: 5, latitud_destino: 19.41, longitud_destino: -99.1 }),

      // Pendiente pero sin coordenadas: no se puede ubicar, así que no se
      // puede meter en una ruta. Sigue contando en el resumen.
      paquete({ id_viaje: 6, tracking_id: "6", orden: 6, latitud_destino: null, longitud_destino: null }),
    ],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");
  const propuesta = datos.drivers[0].propuesta;

  assert.deepEqual(propuesta?.secuencia, [4, 5]);
  assert.equal(datos.drivers[0].resumen.pendientes, 3);
});

/* ---------------------------------------------------------------------------
 * Tiendas, choferes y bodega
 * ------------------------------------------------------------------------- */

const LUGARES = readFileSync(
  new URL("../supabase/migracion-06-lugares.sql", import.meta.url),
  "utf8",
);

test("la bodega del código es la misma que la del mapa", () => {
  /*
   * `BODEGA` está como constante porque de ella depende un cálculo y no puede
   * quedarse sin origen si la tabla no está cargada. El precio de esa decisión
   * es que hay dos copias del mismo punto, y esta prueba es lo que impide que
   * se separen: si alguien mueve la bodega en el mapa y regenera el SQL sin
   * tocar la constante, falla acá.
   */
  const fila = /\('Bodega', null, 'Bodega', 'BODEGA', ([-\d.]+), ([-\d.]+)\)/.exec(LUGARES);
  assert.ok(fila, "el SQL generado no trae la fila de la bodega");

  assert.equal(Number(fila[1]), BODEGA.lat);
  assert.equal(Number(fila[2]), BODEGA.lon);
});

test("el domicilio del repartidor se muestra solo, sin la lista entera", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ id_motoboy: 7 })],
    tracker_paquetes: [paquete()],
    tracker_sincronizaciones: [],
    tracker_choferes: [
      { id_motoboy: 7, nombre: "Ana Ruiz", latitud: 19.5, longitud: -99.2 },
      { id_motoboy: 99, nombre: "Otro", latitud: 19.6, longitud: -99.3 },
    ],
  });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");

  assert.deepEqual(datos.drivers[0].domicilio, { lat: 19.5, lon: -99.2 });

  /*
   * Dónde vive alguien es un dato sensible. Lo que sale del servidor son los
   * repartidores de la jornada con su domicilio adentro, no la tabla entera:
   * el domicilio del 99, que hoy no opera, no aparece por ningún lado.
   */
  assert.equal(JSON.stringify(datos).includes("19.6"), false);
});

test("la pantalla funciona igual si la tabla de domicilios no está cargada", async (t) => {
  conEntorno(t, BASE);

  // Sin `tracker_choferes`, la base simulada responde 404, que es exactamente
  // lo que devuelve PostgREST cuando la migración todavía no se corrió.
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [paquete()],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");

  // Un dato accesorio no puede tirar abajo la pantalla entera.
  assert.equal(datos.drivers.length, 1);
  assert.equal(datos.drivers[0].domicilio, null);
});

test("un domicilio con coordenadas imposibles no se dibuja", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver({ id_motoboy: 7 })],
    tracker_paquetes: [paquete()],
    tracker_sincronizaciones: [],

    // El (0,0) es válido como número y no como domicilio: cae en el Atlántico.
    tracker_choferes: [{ id_motoboy: 7, nombre: "Ana Ruiz", latitud: 0, longitud: 0 }],
  });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");
  assert.equal(datos.drivers[0].domicilio, null);
});

test("el domicilio y la bodega entran en el encuadre del mapa", () => {
  const mapa = readFileSync(new URL("../src/components/MapaTracker.tsx", import.meta.url), "utf8");

  // Un punto que no entra en el cuadro no se ve, y se pidió poder verlo al
  // elegir al repartidor.
  assert.match(mapa, /if \(driver\.domicilio\) puntos\.push\(proyectar\(driver\.domicilio/);
  assert.match(mapa, /if \(mostrarPropuesta\) puntos\.push\(proyectar\(BODEGA/);

  // Y la ruta propuesta arranca en la bodega, no donde está la persona.
  assert.match(mapa, /propuesta\.push\(proyectar\(BODEGA\.lat, BODEGA\.lon\)\)/);
});

/* ---------------------------------------------------------------------------
 * Identificadores contra el sistema
 * ------------------------------------------------------------------------- */

test("el id del repartidor sale de Motoboy.Id", () => {
  const sql = sinComentarios(consultaDe("08-tracker-drivers.json", "Repartidores del día"));

  /*
   * `ReservaxMotoboy.IdMotoboy` apunta al mismo número, pero la fila que se
   * guarda es la del repartidor y su id tiene que salir de su propia tabla.
   * Es el id que el mapa de choferes lleva en el nombre de cada punto,
   * comprobado por nombre contra la jornada cargada en la base.
   */
  assert.match(sql, /M\.Id AS IdMotoboy/);
  assert.match(sql, /INNER JOIN dbo\.Motoboy M/);
});

test("la pantalla dice qué migración falta en vez de fingir que no hay datos", async (t) => {
  conEntorno(t, BASE);

  // Sin la tabla de domicilios: es lo que devuelve PostgREST cuando la
  // migración 06 no se corrió.
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [paquete()],
    tracker_sincronizaciones: [],
  });
  t.after(base.restore);

  const datos = await leerTracker("2026-09-10");

  /*
   * La primera versión se tragaba el error y la pantalla decía «sin domicilio
   * cargado», que es una respuesta distinta y equivocada: no es que la persona
   * no tenga domicilio, es que la tabla no existe.
   */
  assert.deepEqual(datos.tablasFaltantes, ["tracker_choferes"]);
  assert.equal(datos.drivers.length, 1, "el mapa tiene que seguir funcionando");

  const panel = readFileSync(new URL("../src/components/LiveTracker.tsx", import.meta.url), "utf8");
  assert.match(panel, /migracion-06-lugares\.sql/);
});

test("con las tablas cargadas no se avisa nada", async (t) => {
  conEntorno(t, BASE);
  const base = baseSimulada(t, {
    tracker_drivers_vista: [driver()],
    tracker_paquetes: [paquete()],
    tracker_sincronizaciones: [],
    tracker_choferes: [],
  });
  t.after(base.restore);

  // Una tabla vacía no es una tabla faltante: el aviso tiene que aparecer solo
  // cuando de verdad hay algo que correr.
  const datos = await leerTracker("2026-09-10");
  assert.deepEqual(datos.tablasFaltantes, []);
});

test("un solo botón actualiza paquetes y después posiciones", () => {
  const panel = readFileSync(new URL("../src/components/LiveTracker.tsx", import.meta.url), "utf8");

  // Paquetes primero: la de posiciones conserva a quienes aparecen por sus
  // pendientes, así que al revés un repartidor recién sumado quedaría sin
  // posición hasta la próxima pasada.
  assert.match(panel, /for \(const cual of \["paquetes", "posiciones"\] as const\)/);
  assert.equal((panel.match(/className=\{estilos\.sync\}/g) ?? []).length, 1, "tiene que haber un solo botón");
  assert.doesNotMatch(panel, />\s*Actualizar (posiciones|paquetes)\s*</);

  // Un flujo caído no frena al otro: `sincronizar` devuelve en vez de tirar.
  const cuerpo = panel.slice(panel.indexOf("async function sincronizar("));
  assert.match(cuerpo.slice(0, cuerpo.indexOf("\n}\n")), /catch \{\s*return \{ ok: false/);
});
