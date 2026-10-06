import { ReportesChatSellers } from "@/components/ReportesChatSellers";
import { PageHead } from "@/components/Shell";
import estilos from "@/components/chat-admin.module.css";
import { reporteChats } from "@/lib/chat-sellers";
import { listarPerfiles } from "@/lib/perfiles";
import { operadorActual } from "@/lib/sesion";
import { redirect } from "next/navigation";

export const metadata = { title: "Reportes · Chat de sellers" };
export const dynamic = "force-dynamic";

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function fechaValida(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(new Date(`${valor}T12:00:00Z`).getTime());
}

export default async function ReportesChatPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; usuario?: string }> }) {
  if (!await operadorActual()) redirect("/acceso");
  const parametros = await searchParams;
  const hoy = hoyArgentina();
  let desde = fechaValida(parametros.desde) ? parametros.desde : hoy;
  let hasta = fechaValida(parametros.hasta) ? parametros.hasta : hoy;
  const dias = (new Date(`${hasta}T12:00:00Z`).getTime() - new Date(`${desde}T12:00:00Z`).getTime()) / 86_400_000;
  if (desde > hasta || dias > 366) { desde = hoy; hasta = hoy; }
  const usuario = typeof parametros.usuario === "string" && parametros.usuario.includes("@") ? parametros.usuario.toLowerCase() : null;
  const [reporte, perfiles] = await Promise.all([reporteChats(desde, hasta, usuario), listarPerfiles()]);
  return <>
    <PageHead eyebrow="Chat de sellers" titulo="Reportes" dek="Volumen, respuestas y tiempos del servicio de WhatsApp, expresados en horario de Argentina." />
    <form className={estilos.filtros} method="get">
      <label>Desde<input type="date" name="desde" defaultValue={desde} max={hoy} /></label>
      <label>Hasta<input type="date" name="hasta" defaultValue={hasta} max={hoy} /></label>
      <label>Usuario<select name="usuario" defaultValue={usuario ?? ""}><option value="">Todos</option>{perfiles.filter((perfil) => perfil.activo).map((perfil) => <option key={perfil.id} value={perfil.email}>{perfil.nombre || perfil.email}</option>)}</select></label>
      <button type="submit">Aplicar</button>
    </form>
    <ReportesChatSellers reporte={reporte} />
  </>;
}
