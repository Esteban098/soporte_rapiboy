import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  CUADROS_PASADOS,
  cuadroActual,
  horaDeCuadro,
  leerIndice,
  mosaico,
  urlTesela,
  zoomDeMosaico,
} from "../src/lib/lluvia";
import { ventanaProyeccion } from "../src/lib/cobertura";

/**
 * Pruebas de la capa de lluvia.
 *
 * Lo que se prueba es la geometría y la lectura del índice: son las dos cosas
 * que se pueden equivocar sin que nadie lo note —una tesela corrida sigue
 * pareciendo un mapa con lluvia—. La descarga y la animación no se prueban
 * acá; se miran a ojo con la capa prendida.
 */

const VENTANA = ventanaProyeccion();

function indiceCrudo(pasados: number, futuros: number) {
  const paso = (n: number, base: number) =>
    Array.from({ length: n }, (_, i) => ({
      time: base + i * 600,
      path: `/v2/radar/${base + i * 600}`,
    }));
  return {
    version: "2.0",
    host: "https://tilecache.rainviewer.com",
    radar: { past: paso(pasados, 1_700_000_000), nowcast: paso(futuros, 1_700_008_000) },
  };
}

test("el índice se queda con los últimos cuadros pasados y marca el pronóstico", () => {
  const indice = leerIndice(indiceCrudo(13, 3));
  assert.ok(indice);
  assert.equal(indice.cuadros.length, CUADROS_PASADOS + 3);
  assert.equal(indice.cuadros.filter((c) => c.pronostico).length, 3);

  // Los pasados que quedan son los más nuevos, no los primeros del arreglo.
  assert.equal(indice.cuadros[0].time, 1_700_000_000 + 5 * 600);

  // El «ahora» es el último observado, con el pronóstico por delante.
  assert.equal(cuadroActual(indice), CUADROS_PASADOS - 1);
  assert.equal(indice.cuadros[cuadroActual(indice)].pronostico, false);
});

test("un índice que no se entiende apaga la capa en vez de romper", () => {
  assert.equal(leerIndice(null), null);
  assert.equal(leerIndice({}), null);
  assert.equal(leerIndice({ host: "https://x", radar: { past: [] } }), null);
  assert.equal(leerIndice({ radar: indiceCrudo(3, 0).radar }), null);

  // Una entrada rota se descarta sola; las sanas siguen sirviendo.
  const mezclado = leerIndice({
    host: "https://tilecache.rainviewer.com",
    radar: { past: [{ time: 1, path: "/a" }, { time: "ayer" }, { path: "/b" }] },
  });
  assert.equal(mezclado?.cuadros.length, 1);
});

test("el mosaico cubre la ventana entera sin pasarse de teselas", () => {
  const z = zoomDeMosaico(VENTANA);
  const teselas = mosaico(VENTANA, z);

  assert.ok(teselas.length <= 12, `${teselas.length} teselas en z=${z}`);
  assert.ok(Math.min(...teselas.map((t) => t.oeste)) <= VENTANA.oeste);
  assert.ok(Math.max(...teselas.map((t) => t.este)) >= VENTANA.este);
  assert.ok(Math.max(...teselas.map((t) => t.norte)) >= VENTANA.norte);
  assert.ok(Math.min(...teselas.map((t) => t.sur)) <= VENTANA.sur);

  /*
   * Y no se pasa del zoom que sirve la API pública. Arriba de 7 RainViewer
   * responde una imagen gris que dice «Zoom Level Not Supported»: se vería
   * como una mancha con texto encima de la ciudad, no como un error.
   */
  assert.ok(z <= 7, `z=${z} está por encima de lo que sirve la API pública`);
});

test("las teselas vecinas comparten borde exacto", () => {
  const teselas = mosaico(VENTANA, zoomDeMosaico(VENTANA));
  for (const t of teselas) {
    const derecha = teselas.find((o) => o.x === t.x + 1 && o.y === t.y);
    if (derecha) assert.equal(t.este, derecha.oeste);
    const abajo = teselas.find((o) => o.x === t.x && o.y === t.y + 1);
    if (abajo) assert.equal(t.sur, abajo.norte);
  }
});

test("la lluvia cae donde corresponde en el mapa del tablero", () => {
  /*
   * Las teselas son Web Mercator y el mapa no. Cada tesela se ubica por sus
   * esquinas y se rellena parejo en el medio, así que en el eje y queda un
   * corrimiento: Mercator estira hacia los polos y el relleno parejo no.
   *
   * Esto lo mide con una implementación aparte de la del módulo —a propósito:
   * repetir la misma cuenta no probaría nada— y falla si el corrimiento
   * llegara a pasar el tamaño de un píxel del radar. Mientras esté por debajo,
   * la lluvia cae dentro de su propio píxel y no hay nada que corregir.
   */
  const z = zoomDeMosaico(VENTANA);
  const teselas = mosaico(VENTANA, z);

  const yDeLat = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
  };

  const METROS_POR_GRADO = 111_320;
  const pixelDeRadar = ((teselas[0].norte - teselas[0].sur) / 512) * METROS_POR_GRADO;

  let peor = 0;
  for (const t of teselas) {
    for (let i = 0; i <= 500; i++) {
      const lat = VENTANA.sur + ((VENTANA.norte - VENTANA.sur) * i) / 500;
      if (lat > t.norte || lat < t.sur) continue;
      const fraccion = yDeLat(lat) - t.y;
      const dibujada = t.norte + (t.sur - t.norte) * fraccion;
      peor = Math.max(peor, Math.abs(dibujada - lat) * METROS_POR_GRADO);
    }
  }

  assert.ok(peor < pixelDeRadar, `${peor.toFixed(0)} m de corrimiento, píxel de ${pixelDeRadar.toFixed(0)} m`);
  assert.ok(peor < 400, `${peor.toFixed(0)} m de corrimiento en latitud`);

  // En longitud las dos proyecciones son la misma cuenta y no hay error: todas
  // las teselas miden exactamente lo mismo de ancho en grados.
  const anchos = new Set(teselas.map((t) => t.este - t.oeste));
  assert.equal(anchos.size, 1);
});

test("la URL de la tesela es la que documenta RainViewer", () => {
  const indice = leerIndice(indiceCrudo(1, 0));
  assert.ok(indice);
  const url = urlTesela(indice, indice.cuadros[0], mosaico(VENTANA, 6)[0]);
  assert.match(
    url,
    /^https:\/\/tilecache\.rainviewer\.com\/v2\/radar\/\d+\/512\/6\/\d+\/\d+\/4\/1_1\.png$/,
  );
});

test("la hora del cuadro es hora de México", () => {
  // 2023-11-14 22:13:20 UTC son las 16:13 en Ciudad de México.
  assert.equal(horaDeCuadro(1_700_000_000), "16:13");
});

test("la capa está apagada por default y no pide nada sin prenderla", () => {
  const fuente = readFileSync(new URL("../src/components/Lluvia.tsx", import.meta.url), "utf8");

  // Esta pantalla se usa con la red de la oficina intermitente: el mapa tiene
  // que seguir sirviendo sin RainViewer, y eso arranca por no llamarlo.
  assert.match(fuente, /useState\(false\)/);
  assert.match(fuente, /if \(!activa\) return;/);
});
