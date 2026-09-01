"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cambiarActivo,
  cambiarMiPassword,
  crearPerfil,
  editarMiNombre,
  resetearPassword,
} from "@/app/perfiles";
import { EditorPerfil } from "./EditorPerfil";
import estilos from "./ui.module.css";
import tabla from "./tabla.module.css";
import propio from "./perfiles.module.css";

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
}: {
  perfiles: FilaPerfil[];
  /** Correo de quien está mirando, para no dejarlo desactivarse solo. */
  yo: string;
  puedeAdministrar: boolean;
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
      () => crearPerfil({ email, nombre, password, rol: rol === "admin" ? "admin" : "operador" }),
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
          <table className={estilos.table}>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Último ingreso</th>
                <th>Creado</th>
                <th>Estado</th>
                {puedeAdministrar ? <th data-noimprimir aria-label="Acciones" /> : null}
              </tr>
            </thead>
            <tbody>
              {perfiles.map((perfil) => (
                <tr key={perfil.id}>
                  <td>{perfil.email}</td>
                  <td>{perfil.nombre || "—"}</td>
                  <td>
                    <span className={perfil.rol === "admin" ? propio.rolAdmin : propio.rolOperador}>
                      {perfil.rol === "admin" ? "Administrador" : "Operador"}
                    </span>
                  </td>
                  <td className={propio.fecha}>{perfil.ultimoIngreso || "nunca"}</td>
                  <td className={propio.fecha}>{perfil.creado}</td>
                  <td>
                    <span className={perfil.activo ? propio.activo : propio.inactivo}>
                      {perfil.activo ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  {puedeAdministrar ? (
                    <td data-noimprimir className={tabla.celdaAccion}>
                      <button
                        type="button"
                        className={tabla.editar}
                        onClick={() => setEditando(perfil)}
                        disabled={trabajando}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={tabla.editar}
                        onClick={() => resetear(perfil)}
                        disabled={trabajando}
                      >
                        Resetear clave
                      </button>
                      <button
                        type="button"
                        className={tabla.editar}
                        onClick={() =>
                          correr(
                            () => cambiarActivo(perfil.id, !perfil.activo),
                            perfil.activo
                              ? `${perfil.email} ya no puede entrar.`
                              : `${perfil.email} puede entrar de nuevo.`,
                          )
                        }
                        disabled={trabajando || (perfil.email === yo && perfil.activo)}
                        title={
                          perfil.email === yo && perfil.activo
                            ? "No podés desactivar tu propio perfil"
                            : undefined
                        }
                      >
                        {perfil.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

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
