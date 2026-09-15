import { NextResponse } from "next/server";
import { auth, authDeshabilitada, tieneAcceso } from "@/auth";
import { inicioDe, puedeVerRuta } from "@/lib/permisos";

/**
 * Protege todo el tablero: sin sesión habilitada, cualquier ruta redirige a la
 * pantalla de acceso. Quedan fuera los endpoints de autenticación, los assets
 * de Next y el favicon.
 *
 * Además aplica lo que ve cada rol: un comercial que pide una pantalla que no
 * le toca vuelve a Tiendas, y un endpoint le responde 403. El rol viaja en el
 * JWT, así que no hace falta consultar la base en cada navegación.
 */
export const proxy = auth((request) => {
  if (authDeshabilitada()) return NextResponse.next();

  const ruta = request.nextUrl.pathname;
  const enAcceso = ruta === "/acceso";
  const rol = request.auth?.user?.rol;
  const habilitado = tieneAcceso(request.auth?.user?.email, rol);

  if (!habilitado && !enAcceso) {
    return NextResponse.redirect(new URL("/acceso", request.nextUrl));
  }
  if (habilitado && enAcceso) {
    return NextResponse.redirect(new URL(inicioDe(rol), request.nextUrl));
  }
  if (habilitado && !puedeVerRuta(rol, ruta)) {
    if (ruta.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Sin permiso." }, { status: 403 });
    }
    return NextResponse.redirect(new URL(inicioDe(rol), request.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
