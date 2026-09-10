/**
 * Convierte los KMZ de tiendas y choferes en una migración de Supabase.
 *
 *   npx tsx scripts/lugares.mts
 *
 * Se corre a mano cuando operaciones actualiza alguno de los dos mapas, no en
 * cada build: la salida se versiona, así el diff del SQL deja ver qué domicilio
 * cambió y el despliegue no depende de poder leer un binario.
 *
 * La convención del nombre de cada punto en Google My Maps es `#ID nombre`,
 * donde el ID es `Usuario.Id` para las tiendas e `IdMotoboy` para los choferes.
 * Es la única forma de atar el mapa con el sistema: My Maps no guarda campos
 * propios, así que el identificador viaja adentro del texto.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { leerKmz } from "./kmz.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(AQUI, "..", "supabase", "migracion-06-lugares.sql");

/** Seis decimales son ~10 cm. Un domicilio no se conoce con más precisión. */
const DECIMALES = 6;

/**
 * El color del ícono es lo único que distingue un dropoff de una tienda.
 *
 * My Maps no guarda una categoría, así que la capa la codificó con el color:
 * verde las tiendas, naranja los dropoff, negro la bodega. La lectura se
 * confirma contra el flujo de colectas, que ya trae la lista de dropoff por
 * nombre —Teresita, PowerBatt, MiMoto, MayorBag, Valsan, BoogiePets,
 * BacheCritico—: siete de los once naranjas son exactamente esos.
 *
 * Si alguna vez se agrega un punto con otro color, cae en `TIENDA` y el
 * resumen de la corrida lo dice. No se adivina una categoría nueva.
 */
const POR_COLOR: Record<string, "TIENDA" | "DROPOFF" | "BODEGA"> = {
  "0F9D58": "TIENDA",
  F57C00: "DROPOFF",
  "000000": "BODEGA",
};

type Lugar = {
  nombreMapa: string;
  id: number | null;
  nombre: string;
  tipo: "TIENDA" | "DROPOFF" | "BODEGA";
  lat: number;
  lon: number;
};

/**
 * Los `<Placemark>` de un KML, con su nombre, su estilo y su punto.
 *
 * Se lee con expresiones regulares y no con un parser de XML porque el archivo
 * lo genera siempre la misma herramienta y su forma es fija; sumar una
 * dependencia de XML para un script que corre cada varios meses no se paga.
 */
function placemarks(kml: string): { nombre: string; estilo: string; lat: number; lon: number }[] {
  const salida: { nombre: string; estilo: string; lat: number; lon: number }[] = [];

  for (const bloque of kml.split("<Placemark>").slice(1)) {
    const cuerpo = bloque.split("</Placemark>")[0];

    const nombre = /<name>([\s\S]*?)<\/name>/.exec(cuerpo)?.[1] ?? "";
    const estilo = /<styleUrl>([\s\S]*?)<\/styleUrl>/.exec(cuerpo)?.[1] ?? "";
    const coordenadas = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(cuerpo)?.[1] ?? "";

    const [lon, lat] = coordenadas.trim().split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    salida.push({ nombre: descodificar(nombre), estilo, lat, lon });
  }

  return salida;
}

/**
 * El texto de un nodo XML: primero el CDATA, después las entidades.
 *
 * My Maps envuelve en `<![CDATA[...]]>` cualquier nombre con un apóstrofo
 * -«#73517 Volk's Coruña» es el caso real- y sin desenvolverlo el nombre
 * quedaría con el envoltorio adentro, y con él el id, que dejaría de leerse.
 */
function descodificar(texto: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(texto);
  if (cdata) return cdata[1];

  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * `#24626 SATUS` -> id 24626, nombre «SATUS».
 *
 * El `#` es opcional y el separador puede ser una tabulación: los dos casos
 * están en los archivos de verdad -«196984\tYazmin Vera Camacho» viene sin
 * numeral y con tab-, y son errores de tipeo de quien cargó el punto, no una
 * convención distinta. Lo que no se hace es inventar un id cuando no hay
 * ninguno: «Bodega», «SPG Benito Juarez» y «David» quedan con id nulo, y así
 * se ve que están en el mapa pero no atados a ninguna tienda del sistema.
 */
function separarId(nombreMapa: string): { id: number | null; nombre: string } {
  const limpio = nombreMapa.replace(/\s+/g, " ").trim();
  const partido = /^#?(\d+)\s+(.+)$/.exec(limpio);
  if (!partido) return { id: null, nombre: limpio };
  return { id: Number(partido[1]), nombre: partido[2].trim() };
}

function redondear(valor: number): number {
  const factor = 10 ** DECIMALES;
  return Math.round(valor * factor) / factor;
}

/** Comillas simples duplicadas: es la única forma de escapar en un literal SQL. */
function literal(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

function leerTiendas(): Lugar[] {
  return placemarks(leerKmz(join(AQUI, "..", "datos", "tiendas.kmz"))).map((p) => {
    const { id, nombre } = separarId(p.nombre);
    const color = /-([0-9A-F]{6})(-|$)/i.exec(p.estilo)?.[1]?.toUpperCase() ?? "";
    return {
      nombreMapa: p.nombre.replace(/\s+/g, " ").trim(),
      id,
      nombre,
      tipo: POR_COLOR[color] ?? "TIENDA",
      lat: redondear(p.lat),
      lon: redondear(p.lon),
    };
  });
}

function leerChoferes(): Lugar[] {
  return placemarks(leerKmz(join(AQUI, "..", "datos", "choferes.kmz"))).map((p) => {
    const { id, nombre } = separarId(p.nombre);
    return {
      nombreMapa: p.nombre.replace(/\s+/g, " ").trim(),
      id,
      nombre,
      tipo: "TIENDA" as const,
      lat: redondear(p.lat),
      lon: redondear(p.lon),
    };
  });
}

const tiendas = leerTiendas();
const choferes = leerChoferes();

const bodega = tiendas.find((t) => t.tipo === "BODEGA");
if (!bodega) throw new Error("El KMZ de tiendas no trae ningún punto negro: falta la bodega.");

/*
 * Un chofer sin id no se puede atar a nadie, así que no entra: la tabla tiene
 * `id_motoboy` como clave y una fila sin clave no existe. Se cuenta en el
 * resumen para que se vea que el mapa tiene un punto que el sistema no puede
 * usar.
 */
const choferesConId = choferes.filter((c) => c.id != null);

const sql = `-- ---------------------------------------------------------------------------
-- Live tracker · tiendas y domicilios de choferes
--
-- GENERADO POR \`npx tsx scripts/lugares.mts\` A PARTIR DE
-- \`datos/tiendas.kmz\` y \`datos/choferes.kmz\`. No editar a mano: la próxima
-- corrida del script pisa los cambios. Para corregir un domicilio se corrige
-- el punto en Google My Maps, se vuelve a exportar el KMZ y se regenera.
--
-- Las dos tablas son de referencia, no de operación: no las escribe ningún
-- flujo de n8n y no cambian solas. Su único trabajo es traducir un id del
-- sistema a un punto del mapa.
--
-- Correr una vez en el SQL Editor de Supabase. Es idempotente: se puede
-- volver a correr después de cada exportación del mapa.
--
-- Para volver atrás: \`drop table public.tracker_tiendas, public.tracker_choferes;\`.
-- No las mira ningún otro tablero.
-- ---------------------------------------------------------------------------

begin;

/*
 * Tiendas, dropoff y la bodega, todos en la misma tabla.
 *
 * La clave es el nombre tal cual figura en el mapa, y no el id de la tienda,
 * porque el id NO es único: #55004 «Marlovet» y #55004 «Marlovet 2» son dos
 * sucursales del mismo vendedor a 1,3 km una de la otra. Con el id como clave
 * primaria, una de las dos se perdería en silencio en cada importación.
 *
 * Por eso quien consulte por \`id_tienda\` tiene que estar listo para recibir
 * más de una fila. Es la realidad de la operación, no un defecto del modelo.
 */
create table if not exists public.tracker_tiendas (
  nombre_mapa    text primary key,
  id_tienda      integer,
  nombre         text        not null,
  tipo           text        not null check (tipo in ('TIENDA', 'DROPOFF', 'BODEGA')),
  latitud        double precision not null,
  longitud       double precision not null,
  actualizado_en timestamptz not null default now()
);

create index if not exists tracker_tiendas_por_id on public.tracker_tiendas (id_tienda);

/*
 * El domicilio de cada chofer.
 *
 * Acá el id sí es la clave: los ${choferes.length} puntos del mapa tienen
 * ${choferesConId.length} ids y ninguno repetido. \`IdMotoboy\` es el mismo
 * número que usa \`tracker_drivers\`, comprobado por nombre contra la jornada
 * cargada en la base.
 *
 * Es un dato sensible: es dónde vive una persona. Queda del lado del servidor
 * como todo el resto -RLS prendido y sin políticas- y solo llega al navegador
 * el domicilio del repartidor que alguien eligió mirar.
 */
create table if not exists public.tracker_choferes (
  id_motoboy     integer primary key,
  nombre         text        not null,
  latitud        double precision not null,
  longitud       double precision not null,
  actualizado_en timestamptz not null default now()
);

-- Mismo criterio que el resto del tracker: nada de acceso directo por API.
alter table public.tracker_tiendas  enable row level security;
alter table public.tracker_choferes enable row level security;

/*
 * El reemplazo es completo y va adentro de la transacción.
 *
 * Un punto borrado del mapa tiene que desaparecer de la tabla: si solo se
 * hiciera upsert, una tienda que operaciones sacó de la capa seguiría viva acá
 * para siempre. Y si algo falla a mitad, el \`rollback\` deja las tablas como
 * estaban en vez de vaciarlas.
 */
delete from public.tracker_tiendas;
delete from public.tracker_choferes;

insert into public.tracker_tiendas (nombre_mapa, id_tienda, nombre, tipo, latitud, longitud) values
${tiendas
  .map(
    (t) =>
      `  (${literal(t.nombreMapa)}, ${t.id ?? "null"}, ${literal(t.nombre)}, '${t.tipo}', ${t.lat}, ${t.lon})`,
  )
  .join(",\n")};

insert into public.tracker_choferes (id_motoboy, nombre, latitud, longitud) values
${choferesConId
  .map((c) => `  (${c.id}, ${literal(c.nombre)}, ${c.lat}, ${c.lon})`)
  .join(",\n")};

commit;
`;

writeFileSync(SALIDA, sql);

const porTipo = tiendas.reduce<Record<string, number>>((cuenta, t) => {
  cuenta[t.tipo] = (cuenta[t.tipo] ?? 0) + 1;
  return cuenta;
}, {});
const sinId = tiendas.filter((t) => t.id == null).map((t) => t.nombre);
const repetidos = [...new Set(tiendas.filter((t) => t.id != null).map((t) => t.id))].filter(
  (id) => tiendas.filter((t) => t.id === id).length > 1,
);

console.log(`tiendas: ${tiendas.length} (${Object.entries(porTipo).map(([k, v]) => `${v} ${k}`).join(", ")})`);
if (sinId.length > 0) console.log(`  sin id en el mapa: ${sinId.join(", ")}`);
if (repetidos.length > 0) console.log(`  ids repetidos (varias sucursales): ${repetidos.join(", ")}`);
console.log(`bodega: ${bodega.lat}, ${bodega.lon}`);
console.log(`choferes: ${choferesConId.length} con domicilio de ${choferes.length} puntos`);
console.log(`-> ${SALIDA}`);
