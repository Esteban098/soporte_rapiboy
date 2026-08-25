import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Acceso restringido al equipo. La lista de habilitados se define por variables
 * de entorno: un dominio de Google Workspace, una lista explícita de correos, o
 * ambas. Si no se configura ninguna, no entra nadie — es preferible a que el
 * tablero quede abierto por un despiste de configuración.
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

export function puedeEntrar(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalizado = email.toLowerCase();
  const { dominio, correos } = habilitados();

  if (correos.has(normalizado)) return true;
  if (dominio && normalizado.endsWith(`@${dominio}`)) return true;
  return false;
}

/**
 * En desarrollo, mientras todavía no hay credenciales de Google cargadas, el
 * tablero se abre sin login para poder trabajar sobre la interfaz. La condición
 * exige que NO sea producción, así un despliegue sin configurar nunca queda
 * abierto: ahí falta el client id y el ingreso simplemente falla.
 */
export function authDeshabilitada(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.GOOGLE_CLIENT_ID;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
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
    signIn({ profile }) {
      // Google marca si el correo está verificado; sin eso, cualquiera podría
      // crear una cuenta con un alias del dominio.
      if (profile?.email_verified === false) return false;
      return puedeEntrar(profile?.email);
    },
    authorized({ auth: sesion }) {
      return puedeEntrar(sesion?.user?.email);
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
});
