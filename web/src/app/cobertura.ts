"use server";

import { usuarioActual } from "@/lib/sesion";
import { COBERTURA, enLaZona, proyectar, ubicarPunto, type Punto, type Zona } from "@/lib/cobertura";

/**
 * Verificar si una dirección cae dentro de la cobertura.
 *
 * El polígono vive en el repo, así que la parte geométrica es local e
 * instantánea. Lo que sí sale a la red es traducir un texto a coordenadas, y
 * eso pasa por Nominatim (OpenStreetMap). Conviene tenerlo presente: en cada
 * consulta por dirección le estamos mandando una dirección de cliente a un
 * tercero. Por eso todo esto corre en el servidor y detrás de sesión —el
 * navegador del operador nunca llama a Nominatim directo— y por eso el pedido
 * se cachea: repetir la misma búsqueda no vuelve a salir.
 */

/**
 * El punto ya proyectado a coordenadas del `viewBox`.
 *
 * Lo calcula el servidor y no el navegador a propósito: proyectar necesita la
 * caja del polígono, y si el cliente importara eso se llevaría el contorno
 * entero —70 KB de coordenadas— para dibujar un círculo.
 */
type Marca = { x: number; y: number };

type Ubicado = { punto: Punto; marca: Marca; etiqueta: string; direccion: string };

export type Veredicto =
  /* «Dentro» nombra los polígonos que cubren el punto: son los mismos nombres
     que lleva la columna `poligono` del pedido, así que sirven para ver si el
     caso quedó asignado al área que le toca por geografía. Pueden ser varios
     porque las capas del KMZ se superponen. */
  | ({ estado: "dentro"; zonas: Zona[] } & Ubicado)
  | ({ estado: "fuera" } & Ubicado)
  | ({ estado: "lejos" } & Ubicado)
  | { estado: "sin-resultado"; mensaje: string }
  | { estado: "error"; mensaje: string };

/**
 * Nominatim pide identificar la aplicación y admite 1 consulta por segundo.
 * Sin User-Agent propio devuelve 403.
 */
const AGENTE = "TableroSoporteRapiboy/1.0 (operacion@rapiboy.com)";

/** Un día: una dirección no cambia de coordenadas de un rato para el otro. */
const CACHE_SEGUNDOS = 60 * 60 * 24;

export async function verificarDireccion(consulta: string): Promise<Veredicto> {
  if (!(await usuarioActual())) return { estado: "error", mensaje: "Sesión vencida. Volvé a entrar." };

  const texto = consulta.trim();
  if (!texto) return { estado: "sin-resultado", mensaje: "Escribí una dirección o pegá coordenadas." };

  // Si ya son coordenadas no hace falta preguntarle a nadie.
  const directo = leerCoordenadas(texto);
  // Sin dirección: las coordenadas ya se muestran solas y repetirlas no aporta.
  if (directo) return veredicto(directo, "", "Coordenadas ingresadas");

  return geocodificar(texto);
}

async function geocodificar(direccion: string, etiqueta?: string): Promise<Veredicto> {
  const { oeste, este, sur, norte } = COBERTURA.bbox;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", direccion);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "mx");
  // Sesga el resultado a la zona de cobertura sin descartarlo si cae afuera:
  // "Av. Juárez" existe en media docena de ciudades del país.
  url.searchParams.set("viewbox", `${oeste},${norte},${este},${sur}`);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: { "User-Agent": AGENTE, "Accept-Language": "es-MX,es" },
      next: { revalidate: CACHE_SEGUNDOS },
    });
  } catch {
    return { estado: "error", mensaje: "No se pudo contactar al buscador de direcciones." };
  }

  if (respuesta.status === 429) {
    return { estado: "error", mensaje: "Demasiadas consultas seguidas. Esperá unos segundos." };
  }
  if (!respuesta.ok) {
    return { estado: "error", mensaje: `El buscador de direcciones respondió HTTP ${respuesta.status}.` };
  }

  const resultados = (await respuesta.json().catch(() => [])) as {
    lat?: string;
    lon?: string;
    display_name?: string;
  }[];

  const primero = resultados[0];
  const lat = Number(primero?.lat);
  const lon = Number(primero?.lon);
  if (!primero || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      estado: "sin-resultado",
      mensaje: "No se encontró esa dirección. Probá agregando colonia y alcaldía, o pegá las coordenadas.",
    };
  }

  return veredicto({ lon, lat }, primero.display_name || direccion, etiqueta ?? "Dirección buscada");
}

function veredicto(punto: Punto, direccion: string, etiqueta: string): Veredicto {
  const ubicado = { punto, marca: proyectar(punto), direccion, etiqueta };
  // «Lejos» es su propio caso: fuera de cobertura y fuera del mapa casi siempre
  // es una dirección mal escrita, no un domicilio que no alcanzamos.
  if (!enLaZona(punto)) return { estado: "lejos", ...ubicado };

  const zonas = ubicarPunto(punto);
  return zonas.length > 0
    ? { estado: "dentro", zonas, ...ubicado }
    : { estado: "fuera", ...ubicado };
}

/**
 * Coordenadas escritas a mano o pegadas de Google Maps.
 *
 * Google las muestra como "19.4326, -99.1332" y las mete en la URL como
 * `@19.4326,-99.1332,15z` o `!3d19.4326!4d-99.1332`. Aceptar el link pegado
 * ahorra el paso de copiarlas a mano, que es donde se dan vuelta los signos.
 */
function leerCoordenadas(texto: string): Punto | null {
  const enlace = texto.match(/[@!]3?d?(-?\d{1,3}\.\d+)[,!]4?d?(-?\d{1,3}\.\d+)/);
  const suelto = texto.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  const par = enlace ?? suelto;
  if (!par) return null;

  const lat = Number(par[1]);
  const lon = Number(par[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return { lon, lat };
}
