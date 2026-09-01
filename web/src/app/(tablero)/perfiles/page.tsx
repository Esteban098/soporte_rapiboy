import { buscarPerfil, listarPerfiles } from "@/lib/perfiles";
import { operadorActual } from "@/lib/sesion";
import { PageHead } from "@/components/Shell";
import { PanelPerfiles, type FilaPerfil } from "@/components/PanelPerfiles";

export const metadata = { title: "Perfiles" };

/** Fecha corta en horario de México. Vacío queda vacío, no "hoy". */
function cuando(fecha: Date | null): string {
  if (!fecha) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(fecha);
}

export default async function Perfiles() {
  const operador = await operadorActual();
  if (!operador) return null;

  const admin = operador.rol === "admin";

  // Quien no administra ve solo su propia fila, y no porque la pantalla la
  // esconda: la lista de los demás nunca sale del servidor. Esconder en el
  // cliente lo que igual se manda es esconderlo únicamente de quien no mira.
  const perfiles = admin
    ? await listarPerfiles()
    : [await buscarPerfil(operador.email)].filter((p) => p !== null);

  const filas: FilaPerfil[] = perfiles.map((perfil) => ({
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre ?? "",
    rol: perfil.rol,
    activo: perfil.activo,
    creado: cuando(perfil.creado),
    creadoPor: perfil.creadoPor ?? "",
    ultimoIngreso: cuando(perfil.ultimoIngreso),
  }));

  return (
    <>
      <PageHead
        eyebrow="Acceso"
        titulo={admin ? "Perfiles" : "Mi perfil"}
        dek={
          admin
            ? "Quién puede entrar al tablero y con qué permiso. Los perfiles los creás vos; no hay registro abierto, así que nadie entra por su cuenta."
            : "Tu nombre y tu contraseña. Crear perfiles y cambiar roles es cosa de quien administra el tablero."
        }
      />
      {/* `puedeAdministrar` decide qué se muestra, pero cada acción vuelve a
          comprobar el rol en el servidor: el menú es una comodidad, no un
          permiso. */}
      <PanelPerfiles perfiles={filas} yo={operador.email} puedeAdministrar={admin} />
    </>
  );
}
