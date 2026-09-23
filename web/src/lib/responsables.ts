/**
 * La distribución de tiendas: de quién es cada comercio.
 *
 * El equipo reparte las tiendas entre dos personas —Grupo A de Esteban,
 * Grupo B de Candelaria— y el tablero pinta cada comercio con el color de su
 * dueño en todas las pantallas donde aparece. La fuente actual es
 * `sellers_activos.soporte_asignado`, cargada por el directorio operativo.
 *
 * Este módulo no lee la base ni importa nada de servidor: son los tipos y las
 * reglas, para que los usen igual las acciones y los componentes de cliente.
 */

/**
 * Las dos personas que reparten tiendas.
 *
 * El correo es la identidad en todo el proyecto —lo mismo que queda en
 * `editado_por`—, así que es lo que se guarda. El color sale de una variable
 * del tema para que se lea igual en claro y en oscuro.
 */
export const RESPONSABLES = [
  {
    email: "esteban@rapiboy.com",
    nombre: "Esteban",
    grupo: "A",
    color: "var(--tienda-esteban, #1f5fd6)",
  },
  {
    email: "candelaria@rapiboy.com",
    nombre: "Cande",
    grupo: "B",
    color: "var(--tienda-candelaria, #d6337f)",
  },
] as const;

export type Responsable = (typeof RESPONSABLES)[number];
export type EmailResponsable = Responsable["email"];

export type SeccionTienda = "COLECTA" | "NO_COLECTA" | "NUEVA";

export const SECCIONES: { valor: SeccionTienda; etiqueta: string }[] = [
  { valor: "COLECTA", etiqueta: "Colecta" },
  { valor: "NO_COLECTA", etiqueta: "No colecta" },
  { valor: "NUEVA", etiqueta: "Tienda nueva" },
];

/** Forma normalizada usada por las reglas de color y las pruebas. */
export type FilaResponsable = {
  id: string;
  nombre: string;
  clave: string;
  alias: string[] | null;
  responsable: string;
  seccion: SeccionTienda;
  editado_por: string | null;
  editado_en: string | null;
};

/** Lo que llega del formulario para crear o actualizar una tienda. */
export type DatosTienda = {
  nombre: string;
  alias: string[];
  responsable: string;
  seccion: string;
};

/**
 * La forma comparable de un nombre de comercio.
 *
 * En `mensual` y `cancelados` la tienda es solo un texto, sin id, así que el
 * dueño se encuentra por nombre. Y el mismo comercio viene escrito distinto
 * según la tabla: «Mayor Bag» y «MayorBag», «D´leo» y «D’leo», «Bache Crítico»
 * y «Bache Critico». Por eso se comparan sin acentos, sin mayúsculas y sin
 * nada que no sea letra o número.
 */
export function claveTienda(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function responsablePorEmail(email: string | null | undefined): Responsable | null {
  return RESPONSABLES.find((r) => r.email === email) ?? null;
}

/**
 * El índice clave → correo del dueño, con el nombre y todos sus alias.
 *
 * Es lo único que viaja al navegador para pintar las tiendas: unas
 * cuatrocientas claves cortas, no la tabla entera.
 */
export function indexarResponsables(filas: FilaResponsable[]): Record<string, string> {
  const indice: Record<string, string> = {};
  for (const fila of filas) {
    for (const nombre of [fila.nombre, ...(fila.alias ?? [])]) {
      const clave = claveTienda(nombre);
      if (clave) indice[clave] = fila.responsable;
    }
  }
  return indice;
}

/** El dueño de una tienda, o `null` si todavía no está repartida. */
export function responsableDe(
  indice: Record<string, string>,
  tienda: string | null | undefined,
): Responsable | null {
  if (!tienda) return null;
  return responsablePorEmail(indice[claveTienda(tienda)]);
}

/** Los alias escritos uno por renglón, sin vacíos ni repetidos del nombre. */
export function limpiarAlias(nombre: string, alias: string[]): string[] {
  const vistas = new Set([claveTienda(nombre)]);
  const limpios: string[] = [];
  for (const crudo of alias) {
    const texto = crudo.trim().replace(/\s+/g, " ");
    const clave = claveTienda(texto);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    limpios.push(texto);
  }
  return limpios;
}

/**
 * Revisa una tienda antes de guardarla. Devuelve el motivo o `null`.
 *
 * Un nombre o alias no puede pertenecer a dos tiendas: si pasara, el color de
 * ese comercio dependería de cuál fila se leyó última, y cambiaría solo.
 */
export function revisarTienda(
  datos: DatosTienda,
  existentes: FilaResponsable[],
  id: string | null,
): string | null {
  const nombre = datos.nombre.trim().replace(/\s+/g, " ");
  if (!claveTienda(nombre)) return "Falta el nombre de la tienda.";
  if (!responsablePorEmail(datos.responsable)) return "Elegí de quién es la tienda.";
  if (!SECCIONES.some((s) => s.valor === datos.seccion)) return "Elegí la sección.";

  const propias = new Map<string, string>();
  for (const fila of existentes) {
    if (fila.id === id) continue;
    for (const otro of [fila.nombre, ...(fila.alias ?? [])]) propias.set(claveTienda(otro), fila.nombre);
  }

  for (const texto of [nombre, ...limpiarAlias(nombre, datos.alias)]) {
    const duena = propias.get(claveTienda(texto));
    if (duena) return `«${texto}» ya figura en la tienda «${duena}».`;
  }
  return null;
}
