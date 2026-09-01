import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { TABLA_PERFILES } from "./config";
import { actualizarFila, consultarFresco, insertarFila, TablaFaltante } from "./supabase";

const derivar = promisify(scrypt) as (
  clave: string,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number },
) => Promise<Buffer>;

/**
 * Quién puede entrar al tablero.
 *
 * Los perfiles los crea el administrador desde la web; no hay registro
 * abierto. El correo es la identidad en todo el proyecto: es lo mismo que queda
 * en `editado_por`, `creado_por` y `atendido_por`.
 */

export type RolPerfil = "admin" | "operador";

export type Perfil = {
  id: string;
  email: string;
  nombre: string | null;
  rol: RolPerfil;
  activo: boolean;
  creado: Date | null;
  creadoPor: string | null;
  ultimoIngreso: Date | null;
};

type FilaPerfil = {
  id: string;
  created_at: string | null;
  email: string;
  nombre: string | null;
  password_hash: string;
  rol: string | null;
  activo: boolean | null;
  creado_por: string | null;
  ultimo_ingreso: string | null;
};

/**
 * Costo de la derivación.
 *
 * N = 16384 son unos 16 MB y decenas de milisegundos por intento: imperceptible
 * al entrar, y caro de repetir millones de veces si algún día se filtra la
 * tabla. Los parámetros se guardan junto a cada hash, así que subirlos más
 * adelante no invalida las contraseñas existentes.
 */
const N = 16384;
const R = 8;
const P = 1;
const LARGO = 64;

/** Contraseñas más cortas que esto no valen la pena ni como puerta. */
export const MINIMO_PASSWORD = 10;

export async function hashearPassword(password: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(password, sal, LARGO, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Compara una contraseña contra lo guardado.
 *
 * La comparación es de tiempo constante: una que corta en el primer byte
 * distinto tarda distinto según cuánto acertó, y eso alcanza para adivinar el
 * hash a fuerza de medir. Un formato que no se entienda devuelve `false` en vez
 * de tirar error, para que una fila corrupta no cuelgue el ingreso de todos.
 */
export async function verificarPassword(password: string, guardado: string): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const [, n, r, p, salHex, hashHex] = partes;
  const sal = Buffer.from(salHex, "hex");
  const esperado = Buffer.from(hashHex, "hex");
  if (sal.length === 0 || esperado.length === 0) return false;

  try {
    const calculado = await derivar(password, sal, esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

function parsear(fila: FilaPerfil): Perfil {
  return {
    id: fila.id,
    email: fila.email,
    nombre: fila.nombre?.trim() || null,
    rol: fila.rol === "admin" ? "admin" : "operador",
    activo: fila.activo !== false,
    creado: fila.created_at ? new Date(fila.created_at) : null,
    creadoPor: fila.creado_por?.trim() || null,
    ultimoIngreso: fila.ultimo_ingreso ? new Date(fila.ultimo_ingreso) : null,
  };
}

/** El correo siempre en minúsculas: es la identidad y no puede depender del teclado. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Busca un perfil por correo, con su hash. Solo para el ingreso.
 *
 * Devuelve `null` también si la tabla todavía no existe, para que un proyecto
 * sin `perfiles.sql` corrido falle como "credenciales inválidas" y no con un
 * error de base en la pantalla de acceso.
 */
export async function perfilConPassword(
  email: string,
): Promise<{ perfil: Perfil; hash: string } | null> {
  try {
    const filas = await consultarFresco<FilaPerfil>(TABLA_PERFILES, {
      email: `eq.${normalizarEmail(email)}`,
      limit: "1",
    });
    const fila = filas[0];
    return fila ? { perfil: parsear(fila), hash: fila.password_hash } : null;
  } catch (error) {
    if (error instanceof TablaFaltante) return null;
    throw error;
  }
}

/** El perfil de alguien, sin el hash. */
export async function buscarPerfil(email: string): Promise<Perfil | null> {
  const encontrado = await perfilConPassword(email);
  return encontrado?.perfil ?? null;
}

/** Un perfil por id, para las operaciones administrativas. */
export async function buscarPerfilPorId(id: string): Promise<Perfil | null> {
  const filas = await consultarFresco<FilaPerfil>(TABLA_PERFILES, {
    id: `eq.${id}`,
    limit: "1",
  });
  return filas[0] ? parsear(filas[0]) : null;
}

/**
 * Cuántos administradores activos quedan.
 *
 * Se consulta antes de bajar a alguien de admin o de desactivarlo: si el último
 * se va, el tablero queda sin quién cree perfiles y sin forma de arreglarlo
 * desde la web. La salida sería volver a correr el SQL a mano.
 */
export async function adminsActivos(): Promise<number> {
  const filas = await consultarFresco<FilaPerfil>(TABLA_PERFILES, {
    rol: "eq.admin",
    activo: "is.true",
    select: "id",
  });
  return filas.length;
}

export async function editarPerfilEn(
  id: string,
  cambios: { email: string; nombre: string | null; rol: RolPerfil },
): Promise<string | null> {
  return actualizarFila(TABLA_PERFILES, id, {
    email: normalizarEmail(cambios.email),
    nombre: cambios.nombre,
    rol: cambios.rol,
  });
}

export async function listarPerfiles(): Promise<Perfil[]> {
  const filas = await consultarFresco<FilaPerfil>(TABLA_PERFILES, { order: "created_at.asc" });
  return filas.map(parsear);
}

export async function crearPerfilEn(datos: {
  email: string;
  nombre: string | null;
  password: string;
  rol: RolPerfil;
  creadoPor: string;
}): Promise<string | null> {
  return insertarFila(TABLA_PERFILES, {
    email: normalizarEmail(datos.email),
    nombre: datos.nombre,
    password_hash: await hashearPassword(datos.password),
    rol: datos.rol,
    creado_por: datos.creadoPor,
  });
}

export async function guardarPassword(id: string, password: string): Promise<string | null> {
  return actualizarFila(TABLA_PERFILES, id, { password_hash: await hashearPassword(password) });
}

export async function cambiarActivoEn(id: string, activo: boolean): Promise<string | null> {
  return actualizarFila(TABLA_PERFILES, id, { activo });
}

/**
 * Deja constancia del ingreso.
 *
 * Sirve para ver quién dejó de usar el tablero antes de desactivarle el perfil.
 * No corta el ingreso si falla: sería absurdo dejar a alguien afuera porque no
 * se pudo escribir una fecha.
 */
export async function registrarIngreso(id: string): Promise<void> {
  await actualizarFila(TABLA_PERFILES, id, { ultimo_ingreso: new Date().toISOString() }).catch(
    () => null,
  );
}
