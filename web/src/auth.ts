import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { RolPerfil } from "@/lib/perfiles";

/**
 * Acceso al tablero, por dos caminos que terminan en la misma sesión.
 *
 * 1. **Correo y contraseña**, contra la tabla `perfiles`. Los perfiles los crea
 *    el administrador desde la web; no hay registro abierto.
 * 2. **Google**, para las cuentas que estén en `ALLOWED_EMAILS` o en el dominio
 *    habilitado. Es como funcionaba antes y se mantiene: quien ya entraba así
 *    sigue entrando.
 *
 * El rol viaja en el JWT, así que el proxy puede decidir si alguien pasa sin
 * consultar la base en cada navegación.
 */
function habilitados(): { dominio: string | null; correos: Set<string> } {
  const dominio = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase() || null;
  const correos = new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );
  return { dominio, correos };
}

/** Si el correo está en la lista blanca de siempre. No mira la tabla `perfiles`. */
export function puedeEntrar(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalizado = email.toLowerCase();
  const { dominio, correos } = habilitados();

  if (correos.has(normalizado)) return true;
  if (dominio && normalizado.endsWith(`@${dominio}`)) return true;
  return false;
}

/**
 * Abre el tablero sin login. Solo fuera de producción y solo si se pide.
 *
 * Antes se activaba sola cuando faltaba `GOOGLE_CLIENT_ID`, porque sin eso no
 * había forma de entrar en local. Ahora sí la hay —correo y contraseña, sin
 * nada externo que configurar—, así que el bypass pasó a ser explícito: se
 * prende con `AUTH_ABIERTO=1`. Vale como salida de emergencia si alguien se
 * queda afuera antes de correr `supabase/perfiles.sql`.
 */
export function authDeshabilitada(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_ABIERTO === "1";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Correo y contraseña",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credenciales) {
        const email = typeof credenciales?.email === "string" ? credenciales.email : "";
        const password = typeof credenciales?.password === "string" ? credenciales.password : "";
        if (!email || !password) return null;

        // Se importa acá adentro y no arriba: este módulo lo carga también el
        // proxy, que corre en el runtime de edge, y `node:crypto` no existe
        // ahí. El `authorize` solo se ejecuta en el servidor de Node.
        const { perfilConPassword, registrarIngreso, verificarPassword } = await import(
          "@/lib/perfiles"
        );

        const encontrado = await perfilConPassword(email);
        // Mismo resultado para "no existe", "está desactivado" y "la clave no
        // es": si cada caso respondiera distinto, la pantalla de acceso serviría
        // para averiguar qué correos tienen cuenta.
        if (!encontrado || !encontrado.perfil.activo) return null;
        if (!(await verificarPassword(password, encontrado.hash))) return null;

        await registrarIngreso(encontrado.perfil.id);

        return {
          id: encontrado.perfil.id,
          email: encontrado.perfil.email,
          name: encontrado.perfil.nombre ?? encontrado.perfil.email,
          rol: encontrado.perfil.rol,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/acceso",
    error: "/acceso",
  },
  callbacks: {
    signIn({ account, profile }) {
      // El proveedor de credenciales ya decidió en `authorize`; volver a
      // preguntar acá lo rechazaría, porque no trae `profile`.
      if (account?.provider !== "google") return true;

      // Google marca si el correo está verificado; sin eso, cualquiera podría
      // crear una cuenta con un alias del dominio.
      if (profile?.email_verified === false) return false;
      return puedeEntrar(profile?.email);
    },
    jwt({ token, user }) {
      // `user` solo viene en el ingreso; después el rol viaja en el token.
      if (user && "rol" in user) token.rol = user.rol as RolPerfil;
      return token;
    },
    session({ session, token }) {
      if (token.rol) session.user.rol = token.rol as RolPerfil;
      return session;
    },
    authorized({ auth: sesion }) {
      return tieneAcceso(sesion?.user?.email, sesion?.user?.rol);
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
});

/**
 * Si una sesión puede ver el tablero.
 *
 * Un rol en la sesión significa que entró con un perfil activo de la base; el
 * resto sigue pasando por la lista blanca de Google. Se resuelve mirando el
 * token y no la base, para que el proxy no consulte Supabase en cada
 * navegación.
 */
export function tieneAcceso(
  email: string | null | undefined,
  rol: RolPerfil | null | undefined,
): boolean {
  return Boolean(rol) || puedeEntrar(email);
}
