import { redirect } from "next/navigation";
import { auth, puedeEntrar, signIn } from "@/auth";
import estilos from "./acceso.module.css";

export const metadata = { title: "Acceso" };

export default async function Acceso({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (puedeEntrar(sesion?.user?.email)) redirect("/");

  const { error } = await searchParams;

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
            {error === "AccessDenied"
              ? "Esa cuenta no está habilitada. Pedile acceso a quien administra el tablero."
              : "No se pudo completar el ingreso. Probá de nuevo."}
          </p>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit" className={estilos.boton}>
            Entrar con Google
          </button>
        </form>
      </div>
    </div>
  );
}
