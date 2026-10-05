import { NextResponse } from "next/server";
import { auth, authDeshabilitada, tieneAcceso } from "@/auth";
import { inicioDe, puedeVerRuta } from "@/lib/permisos";

/**
 * Protege todo el tablero: sin sesión habilitada, cualquier ruta redirige a la
 * pantalla de acceso. Quedan fuera los endpoints de autenticación, el webhook
 * público de Meta (que valida su propio token y firma), los assets de Next y
 * el ícono de la pestaña (`app/icon.png`, servido en `/icon.png`): sin eso la
 * pantalla de acceso y el rol comercial se quedarían sin él.
 *
 * Además aplica lo que ve cada rol: un comercial que pide una pantalla que no
 * le toca vuelve a Tiendas, y un endpoint le responde 403. El rol viaja en el
 * JWT, así que no hace falta consultar la base en cada navegación.
 */
export const proxy = auth((request) => {
  // Meta debe poder completar el desafío y n8n debe alcanzar sus endpoints
  // internos sin sesión. Cada Route Handler valida su propio verify token,
  // firma HMAC o Bearer secreto antes de leer o modificar datos.
  const ruta = request.nextUrl.pathname;
  if (ruta === "/api/whatsapp/webhook" || ruta.startsWith("/api/whatsapp/worker/")) {
    return NextResponse.next();
  }

  if (authDeshabilitada()) return NextResponse.next();

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
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.png).*)"],
};
