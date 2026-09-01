"use server";

import { operadorActual } from "@/lib/sesion";
import {
  MINIMO_PASSWORD,
  adminsActivos,
  buscarPerfil,
  buscarPerfilPorId,
  editarPerfilEn,
  cambiarActivoEn,
  crearPerfilEn,
  guardarPassword,
  normalizarEmail,
  perfilConPassword,
  verificarPassword,
  type RolPerfil,
} from "@/lib/perfiles";

/**
 * Administración de perfiles.
 *
 * Crear, desactivar y resetear contraseñas es exclusivo del administrador.
 * Cambiar la propia contraseña lo puede hacer cualquiera con perfil: si no,
 * el administrador sabría la clave de todo el equipo para siempre.
 */

export type Resultado = { ok: true } | { ok: false; error: string };

const ROLES: RolPerfil[] = ["admin", "operador"];

/** Quien administra, o `null`. Toda acción de este módulo arranca por acá. */
async function administrador(): Promise<string | null> {
  const operador = await operadorActual();
  return operador?.rol === "admin" ? operador.email : null;
}

function revisarPassword(password: string): string | null {
  if (password.length < MINIMO_PASSWORD) {
    return `La contraseña necesita al menos ${MINIMO_PASSWORD} caracteres.`;
  }
  return null;
}

/** Un correo con forma de correo. No valida que exista; eso lo dice el primer ingreso. */
function revisarEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "Ese correo no tiene forma de correo.";
}

export async function crearPerfil(datos: {
  email: string;
  nombre: string;
  password: string;
  rol: RolPerfil;
}): Promise<Resultado> {
  const quien = await administrador();
  if (!quien) return { ok: false, error: "Solo el administrador puede crear perfiles." };

  const email = normalizarEmail(datos.email);
  const malEmail = revisarEmail(email);
  if (malEmail) return { ok: false, error: malEmail };

  const malPassword = revisarPassword(datos.password);
  if (malPassword) return { ok: false, error: malPassword };

  if (!ROLES.includes(datos.rol)) return { ok: false, error: "Ese rol no existe." };

  if (await buscarPerfil(email)) {
    return { ok: false, error: "Ya hay un perfil con ese correo." };
  }

  const falla = await crearPerfilEn({
    email,
    nombre: datos.nombre.trim() || null,
    password: datos.password,
    rol: datos.rol,
    creadoPor: quien,
  });
  if (falla) return { ok: false, error: falla };

  return { ok: true };
}

/**
 * Cambia correo, nombre y rol de un perfil. También del propio.
 *
 * Dos cosas que no deja hacer, las dos por el mismo motivo —que el tablero no
 * quede sin quién lo administre y sin arreglo desde la web—:
 *
 * - bajarte a vos mismo de administrador;
 * - bajar al último administrador activo que queda.
 *
 * La segunda cubre el caso que la primera no ve: dos admins, uno baja al otro y
 * después se baja solo. Ahí la primera regla ya no alcanza.
 */
export async function editarPerfil(
  id: string,
  datos: { email: string; nombre: string; rol: RolPerfil },
): Promise<Resultado> {
  const quien = await administrador();
  if (!quien) return { ok: false, error: "Solo el administrador puede editar perfiles." };
  if (!id.trim()) return { ok: false, error: "Falta el perfil." };
  if (!ROLES.includes(datos.rol)) return { ok: false, error: "Ese rol no existe." };

  const email = normalizarEmail(datos.email);
  const malEmail = revisarEmail(email);
  if (malEmail) return { ok: false, error: malEmail };

  const perfil = await buscarPerfilPorId(id);
  if (!perfil) return { ok: false, error: "Ese perfil ya no está." };

  // El correo es la identidad: dos perfiles con el mismo dejarían sin definir
  // quién hizo qué en los reportes.
  const ocupado = await buscarPerfil(email);
  if (ocupado && ocupado.id !== id) {
    return { ok: false, error: "Ya hay otro perfil con ese correo." };
  }

  const bajaDeAdmin = perfil.rol === "admin" && datos.rol !== "admin";
  if (bajaDeAdmin) {
    if (perfil.email === quien) {
      return { ok: false, error: "No podés quitarte a vos mismo el rol de administrador." };
    }
    if ((await adminsActivos()) <= 1) {
      return { ok: false, error: "Es el único administrador activo. Nombrá otro antes de bajarlo." };
    }
  }

  const falla = await editarPerfilEn(id, {
    email,
    nombre: datos.nombre.trim() || null,
    rol: datos.rol,
  });
  if (falla) return { ok: false, error: falla };

  return { ok: true };
}

/**
 * Cambio del propio nombre, para quien no administra.
 *
 * El correo no se toca desde acá: es la identidad con la que quedan firmados
 * los reportes y las ediciones, y cambiarla es una operación administrativa.
 */
export async function editarMiNombre(nombre: string): Promise<Resultado> {
  const operador = await operadorActual();
  if (!operador) return { ok: false, error: "No hay sesión." };

  const perfil = await buscarPerfil(operador.email);
  if (!perfil) {
    return { ok: false, error: "Tu ingreso no usa un perfil de la base, así que no hay qué editar." };
  }

  const falla = await editarPerfilEn(perfil.id, {
    email: perfil.email,
    nombre: nombre.trim() || null,
    rol: perfil.rol,
  });
  if (falla) return { ok: false, error: falla };

  return { ok: true };
}

/**
 * Activa o desactiva un perfil.
 *
 * Se desactiva en vez de borrar: el correo sigue figurando en los reportes y
 * las ediciones que hizo esa persona, y borrar la fila dejaría ese rastro sin
 * dueño. Un perfil desactivado no entra más, pero su historia queda.
 */
export async function cambiarActivo(id: string, activo: boolean): Promise<Resultado> {
  const quien = await administrador();
  if (!quien) return { ok: false, error: "Solo el administrador puede desactivar perfiles." };

  // Nadie se desactiva a sí mismo: quedaría el tablero sin quién administre y
  // sin forma de volver a entrar desde la web.
  const propio = await buscarPerfil(quien);
  if (propio?.id === id && !activo) {
    return { ok: false, error: "No podés desactivar tu propio perfil." };
  }

  if (!activo) {
    const perfil = await buscarPerfilPorId(id);
    if (perfil?.rol === "admin" && (await adminsActivos()) <= 1) {
      return {
        ok: false,
        error: "Es el único administrador activo. Nombrá otro antes de desactivarlo.",
      };
    }
  }

  const falla = await cambiarActivoEn(id, activo);
  if (falla) return { ok: false, error: falla };
  return { ok: true };
}

/**
 * Le pone una contraseña nueva a alguien.
 *
 * Es un reseteo administrativo, para cuando una persona no puede entrar. El
 * administrador queda sabiendo esa clave, así que conviene que quien la reciba
 * la cambie desde su sesión.
 */
export async function resetearPassword(id: string, password: string): Promise<Resultado> {
  const quien = await administrador();
  if (!quien) return { ok: false, error: "Solo el administrador puede resetear contraseñas." };

  const mal = revisarPassword(password);
  if (mal) return { ok: false, error: mal };

  const falla = await guardarPassword(id, password);
  if (falla) return { ok: false, error: falla };
  return { ok: true };
}

/**
 * Cambio de la propia contraseña.
 *
 * Pide la actual aunque haya sesión iniciada: si alcanzara con estar logueado,
 * una computadora dejada abierta un minuto sería suficiente para quedarse con
 * la cuenta.
 */
export async function cambiarMiPassword(actual: string, nueva: string): Promise<Resultado> {
  const operador = await operadorActual();
  if (!operador) return { ok: false, error: "No hay sesión." };

  const mal = revisarPassword(nueva);
  if (mal) return { ok: false, error: mal };

  const encontrado = await perfilConPassword(operador.email);
  if (!encontrado) {
    return {
      ok: false,
      error: "Tu ingreso no usa contraseña, así que no hay ninguna que cambiar.",
    };
  }
  if (!(await verificarPassword(actual, encontrado.hash))) {
    return { ok: false, error: "La contraseña actual no coincide." };
  }

  const falla = await guardarPassword(encontrado.perfil.id, nueva);
  if (falla) return { ok: false, error: falla };
  return { ok: true };
}
