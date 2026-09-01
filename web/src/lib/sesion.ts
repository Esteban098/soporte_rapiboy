import "server-only";
import { auth, authDeshabilitada, tieneAcceso } from "@/auth";
import type { RolPerfil } from "./perfiles";

/**
 * Quién está operando, o `null` si no tiene permiso.
 *
 * Se comprueba acá y no solo en el proxy porque una Server Action se puede
 * invocar por HTTP directamente, sin pasar por la página que la usa: el proxy
 * cuida la navegación, esto cuida la escritura.
 *
 * El correo es también lo que queda registrado en la base —`editado_por`,
 * `creado_por`, `atendido_por`—, así que esta función es la única definición de
 * "quién hizo esto" en todo el proyecto.
 */
export type Operador = { email: string; rol: RolPerfil };

export async function operadorActual(): Promise<Operador | null> {
  // Con el bypass de desarrollo prendido no hay sesión que mirar. Queda como
  // admin para poder trabajar sobre la pantalla de perfiles, y con un correo
  // que se distingue a simple vista de uno real en la base.
  if (authDeshabilitada()) return { email: "local", rol: "admin" };

  const sesion = await auth();
  const email = sesion?.user?.email ?? null;
  const rol = sesion?.user?.rol ?? null;
  if (!email || !tieneAcceso(email, rol)) return null;

  // Quien entró por la lista blanca de Google no tiene perfil en la base, así
  // que no es admin: administrar perfiles pide tener uno.
  return { email, rol: rol ?? "operador" };
}

/** El correo de quien opera, que es lo único que necesita casi todo el código. */
export async function usuarioActual(): Promise<string | null> {
  const operador = await operadorActual();
  return operador?.email ?? null;
}

/** Si quien opera puede administrar perfiles. */
export async function esAdmin(): Promise<boolean> {
  const operador = await operadorActual();
  return operador?.rol === "admin";
}
