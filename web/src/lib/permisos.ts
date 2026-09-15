/**
 * Qué puede ver cada rol.
 *
 * `admin` y `operador` ven todo el tablero. `comercial` es el perfil del
 * equipo comercial: entra solo a Tiendas y a Colectas, y nada más.
 *
 * Es un módulo puro, sin imports de servidor, porque lo usan tres lugares que
 * corren en runtimes distintos: el proxy (edge), el menú (cliente y servidor) y
 * las acciones. Una sola regla para los tres es lo que evita que el menú
 * muestre algo que el proxy bloquea, o al revés.
 */

export const ROLES_PERFIL = ["admin", "operador", "comercial"] as const;

export type RolPerfil = (typeof ROLES_PERFIL)[number];

export const ETIQUETA_ROL: Record<RolPerfil, string> = {
  admin: "Administrador",
  operador: "Operador",
  comercial: "Comercial",
};

/** Un valor cualquiera como rol. Lo que no se reconoce baja a `operador`, nunca sube a admin. */
export function aRol(valor: unknown): RolPerfil {
  return ROLES_PERFIL.includes(valor as RolPerfil) ? (valor as RolPerfil) : "operador";
}

/**
 * Las únicas pantallas de un comercial. Exactas: `/colectas` no abre cualquier
 * cosa que empiece así, solo la asignación y su historial.
 */
export const RUTAS_COMERCIAL = ["/tiendas", "/colectas", "/colectas/historial"] as const;

export function esComercial(rol: RolPerfil | null | undefined): boolean {
  return rol === "comercial";
}

/**
 * Si un rol puede abrir una ruta.
 *
 * Sin rol es quien entró por la lista blanca de Google, que ve lo mismo que un
 * operador. Para un comercial también se cierra `/api`: ninguna de sus
 * pantallas llama a esos endpoints, que son del live tracker.
 */
export function puedeVerRuta(rol: RolPerfil | null | undefined, ruta: string): boolean {
  if (!esComercial(rol)) return true;
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  return (RUTAS_COMERCIAL as readonly string[]).includes(limpia);
}

/** A dónde va alguien al entrar, o cuando pide una pantalla que no le toca. */
export function inicioDe(rol: RolPerfil | null | undefined): string {
  return esComercial(rol) ? RUTAS_COMERCIAL[0] : "/";
}
