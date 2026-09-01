import type { DefaultSession } from "next-auth";
import type { RolPerfil } from "@/lib/perfiles";

/**
 * El rol del perfil viaja en la sesión y en el JWT.
 *
 * Sin esto, cada lugar que lo lee tendría que castear, y el día que cambien los
 * roles el compilador no avisaría en ninguno.
 */
declare module "next-auth" {
  interface Session {
    user: { rol?: RolPerfil } & DefaultSession["user"];
  }

  interface User {
    rol?: RolPerfil;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol?: RolPerfil;
  }
}
