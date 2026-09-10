/**
 * Las tiendas, los dropoff y la bodega: dónde está cada uno.
 *
 * Es una capa aparte del live tracker y no depende de él: no tiene día,
 * no tiene jornada y no cambia sola. Sale del mapa que mantiene operaciones
 * (`datos/tiendas.kmz`), convertido por `scripts/lugares.mts` en la migración
 * que carga `tracker_tiendas`.
 *
 * Este módulo no lee la base ni importa nada de servidor: son los tipos y las
 * reglas, para que los use igual el componente de cliente que dibuja el mapa.
 */

export type TipoDeLugar = "TIENDA" | "DROPOFF" | "BODEGA";

/** Una fila de `tracker_tiendas`, tal como la devuelve PostgREST. */
export type LugarFila = {
  nombre_mapa: string;
  id_tienda: number | null;
  nombre: string;
  tipo: TipoDeLugar;
  latitud: number;
  longitud: number;
};

/** Un punto listo para dibujar y listar. */
export type Lugar = {
  /** El nombre tal cual en el mapa. Es la clave, y es único. */
  clave: string;
  /** `Usuario.Id`. Nulo en los tres puntos que el mapa no lo trae. */
  id: number | null;
  nombre: string;
  tipo: TipoDeLugar;
  lat: number;
  lon: number;
  /**
   * Si este id aparece en más de un punto del mapa.
   *
   * `#55004` son dos sucursales del mismo vendedor. Se avisa en vez de
   * esconderlo: quien busque ese id tiene que saber que hay dos direcciones y
   * que el sistema no dice cuál corresponde a cada pedido.
   */
  compartido: boolean;
};

export const ETIQUETA_TIPO: Record<TipoDeLugar, string> = {
  TIENDA: "Tienda",
  DROPOFF: "Dropoff",
  BODEGA: "Bodega",
};

/**
 * El color de cada tipo. Son tres, así que el color alcanza y no hace falta
 * además una forma distinta para cada uno.
 *
 * Salen de las variables del tema, como el resto del tablero: la bodega en
 * tinta -es el punto de referencia, no una categoría-, el dropoff en el mismo
 * azul que «En depósito» usa en las tablas, y la tienda en el verde de
 * siempre.
 */
export const COLOR_TIPO: Record<TipoDeLugar, string> = {
  BODEGA: "var(--ink, #111827)",
  DROPOFF: "var(--estado-deposito, #0071e3)",
  TIENDA: "var(--estado-entregado, #248a3d)",
};

/**
 * Ordena y marca los ids repetidos.
 *
 * La bodega va primera porque es el punto contra el que se ubica todo lo
 * demás; después los dropoff, que son once y los que más se buscan; y al final
 * las tiendas por nombre.
 */
export function ordenarLugares(filas: LugarFila[]): Lugar[] {
  const cuenta = new Map<number, number>();
  for (const fila of filas) {
    if (fila.id_tienda != null) cuenta.set(fila.id_tienda, (cuenta.get(fila.id_tienda) ?? 0) + 1);
  }

  const peso: Record<TipoDeLugar, number> = { BODEGA: 0, DROPOFF: 1, TIENDA: 2 };

  return filas
    .map((fila) => ({
      clave: fila.nombre_mapa,
      id: fila.id_tienda,
      nombre: fila.nombre,
      tipo: fila.tipo,
      lat: fila.latitud,
      lon: fila.longitud,
      compartido: fila.id_tienda != null && (cuenta.get(fila.id_tienda) ?? 0) > 1,
    }))
    .sort(
      (a, b) =>
        peso[a.tipo] - peso[b.tipo] ||
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
    );
}

/**
 * Los lugares que coinciden con lo que se escribió: por nombre o por id.
 *
 * Sin acentos y sin distinguir mayúsculas, porque nadie escribe «Volk's
 * Coruña» con el apóstrofo bien puesto cuando está buscando una dirección.
 */
export function filtrarLugares(lugares: Lugar[], consulta: string): Lugar[] {
  const texto = normalizar(consulta);
  if (!texto) return lugares;
  return lugares.filter(
    (lugar) => normalizar(lugar.nombre).includes(texto) || String(lugar.id ?? "").includes(texto),
  );
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * El punto abierto en Google Maps.
 *
 * El mapa del tablero ubica contra las zonas de reparto, que es lo que sirve
 * para decidir; para llegar hasta la puerta hace falta un mapa de calles, y
 * eso se delega en vez de intentar dibujarlo.
 */
export function enlaceAGoogleMaps(lugar: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${lugar.lat},${lugar.lon}`;
}
