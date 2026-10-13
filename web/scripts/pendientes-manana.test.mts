import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { COBERTURA, ubicarPunto } from "../src/lib/cobertura";
import {
  candidatosPendientesManana,
  GRUPO_OPERATIVO_PENDIENTES,
  MINIMO_AVISO_DRIVER,
  MINIMO_AVISO_OPERATIVO,
  textoAvisoDriver,
  textoAvisoOperativo,
} from "../src/lib/pendientes-manana";

function puntoDentroDeCobertura() {
  for (const poligono of COBERTURA.poligonos) {
    const suma = poligono.contorno.reduce(([lon, lat], punto) => [lon + punto[0], lat + punto[1]], [0, 0]);
    const punto = { lon: suma[0] / poligono.contorno.length, lat: suma[1] / poligono.contorno.length };
    if (ubicarPunto(punto).length > 0) return punto;
  }
  throw new Error("El KMZ no contiene un punto interior de prueba.");
}

test("solo avisa desde seis no visitados en el polígono del domicilio o uno colindante", () => {
  const punto = puntoDentroDeCobertura();
  const driver = { id: 44, nombre: "Ana", grupoJid: "44@g.us", latitudManual: punto.lat, longitudManual: punto.lon };
  const paquete = { idDriver: 44, latitudDestino: punto.lat, longitudDestino: punto.lon };

  assert.deepEqual(candidatosPendientesManana([driver], Array.from({ length: MINIMO_AVISO_DRIVER - 1 }, () => paquete)), []);

  const [candidato] = candidatosPendientesManana([driver], Array.from({ length: MINIMO_AVISO_DRIVER }, () => paquete));
  assert.equal(candidato.idDriver, 44);
  assert.equal(candidato.pendientes, MINIMO_AVISO_DRIVER);
  assert.match(textoAvisoDriver(candidato, "2026-10-07"), /durante esta mañana/i);
});

test("el aviso operativo exige dieciséis pendientes y usa el grupo fijo", () => {
  assert.equal(MINIMO_AVISO_OPERATIVO, 16);
  assert.equal(GRUPO_OPERATIVO_PENDIENTES, "120363325021795726@g.us");
  assert.match(
    textoAvisoOperativo({ idDriver: 8, nombreDriver: "Luis", grupoJid: "8@g.us", pendientes: 16, poligonos: [] }, "2026-10-07"),
    /no realiza colecta/i,
  );
});

test("el flujo corre a las 07:50 de México y registra solo después de WAHA", () => {
  const flujo = JSON.parse(readFileSync(new URL("../../n8n/18-pendientes-manana.json", import.meta.url), "utf8")) as {
    active: boolean;
    settings: { timezone?: string };
    nodes: { name: string; parameters: Record<string, unknown> }[];
  };
  assert.equal(flujo.active, false);
  assert.equal(flujo.settings.timezone, "America/Mexico_City");
  assert.match(JSON.stringify(flujo), /0 50 7 \* \* 1-6/);
  assert.ok(flujo.nodes.some((nodo) => nodo.name === "Enviar aviso por WhatsApp"));
  assert.ok(flujo.nodes.some((nodo) => nodo.name === "Registrar aviso enviado"));
  const conexiones = JSON.parse(readFileSync(new URL("../../n8n/18-pendientes-manana.json", import.meta.url), "utf8")) as {
    connections: Record<string, { main: { node: string }[][] }>;
  };
  assert.equal(conexiones.connections["Enviar aviso por WhatsApp"].main[0][0].node, "Registrar aviso enviado");
  const worker = readFileSync(new URL("../src/app/api/whatsapp/worker/pendientes-ruta/route.ts", import.meta.url), "utf8");
  assert.match(worker, /clasificacion: "eq\.PENDIENTE_NO_VISITADO"/);
  assert.doesNotMatch(worker, /clasificacion: "eq\.VISITADO_NO_ENTREGADO"/);
  assert.doesNotMatch(worker, /activo_en_ruta: "is\.true"/);
});
