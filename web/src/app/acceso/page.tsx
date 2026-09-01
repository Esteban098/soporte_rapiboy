import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn, tieneAcceso } from "@/auth";
import estilos from "./acceso.module.css";

export const metadata = { title: "Acceso" };

/**
 * Un mensaje por cada forma de no entrar.
 *
 * `CredentialsSignin` no distingue entre correo inexistente, perfil
 * desactivado y contraseña equivocada, y el texto tampoco: si cada caso dijera
 * algo distinto, esta pantalla serviría para averiguar qué correos tienen
 * cuenta.
 */
const MENSAJES: Record<string, string> = {
  CredentialsSignin: "Correo o contraseña incorrectos.",
  AccessDenied: "Esa cuenta no está habilitada. Pedile acceso a quien administra el tablero.",
};

export default async function Acceso({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (tieneAcceso(sesion?.user?.email, sesion?.user?.rol)) redirect("/");

  const { error } = await searchParams;
  const conGoogle = Boolean(process.env.GOOGLE_CLIENT_ID);

  return (
    <div className={estilos.pantalla}>
      <div className={estilos.caja}>
        <span className={estilos.marca} aria-hidden="true" />
        <h1 className={estilos.titulo}>Tablero de Operación</h1>
        <p className={estilos.dek}>
          Casos abiertos, demoras y reclamos de tienda de la operación de México. El acceso está
          limitado al equipo de soporte.
        </p>

        {error ? (
          <p className={estilos.error}>
            {MENSAJES[error] ?? "No se pudo completar el ingreso. Probá de nuevo."}
          </p>
        ) : null}

        <form
          className={estilos.formulario}
          action={async (datos: FormData) => {
            "use server";
            try {
              await signIn("credentials", {
                email: String(datos.get("email") ?? ""),
                password: String(datos.get("password") ?? ""),
                redirectTo: "/",
              });
            } catch (falla) {
              // `signIn` señala el redirect con una excepción, así que solo se
              // atrapa el error de autenticación; cualquier otra cosa tiene que
              // seguir subiendo o el ingreso exitoso nunca navegaría.
              if (falla instanceof AuthError) redirect("/acceso?error=CredentialsSignin");
              throw falla;
            }
          }}
        >
          <label className={estilos.campo}>
            <span className={estilos.etiqueta}>Correo</span>
            <input
              className={estilos.entrada}
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>

          <label className={estilos.campo}>
            <span className={estilos.etiqueta}>Contraseña</span>
            <input
              className={estilos.entrada}
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" className={estilos.boton}>
            Entrar
          </button>
        </form>

        {conGoogle ? (
          <>
            <p className={estilos.separador}>o</p>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button type="submit" className={estilos.botonSecundario}>
                Entrar con Google
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
