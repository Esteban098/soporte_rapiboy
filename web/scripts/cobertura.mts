/**
 * Convierte el KMZ de cobertura en el JSON que consume la web.
 *
 *   npx tsx scripts/cobertura.mts
 *
 * Se corre a mano cuando cambia la cobertura, no en cada build: el resultado se
 * versiona. Así el build no depende de poder leer un binario ni de la red, y el
 * diff del JSON deja ver qué cambió del contorno.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ENTRADA = join(AQUI, "..", "datos", "poligonos-v10-bfv.kmz");
const SALIDA = join(AQUI, "..", "src", "lib", "cobertura.json");

/**
 * Cinco decimales son ~1 m en esta latitud: más precisión que la que puede
 * tener un polígono dibujado a mano, y ahorra un 10% del archivo.
 */
const DECIMALES = 5;

/**
 * Tolerancia del simplificado, en grados, y solo para dibujar.
 *
 * El mapa mide 1000 unidades de `viewBox` para ~0,48° de ancho, así que 0,0002°
 * es menos de media unidad: invisible en pantalla. La verificación de si un
 * punto entra usa siempre el contorno completo, nunca este.
 */
const TOLERANCIA = 0.0002;

/**
 * Qué carpetas del KMZ son cobertura.
 *
 * El archivo trae además capas por código postal —`Iztapalapa`, `Iztacalco`,
 * `Tláhuac`— y una `Capa sin título` con doce polígonos sin nombre. Se dejan
 * afuera: las nombra por CP y no por área de reparto, así que no sirven para
 * comparar contra la columna `poligono` de un pedido, y se superponen a estas
 * dos. Descartarlas no achica la cobertura en la práctica: el área que cubren
 * ellas y no `ZONA 1`/`ZONA 2` es el 1% del total, en bordes finos.
 */
const ZONAS = ["ZONA 1", "ZONA 2"];

/**
 * Un KMZ es un ZIP. Leerlo a mano evita sumar una dependencia para algo que se
 * usa una vez cada varios meses.
 */
function leerKmz(ruta: string): string {
  const buf = readFileSync(ruta);

  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("No parece un ZIP: falta el End of Central Directory.");

  const entradas = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < entradas; i++) {
    const metodo = buf.readUInt16LE(cursor + 10);
    const comprimido = buf.readUInt32LE(cursor + 20);
    const largoNombre = buf.readUInt16LE(cursor + 28);
    const largoExtra = buf.readUInt16LE(cursor + 30);
    const largoComentario = buf.readUInt16LE(cursor + 32);
    const offsetLocal = buf.readUInt32LE(cursor + 42);
    const nombre = buf.toString("utf8", cursor + 46, cursor + 46 + largoNombre);

    if (nombre.toLowerCase().endsWith(".kml")) {
      // El header local repite los largos y pueden no coincidir con los del
      // directorio central, así que se leen de nuevo desde el local.
      const nombreLocal = buf.readUInt16LE(offsetLocal + 26);
      const extraLocal = buf.readUInt16LE(offsetLocal + 28);
      const inicio = offsetLocal + 30 + nombreLocal + extraLocal;
      const datos = buf.subarray(inicio, inicio + comprimido);
      return (metodo === 0 ? datos : inflateRawSync(datos)).toString("utf8");
    }

    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }

  throw new Error("El KMZ no contiene ningún .kml.");
}

type Punto = [number, number];
type Anillo = Punto[];

/**
 * `<coordinates>` viene como "lon,lat,alt lon,lat,alt ...". Se descarta la
 * altura —siempre es 0— y se colapsan los puntos repetidos consecutivos.
 */
function anillo(texto: string): Anillo {
  const puntos: Anillo = [];
  for (const crudo of texto.trim().split(/\s+/)) {
    const [lon, lat] = crudo.split(",");
    const punto: Punto = [redondear(Number(lon)), redondear(Number(lat))];
    if (!Number.isFinite(punto[0]) || !Number.isFinite(punto[1])) continue;
    const previo = puntos[puntos.length - 1];
    if (previo && previo[0] === punto[0] && previo[1] === punto[1]) continue;
    puntos.push(punto);
  }
  // El anillo tiene que cerrar: el algoritmo de punto-en-polígono lo asume.
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (primero && ultimo && (primero[0] !== ultimo[0] || primero[1] !== ultimo[1])) {
    puntos.push([primero[0], primero[1]]);
  }
  return puntos;
}

function redondear(valor: number): number {
  const factor = 10 ** DECIMALES;
  return Math.round(valor * factor) / factor;
}

/**
 * Ramer-Douglas-Peucker: tira los puntos que no cambian la silueta.
 *
 * Solo alimenta el dibujo. El KMZ trae los polígonos con mucho más detalle del
 * que se puede ver a 560 px de ancho, y sin esto el HTML de la página son
 * 23.000 pares de coordenadas.
 */
function simplificar(puntos: Anillo, tolerancia: number): Anillo {
  if (puntos.length <= 4) return puntos;

  let masLejos = 0;
  let distancia = 0;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];

  for (let i = 1; i < puntos.length - 1; i++) {
    const d = aLaRecta(puntos[i], primero, ultimo);
    if (d > distancia) {
      distancia = d;
      masLejos = i;
    }
  }

  if (distancia <= tolerancia) return [primero, ultimo];

  return [
    ...simplificar(puntos.slice(0, masLejos + 1), tolerancia).slice(0, -1),
    ...simplificar(puntos.slice(masLejos), tolerancia),
  ];
}

function aLaRecta([x, y]: Punto, [x1, y1]: Punto, [x2, y2]: Punto): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const largo = Math.hypot(dx, dy);
  if (largo === 0) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / largo;
}

function bloques(xml: string, etiqueta: string): string[] {
  const re = new RegExp(`<${etiqueta}[^>]*>([\\s\\S]*?)</${etiqueta}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** El `<name>` propio del elemento, sin bajar a los hijos. */
function nombrePropio(xml: string): string {
  return (xml.match(/^[\s\S]*?<name>([\s\S]*?)<\/name>/)?.[1] ?? "").trim();
}

function main() {
  const kml = leerKmz(ENTRADA);

  /*
   * Las carpetas del KMZ son las zonas operativas y el `<name>` de cada
   * Placemark es el polígono. Un Placemark puede traer varios `<Polygon>`
   * dentro de un MultiGeometry —hay 10 así— y todos son parte del mismo
   * polígono nombrado, no polígonos distintos.
   */
  const poligonos = bloques(kml, "Folder").flatMap((carpeta) => {
    const zona = nombrePropio(carpeta);
    if (!ZONAS.includes(zona)) return [];

    return bloques(carpeta, "Placemark").flatMap((placemark) => {
      const nombre = nombrePropio(placemark);
      return bloques(placemark, "Polygon").map((poligono) => {
        const contorno = bloques(poligono, "outerBoundaryIs").flatMap((b) =>
          bloques(b, "coordinates"),
        );
        const huecos = bloques(poligono, "innerBoundaryIs").flatMap((b) =>
          bloques(b, "coordinates"),
        );
        return { nombre, zona, contorno: anillo(contorno[0] ?? ""), huecos: huecos.map(anillo) };
      });
    });
  });

  const utiles = poligonos.filter((p) => p.contorno.length >= 4);
  if (utiles.length === 0) {
    throw new Error(`El KML no tiene polígonos en ${ZONAS.join(" ni ")}.`);
  }

  const sinNombre = utiles.filter((p) => !p.nombre).length;
  if (sinNombre > 0) console.warn(`Aviso: ${sinNombre} polígonos sin nombre.`);

  const todos = utiles.flatMap((p) => [p.contorno, ...p.huecos].flat());
  const lons = todos.map((p) => p[0]);
  const lats = todos.map((p) => p[1]);

  const salida = {
    nombre: nombrePropio(bloques(kml, "Document")[0] ?? "") || "Cobertura",
    bbox: {
      oeste: Math.min(...lons),
      este: Math.max(...lons),
      sur: Math.min(...lats),
      norte: Math.max(...lats),
    },
    poligonos: utiles.map((p) => ({
      ...p,
      // El dibujo va aparte y simplificado; `contorno` conserva el detalle
      // completo porque es lo que decide si un domicilio entra.
      trazo: [simplificar(p.contorno, TOLERANCIA), ...p.huecos.map((h) => simplificar(h, TOLERANCIA))],
    })),
  };

  writeFileSync(SALIDA, JSON.stringify(salida) + "\n");

  const zonas = new Set(utiles.map((p) => p.zona));
  const trazo = salida.poligonos.reduce((n, p) => n + p.trazo.flat().length, 0);
  console.log(
    `${zonas.size} zonas, ${utiles.length} polígonos, ${todos.length} puntos ` +
      `(${trazo} para dibujar, ${Math.round((1 - trazo / todos.length) * 100)}% menos) -> ${SALIDA}`,
  );
}

main();
