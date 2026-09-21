import { buscarPerfil, listarPerfiles } from "@/lib/perfiles";
import { operadorActual } from "@/lib/sesion";
import { PageHead } from "@/components/Shell";
import { PanelPerfiles, type FilaPerfil } from "@/components/PanelPerfiles";
import { UsoAsistente } from "@/components/UsoAsistente";
import { usoPorPersona } from "@/lib/asistente-costos";
import { leerUsoDelMes } from "@/lib/asistente-uso";
import { esMesValido, mesAnterior, mesEnCurso } from "@/lib/periodos";

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

export default async function Perfiles({
  searchParams,
}: {
  searchParams: Promise<{ uso?: string }>;
}) {
  const operador = await operadorActual();
  if (!operador) return null;

  const admin = operador.rol === "admin";

  // El uso del asistente dice quién pregunta y cuánto: es del administrador,
  // y para cualquier otro ni se lee. El mes se elige por la URL (`?uso=`).
  const actual = mesEnCurso();
  const pedido = (await searchParams).uso;
  const mesUso = esMesValido(pedido) && pedido <= actual ? pedido : actual;
  const uso = admin ? await leerUsoDelMes(mesUso) : null;

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
      {uso ? (
        <UsoAsistente
          mes={mesUso}
          anterior={mesAnterior(mesUso)}
          siguiente={mesUso < actual ? mesSiguiente(mesUso) : null}
          personas={usoPorPersona(uso.filas)}
          sinTabla={uso.sinTabla}
        />
      ) : null}
    </>
  );
}

/** El mes que sigue a uno escrito como `AAAA-MM`. */
function mesSiguiente(mes: string): string {
  const [anio, numeroMes] = mes.split("-").map(Number);
  return numeroMes === 12 ? `${anio + 1}-01` : `${anio}-${String(numeroMes + 1).padStart(2, "0")}`;
}
