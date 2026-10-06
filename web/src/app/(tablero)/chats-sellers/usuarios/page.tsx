import { PageHead } from "@/components/Shell";
import estilos from "@/components/chat-admin.module.css";
import { fechaHoraArgentina } from "@/lib/formato";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { listarPerfiles } from "@/lib/perfiles";
import { operadorActual } from "@/lib/sesion";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Usuarios · Chat de sellers" };
export const dynamic = "force-dynamic";

export default async function UsuariosChatPage() {
  const operador = await operadorActual();
  if (!operador) redirect("/acceso");
  const perfiles = await listarPerfiles();
  return <>
    <PageHead eyebrow="Chat de sellers" titulo="Usuarios" dek="Personas que pueden tomar y responder conversaciones. Los permisos se administran desde Perfiles." />
    <section className={estilos.panel}>
      <div className={estilos.toolbar}>
        <span>{perfiles.length} usuario{perfiles.length === 1 ? "" : "s"}</span>
        {operador.rol === "admin" ? <Link className={estilos.accion} href="/perfiles" target="_blank" rel="noreferrer">Administrar usuarios</Link> : null}
      </div>
      <div className={estilos.tablaWrap}>
        <table className={estilos.tabla}>
          <thead><tr><th>Usuario</th><th>Perfil</th><th>Último ingreso</th><th>Estado</th></tr></thead>
          <tbody>{perfiles.map((perfil) => <tr key={perfil.id}>
            <td><div className={estilos.usuario}><span className={estilos.avatar}>{(perfil.nombre || perfil.email).slice(0, 1).toUpperCase()}</span><span><strong>{perfil.nombre || "Sin nombre"}</strong><small>{perfil.email}</small></span></div></td>
            <td>{ETIQUETA_ROL[perfil.rol]}</td>
            <td>{fechaHoraArgentina(perfil.ultimoIngreso)}</td>
            <td><span className={perfil.activo ? estilos.activo : estilos.inactivo}>{perfil.activo ? "Activo" : "Desactivado"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </>;
}
