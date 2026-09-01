import { NextResponse } from "next/server";
import { auth, authDeshabilitada, tieneAcceso } from "@/auth";

/**
 * Protege todo el tablero: sin sesión habilitada, cualquier ruta redirige a la
 * pantalla de acceso. Quedan fuera los endpoints de autenticación, los assets
 * de Next y el favicon.
 */
export const proxy = auth((request) => {
  if (authDeshabilitada()) return NextResponse.next();

  const enAcceso = request.nextUrl.pathname === "/acceso";
  const habilitado = tieneAcceso(request.auth?.user?.email, request.auth?.user?.rol);

  if (!habilitado && !enAcceso) {
    return NextResponse.redirect(new URL("/acceso", request.nextUrl));
  }
  if (habilitado && enAcceso) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
