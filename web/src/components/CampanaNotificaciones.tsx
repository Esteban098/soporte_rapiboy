"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bandejaNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  type Bandeja,
} from "@/app/notificaciones";
import { colorDePersona, inicialesDePersona, nombreDePersona } from "@/lib/seguimiento";
import { fechaHoraArgentina } from "@/lib/formato";
import estilos from "./notificaciones.module.css";

/**
 * Campana de la barra superior, al lado del selector de tema.
 *
 * Vuelve a preguntar cada minuto mientras la pestaña está a la vista y al
 * volver a ella. No hay canal en vivo: una mención no es una alarma, y un
 * minuto de demora no cambia nada frente a mantener una conexión abierta por
 * cada pestaña del tablero.
 */
const CADA_MS = 60_000;

export function CampanaNotificaciones() {
  const [bandeja, setBandeja] = useState<Bandeja | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [ahora, setAhora] = useState(0);
  const [, iniciar] = useTransition();
  const contenedor = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const refrescar = useCallback(() => {
    bandejaNotificaciones()
      .then(setBandeja)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const primero = setTimeout(refrescar, 0);
    const intervalo = setInterval(() => {
      if (visible()) refrescar();
    }, CADA_MS);
    const alVolver = () => {
      if (visible()) refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearTimeout(primero);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [refrescar]);

  // Clic afuera o Escape cierran el panel.
  useEffect(() => {
    if (!abierta) return;
    const alTocar = (evento: PointerEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierta(false);
    };
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierta(false);
    };
    document.addEventListener("pointerdown", alTocar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("pointerdown", alTocar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierta]);

  // Sin sesión, sin base o sin la tabla creada, no hay nada que mostrar.
  if (bandeja && !bandeja.disponible) return null;

  const noLeidas = bandeja?.noLeidas ?? 0;
  const items = bandeja?.items ?? [];

  function alternar() {
    if (!abierta) {
      setAhora(Date.now());
      refrescar();
    }
    setAbierta(!abierta);
  }

  function abrir(id: string, leida: boolean, seguimientoId: string | null) {
    setAbierta(false);
    if (!leida) {
      setBandeja((previa) =>
        previa
          ? {
              ...previa,
              noLeidas: Math.max(0, previa.noLeidas - 1),
              items: previa.items.map((item) => (item.id === id ? { ...item, leida: true } : item)),
            }
          : previa,
      );
      iniciar(async () => {
        await marcarNotificacionLeida(id);
      });
    }
    if (seguimientoId) router.push(`/seguimiento?reporte=${encodeURIComponent(seguimientoId)}`);
  }

  function leerTodas() {
    setBandeja((previa) =>
      previa
        ? { ...previa, noLeidas: 0, items: previa.items.map((item) => ({ ...item, leida: true })) }
        : previa,
    );
    iniciar(async () => {
      await marcarTodasLeidas();
      refrescar();
    });
  }

  return (
    <div className={estilos.contenedor} ref={contenedor} data-noimprimir>
      <button
        type="button"
        className={`${estilos.boton} ${abierta ? estilos.botonActivo : ""}`}
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={abierta}
        aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"}
        title="Notificaciones"
      >
        <IconoCampana />
        {noLeidas > 0 ? (
          <span className={estilos.insignia} aria-hidden="true">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        ) : null}
      </button>

      {abierta ? (
        <section className={estilos.panel} role="dialog" aria-label="Notificaciones">
          <header className={estilos.cabecera}>
            <h2 className={estilos.titulo}>Notificaciones</h2>
            {noLeidas > 0 ? (
              <button type="button" className={estilos.leerTodas} onClick={leerTodas}>
                Marcar todo como leído
              </button>
            ) : null}
          </header>

          {bandeja === null ? (
            <p className={estilos.vacio}>Cargando…</p>
          ) : items.length === 0 ? (
            <p className={estilos.vacio}>Cuando alguien te arrobe en un reporte, aparece acá.</p>
          ) : (
            <ul className={estilos.lista}>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${estilos.item} ${item.leida ? "" : estilos.noLeida}`}
                    onClick={() => abrir(item.id, item.leida, item.seguimientoId)}
                  >
                    <span
                      className={estilos.avatar}
                      style={{ background: colorDePersona(item.autor) }}
                      aria-hidden="true"
                    >
                      {inicialesDePersona(item.autor)}
                    </span>
                    <span className={estilos.cuerpo}>
                      <span className={estilos.frase}>
                        <strong>{nombreDePersona(item.autor)}</strong> te mencionó
                        {item.casoId ? (
                          <>
                            {" "}
                            en el caso <span className={estilos.caso}>#{item.casoId}</span>
                          </>
                        ) : null}
                      </span>
                      {item.extracto ? (
                        <span className={estilos.extracto}>{item.extracto}</span>
                      ) : null}
                      <span className={estilos.cuando}>{hace(item.creada, ahora)}</span>
                    </span>
                    {item.leida ? null : (
                      <span className={estilos.punto}>
                        <span className={estilos.oculto}>Sin leer</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** «recién», «hace 12 min», «hace 3 h» y, pasado un día, la fecha. */
function hace(iso: string | null, ahora: number): string {
  if (!iso || !ahora) return "";
  const fecha = new Date(iso);
  const minutos = Math.floor((ahora - fecha.getTime()) / 60_000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 24 * 60) return `hace ${Math.floor(minutos / 60)} h`;
  return fechaHoraArgentina(fecha);
}

function IconoCampana() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1.25 1.25H2.75Z" strokeLinejoin="round" />
      <path d="M6.5 13.75a1.6 1.6 0 0 0 3 0" strokeLinecap="round" />
    </svg>
  );
}
