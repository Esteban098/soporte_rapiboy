import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  MAX_TESELAS,
  ZOOM_MAX,
  ZOOM_MIN,
  cajaVisible,
  teselasParaLienzo,
  urlCalles,
  urlTrafico,
  zoomParaLienzo,
} from "../src/lib/trafico";
import { mosaico } from "../src/lib/lluvia";
import { ventanaProyeccion } from "../src/lib/cobertura";
import { proyectarEn } from "../src/lib/tracker";

/**
 * Pruebas de las capas de calles y tráfico de TomTom.
 *
 * Lo que se prueba es la geometría, que es lo que se equivoca en silencio: una
 * calle corrida media cuadra sigue pareciendo un mapa. La descarga no se
 * prueba acá; se mira en el navegador con una clave de verdad.
 */

const VENTANA = ventanaProyeccion();
const COMPLETA = { x: 0, y: 0, w: VENTANA.ancho, h: VENTANA.alto };
const CAJA = { ancho: 900, alto: 560 };
const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("las URLs son las que documenta TomTom, con la clave escapada", () => {
  const t = { z: 13, x: 1840, y: 3641, oeste: 0, este: 0, norte: 0, sur: 0 };

  assert.equal(
    urlCalles("abc", t),
    "https://api.tomtom.com/map/1/tile/basic/main/13/1840/3641.png?key=abc&tileSize=512",
  );
  assert.equal(
    urlTrafico("abc", t),
    "https://api.tomtom.com/traffic/map/4/tile/flow/relative0/13/1840/3641.png?key=abc&tileSize=512",
  );

  // Una clave con caracteres raros no puede partir la URL.
  assert.match(urlTrafico("a&b=c", t), /key=a%26b%3Dc&/);
});

test("lo visible en grados es la inversa exacta de la proyección del mapa", () => {
  /*
   * Si esta cuenta no fuera la inversa de `proyectarEn`, se pedirían teselas
   * de otra parte de la ciudad: el mapa de calles aparecería desplazado respecto
   * de las zonas y de los marcadores.
   */
  for (const vista of [COMPLETA, { x: 310, y: 420, w: 60, h: 40 }, { x: -50, y: 900, w: 12, h: 8 }]) {
    const caja = cajaVisible(VENTANA, vista);
    const noroeste = proyectarEn({ lon: caja.oeste, lat: caja.norte }, VENTANA);
    const sureste = proyectarEn({ lon: caja.este, lat: caja.sur }, VENTANA);

    assert.ok(Math.abs(noroeste.x - vista.x) < 1e-6, `x: ${noroeste.x} contra ${vista.x}`);
    assert.ok(Math.abs(noroeste.y - vista.y) < 1e-6, `y: ${noroeste.y} contra ${vista.y}`);
    assert.ok(Math.abs(sureste.x - (vista.x + vista.w)) < 1e-6);
    assert.ok(Math.abs(sureste.y - (vista.y + vista.h)) < 1e-6);
  }
});

test("el zoom sigue al acercamiento y no se sale de rango", () => {
  const lejos = zoomParaLienzo(VENTANA, { vista: COMPLETA, caja: CAJA });

  // Acercarse ocho veces sube tres niveles: cada nivel duplica el detalle.
  const cerca = zoomParaLienzo(VENTANA, {
    vista: { x: 0, y: 0, w: VENTANA.ancho / 8, h: VENTANA.alto / 8 },
    caja: CAJA,
  });
  assert.equal(cerca, lejos + 3);

  // Al máximo acercamiento del lienzo no se pasa del tope.
  const tope = zoomParaLienzo(VENTANA, {
    vista: { x: 0, y: 0, w: VENTANA.ancho * 0.004, h: VENTANA.alto * 0.004 },
    caja: { ancho: 4000, alto: 3000 },
  });
  assert.ok(tope <= ZOOM_MAX);
  assert.ok(lejos >= ZOOM_MIN);
});

test("a cualquier acercamiento se piden pocas teselas", () => {
  /*
   * Es lo que hace viable pagar por tesela. La lluvia usa un zoom fijo para
   * toda la ciudad; hacer eso a zoom de calle serían cientos de imágenes. Con
   * el zoom atado a los píxeles, la cuenta queda chica siempre.
   */
  for (const caja of [CAJA, { ancho: 1920, alto: 1080 }, { ancho: 390, alto: 600 }]) {
    for (const division of [1, 2, 8, 32, 128, 250]) {
      const vista = {
        x: VENTANA.ancho / 3,
        y: VENTANA.alto / 3,
        w: VENTANA.ancho / division,
        h: VENTANA.alto / division,
      };
      const teselas = teselasParaLienzo(VENTANA, { vista, caja });
      assert.ok(teselas.length > 0, `sin teselas con caja ${caja.ancho} y división ${division}`);
      assert.ok(teselas.length <= MAX_TESELAS, `${teselas.length} teselas con división ${division}`);
      assert.ok(teselas.length <= 16, `${teselas.length} teselas: más de lo esperable para la pantalla`);
    }
  }
});

test("ubicar cada tesela por sus esquinas deja las calles a pocos metros de su lugar", () => {
  /*
   * El mapa del tablero no es Mercator y las teselas sí. Dentro de cada tesela
   * el relleno es parejo y la latitud real no, y la diferencia se achica con el
   * tamaño de la tesela. Se mide con la cuenta de Mercator escrita acá aparte,
   * no con la del módulo, para no probar la misma cuenta contra sí misma.
   */
  const metrosPorUnidad = ((VENTANA.norte - VENTANA.sur) * 111_320) / VENTANA.alto;
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

  for (let z = ZOOM_MIN; z <= ZOOM_MAX; z++) {
    // A zoom alto la ciudad entera son miles de teselas: alcanza con una franja
    // norte-sur completa, que es donde varía el error.
    const franja = { ...VENTANA, oeste: VENTANA.oeste, este: VENTANA.oeste + 0.0001 };
    let peor = 0;
    for (const t of mosaico(franja, z)) {
      const yN = proyectarEn({ lon: t.oeste, lat: t.norte }, VENTANA).y;
      const yS = proyectarEn({ lon: t.oeste, lat: t.sur }, VENTANA).y;
      for (let i = 1; i < 20; i++) {
        const lat = t.sur + ((t.norte - t.sur) * i) / 20;
        const f = (merc(t.norte) - merc(lat)) / (merc(t.norte) - merc(t.sur));
        const dibujada = yN + f * (yS - yN);
        const real = proyectarEn({ lon: t.oeste, lat }, VENTANA).y;
        peor = Math.max(peor, Math.abs(dibujada - real) * metrosPorUnidad);
      }
    }
    /*
     * El criterio es el mismo que el de la lluvia: el corrimiento tiene que
     * quedar dentro de la imagen, por debajo de medio píxel de tesela. De lejos
     * -z9, la ciudad entera- son unos 38 m, pero ahí un píxel mide 144 m: no se
     * ve. Y desde zoom 12, que es donde se miran calles, tiene que ser menos de
     * un metro.
     */
    const metrosPorPixel =
      (40_075_016 * Math.cos(((VENTANA.norte + VENTANA.sur) / 2) * (Math.PI / 180))) /
      (2 ** z * 512);
    assert.ok(
      peor < metrosPorPixel / 2,
      `z${z}: ${peor.toFixed(2)} m de corrimiento, medio píxel son ${(metrosPorPixel / 2).toFixed(1)} m`,
    );
    if (z >= 12) assert.ok(peor < 1, `z${z}: ${peor.toFixed(2)} m de corrimiento a zoom de calle`);
  }
});

test("sin clave no hay casillas, y con clave arrancan apagadas", () => {
  const panel = fuente("../src/components/LiveTracker.tsx");
  assert.match(panel, /const \[verCalles, setVerCalles\] = useState\(false\)/);
  assert.match(panel, /const \[verTrafico, setVerTrafico\] = useState\(false\)/);
  assert.match(panel, /claveTomTom \? \(\s*<ControlesTomTom/, "las casillas tienen que depender de que haya clave");
});

test("la atribución de TomTom vive en un solo lugar y la usan las dos pantallas", () => {
  /*
   * Es una condición de uso de TomTom. Si cada pantalla tuviera su copia de
   * las casillas, una podría perder la atribución sin que nadie lo note.
   */
  const controles = fuente("../src/components/Trafico.tsx");
  assert.match(controles, /© TomTom/);

  for (const pantalla of ["../src/components/LiveTracker.tsx", "../src/components/MapaTiendas.tsx"]) {
    const codigo = fuente(pantalla);
    assert.match(codigo, /<ControlesTomTom/, pantalla);
    assert.doesNotMatch(codigo, /© TomTom/, `${pantalla} tiene su propia copia de la atribución`);
  }
});

test("las calles van debajo de las zonas y el tráfico no tapa los clics", () => {
  const mapa = fuente("../src/components/MapaTracker.tsx");
  assert.match(mapa, /debajo=\{/, "las calles tienen que ir por debajo de las zonas");
  assert.match(mapa, /fondoSobreMapa=\{/);

  const capa = fuente("../src/components/Trafico.tsx");
  assert.match(capa, /pointerEvents="none"/);

  const lienzo = fuente("../src/components/LienzoMapa.tsx");
  assert.ok(
    lienzo.indexOf("debajo?.(") < lienzo.indexOf("className={`${estilos.fondo}"),
    "lo de `debajo` tiene que dibujarse antes que las zonas",
  );
});
