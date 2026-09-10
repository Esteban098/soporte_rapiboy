import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * Leer el .kml de adentro de un .kmz.
 *
 * Lo usan `cobertura.mts` -los polígonos de reparto- y `lugares.mts` -las
 * tiendas y los domicilios de los choferes-. Vive acá y no duplicado en los
 * dos: es un lector de ZIP escrito a mano, y dos copias de esto se separan.
 */

/**
 * Un KMZ es un ZIP. Leerlo a mano evita sumar una dependencia para algo que se
 * usa una vez cada varios meses.
 */
export function leerKmz(ruta: string): string {
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
