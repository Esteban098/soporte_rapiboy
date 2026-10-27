"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cambiarActivo,
  cambiarMiPassword,
  crearTokenAsistenteExtension,
  revocarTokenAsistente,
  crearPerfil,
  editarMiNombre,
  resetearPassword,
} from "@/app/perfiles";
import { ETIQUETA_ROL, aRol } from "@/lib/permisos";
import { EditorPerfil } from "./EditorPerfil";
import estilos from "./ui.module.css";
import tabla from "./tabla.module.css";
import propio from "./perfiles.module.css";
import { TablaOrdenable } from "./TablaOrdenable";

/** Un perfil como lo necesita la pantalla: sin hash, con fechas ya en texto. */
export type FilaPerfil = {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  creado: string;
  creadoPor: string;
  ultimoIngreso: string;
};

/**
 * Alta, baja y reseteo de perfiles, más el cambio de la propia contraseña.
 *
 * Todo en un componente porque son tres formularios cortos sobre la misma
 * tabla: separarlos obligaría a repetir el estado de error y el `router.refresh`
 * en cada uno.
 */
export function PanelPerfiles({
  perfiles,
  yo,
  puedeAdministrar,
  extension,
}: {
  perfiles: FilaPerfil[];
  /** Correo de quien está mirando, para no dejarlo desactivarse solo. */
  yo: string;
  puedeAdministrar: boolean;
  extension: { disponible: boolean; vinculado: boolean; venceEn: string };
}) {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("operador");

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [miNombre, setMiNombre] = useState(perfiles.find((p) => p.email === yo)?.nombre ?? "");
  const [editando, setEditando] = useState<FilaPerfil | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tokenExtension, setTokenExtension] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [trabajando, iniciar] = useTransition();
  const router = useRouter();

  /** Corre una acción y deja el resultado en pantalla. */
  function correr(accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    iniciar(async () => {
      setError(null);
      setAviso(null);
      const resultado = await accion();

      if (!resultado.ok) {
        setError(resultado.error ?? "No se pudo completar.");
        return;
      }
      setAviso(exito);
      router.refresh();
    });
  }

  function alta() {
    correr(
      () => crearPerfil({ email, nombre, password, rol: aRol(rol) }),
      `Perfil creado. Pasale la contraseña a ${email.trim()} y pedile que la cambie desde su sesión.`,
    );
    setPassword("");
  }

  function resetear(perfil: FilaPerfil) {
    const nuevaClave = window.prompt(`Contraseña nueva para ${perfil.email}`);
    if (!nuevaClave) return;
    correr(
      () => resetearPassword(perfil.id, nuevaClave),
      `Contraseña cambiada. Pasásela a ${perfil.email} y pedile que la cambie.`,
    );
  }

  function vincularExtension() {
    iniciar(async () => {
      setError(null);
      setAviso(null);
      setCopiado(false);
      const resultado = await crearTokenAsistenteExtension();
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setTokenExtension(resultado.token);
      setAviso("Vinculación creada. Copiá el token ahora: no volverá a mostrarse.");
      router.refresh();
    });
  }

  function desvincularExtension() {
    correr(async () => {
      const resultado = await revocarTokenAsistente();
      if (resultado.ok) setTokenExtension("");
      return resultado;
    }, "Firefox quedó desvinculado.");
  }

  async function copiarToken() {
    await navigator.clipboard.writeText(tokenExtension);
    setCopiado(true);
  }

  return (
    <div className={estilos.stack}>
      {editando ? (
        <EditorPerfil perfil={editando} yo={yo} alCerrar={() => setEditando(null)} />
      ) : null}

      {error ? <p className={propio.error}>{error}</p> : null}
      {aviso ? <p className={propio.aviso}>{aviso}</p> : null}

      {puedeAdministrar ? (
        <section className={estilos.card}>
          <div className={estilos.cardHead}>
            <h2 className={estilos.cardTitle}>Crear un perfil</h2>
          </div>
          <p className={estilos.cardNote}>
            La contraseña la elegís vos y se la pasás por fuera. Queda guardada derivada con
            scrypt, así que nadie —ni vos, ni quien lea la base— puede volver a verla.
          </p>

          <div className={propio.formulario}>
            <label className={propio.campo}>
              <span className={propio.etiqueta}>Correo</span>
              <input
                className={propio.entrada}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@rapiboy.com"
                type="email"
                disabled={trabajando}
              />
            </label>

            <label className={propio.campo}>
              <span className={propio.etiqueta}>Nombre</span>
              <input
                className={propio.entrada}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Cómo aparece en el tablero"
                disabled={trabajando}
              />
            </label>

            <label className={propio.campo}>
              <span className={propio.etiqueta}>Contraseña inicial</span>
              <input
                className={propio.entrada}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Mínimo 10 caracteres"
                disabled={trabajando}
              />
            </label>

            <label className={propio.campo}>
              <span className={propio.etiqueta}>Rol</span>
              <select
                className={propio.entrada}
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                disabled={trabajando}
              >
                <option value="operador">Operador</option>
                <option value="comercial">Comercial · solo Tiendas y Colectas</option>
                <option value="admin">Administrador</option>
              </select>
            </label>

            <button type="button" className={propio.principal} onClick={alta} disabled={trabajando}>
              {trabajando ? "Creando…" : "Crear perfil"}
            </button>
          </div>
        </section>
      ) : null}

      {puedeAdministrar ? (
      <section className={estilos.card}>
        <div className={estilos.cardHead}>
          <h2 className={estilos.cardTitle}>Perfiles</h2>
        </div>
        <p className={estilos.cardNote}>
          Un perfil desactivado no entra más, pero su correo sigue figurando en los reportes y las
          ediciones que hizo. Por eso se desactiva en vez de borrarse.
        </p>

        <div className={estilos.tableWrap}>
          <TablaOrdenable
            filas={perfiles}
            claveFila={(perfil) => perfil.id}
            className={estilos.table}
            ordenInicial={{ clave: "email", asc: true }}
            columnas={[
              { clave: "email", titulo: "Correo", valor: (perfil) => perfil.email },
              { clave: "nombre", titulo: "Nombre", valor: (perfil) => perfil.nombre || "—" },
              {
                clave: "rol",
                titulo: "Rol",
                valor: (perfil) => ETIQUETA_ROL[aRol(perfil.rol)],
                render: (perfil) => (
                  <span
                    className={
                      perfil.rol === "admin"
                        ? propio.rolAdmin
                        : perfil.rol === "comercial"
                          ? propio.rolComercial
                          : propio.rolOperador
                    }
                  >
                    {ETIQUETA_ROL[aRol(perfil.rol)]}
                  </span>
                ),
              },
              { clave: "ultimoIngreso", titulo: "Último ingreso", valor: (perfil) => perfil.ultimoIngreso || "nunca", className: propio.fecha },
              { clave: "creado", titulo: "Creado", valor: (perfil) => perfil.creado, className: propio.fecha },
              {
                clave: "estado",
                titulo: "Estado",
                valor: (perfil) => perfil.activo,
                render: (perfil) => (
                  <span className={perfil.activo ? propio.activo : propio.inactivo}>
                    {perfil.activo ? "Activo" : "Desactivado"}
                  </span>
                ),
              },
              ...(puedeAdministrar
                ? [
                    {
                      clave: "acciones",
                      titulo: "Acciones",
                      valor: () => "",
                      ordenable: false,
                      className: tabla.celdaAccion,
                      render: (perfil: FilaPerfil) => (
                        <>
                          <button type="button" className={tabla.editar} onClick={() => setEditando(perfil)} disabled={trabajando}>Editar</button>
                          <button type="button" className={tabla.editar} onClick={() => resetear(perfil)} disabled={trabajando}>Resetear clave</button>
                          <button
                            type="button"
                            className={tabla.editar}
                            onClick={() => correr(() => cambiarActivo(perfil.id, !perfil.activo), perfil.activo ? `${perfil.email} ya no puede entrar.` : `${perfil.email} puede entrar de nuevo.`)}
                            disabled={trabajando || (perfil.email === yo && perfil.activo)}
                            title={perfil.email === yo && perfil.activo ? "No podés desactivar tu propio perfil" : undefined}
                          >
                            {perfil.activo ? "Desactivar" : "Activar"}
                          </button>
                        </>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </section>
      ) : null}

      <section className={estilos.card}>
        <div className={estilos.cardHead}>
          <h2 className={estilos.cardTitle}>Asistente en Firefox</h2>
          {extension.disponible ? (
            <span className={extension.vinculado || tokenExtension ? propio.activo : propio.inactivo}>
              {extension.vinculado || tokenExtension ? "Vinculado" : "Sin vincular"}
            </span>
          ) : null}
        </div>
        <p className={estilos.cardNote}>
          Muestra el Asistente como una pestaña inferior únicamente en WhatsApp Web y en páginas
          de Rapiboy. La conversación queda en memoria de Firefox y se borra al cerrarlo.
        </p>

        {!extension.disponible ? (
          <p className={propio.error}>
            Falta ejecutar web/supabase/migracion-52-asistente-extension.sql.
          </p>
        ) : (
          <div className={propio.vinculacion}>
            {extension.vinculado && extension.venceEn ? (
              <p className={propio.detalleToken}>La vinculación vence el {extension.venceEn}.</p>
            ) : null}

            {tokenExtension ? (
              <div className={propio.tokenBox}>
                <strong>Copialo ahora. Por seguridad no volverá a mostrarse.</strong>
                <code className={propio.token}>{tokenExtension}</code>
                <button type="button" className={propio.secundario} onClick={copiarToken}>
                  {copiado ? "Copiado" : "Copiar token"}
                </button>
              </div>
            ) : null}

            <div className={propio.accionesToken}>
              <button
                type="button"
                className={propio.principal}
                onClick={vincularExtension}
                disabled={trabajando}
              >
                {extension.vinculado ? "Rotar vinculación" : "Generar vinculación"}
              </button>
              {extension.vinculado || tokenExtension ? (
                <button
                  type="button"
                  className={propio.secundario}
                  onClick={desvincularExtension}
                  disabled={trabajando}
                >
                  Desvincular
                </button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section className={estilos.card}>
        <div className={estilos.cardHead}>
          <h2 className={estilos.cardTitle}>Mi perfil</h2>
        </div>
        <p className={estilos.cardNote}>
          El nombre es cómo aparecés en el tablero. El correo no se cambia desde acá: es la
          identidad con la que quedan firmados tus reportes y ediciones, así que es una operación
          administrativa.
        </p>

        <div className={propio.formulario}>
          <label className={propio.campo}>
            <span className={propio.etiqueta}>Mi nombre</span>
            <input
              className={propio.entrada}
              value={miNombre}
              onChange={(e) => setMiNombre(e.target.value)}
              placeholder="Cómo aparecés en el tablero"
              disabled={trabajando}
            />
          </label>

          <button
            type="button"
            className={propio.principal}
            onClick={() => correr(() => editarMiNombre(miNombre), "Nombre actualizado.")}
            disabled={trabajando}
          >
            Guardar nombre
          </button>
        </div>

        <p className={estilos.cardNote}>
          La contraseña pide la actual aunque ya tengas la sesión abierta: si alcanzara con estar
          adentro, una computadora dejada abierta un minuto sería suficiente para quedarse con la
          cuenta.
        </p>

        <div className={propio.formulario}>
          <label className={propio.campo}>
            <span className={propio.etiqueta}>Contraseña actual</span>
            <input
              className={propio.entrada}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              type="password"
              disabled={trabajando}
            />
          </label>

          <label className={propio.campo}>
            <span className={propio.etiqueta}>Contraseña nueva</span>
            <input
              className={propio.entrada}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              type="password"
              placeholder="Mínimo 10 caracteres"
              disabled={trabajando}
            />
          </label>

          <button
            type="button"
            className={propio.principal}
            onClick={() => {
              correr(() => cambiarMiPassword(actual, nueva), "Contraseña cambiada.");
              setActual("");
              setNueva("");
            }}
            disabled={trabajando}
          >
            Cambiar mi contraseña
          </button>
        </div>
      </section>
    </div>
  );
}
