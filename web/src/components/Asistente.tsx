"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MensajeChat } from "@/lib/asistente";
import estilos from "./asistente.module.css";

/**
 * Pestaña del asistente, fija abajo a la derecha en todo el tablero, al lado
 * de la de seguimiento.
 *
 * Está en todas las pantallas por lo mismo que Seguimiento: la duda sobre un
 * paquete aparece mirando cualquier cola, no parado en una pantalla de chat.
 * Como vive en el layout, la conversación sobrevive a la navegación.
 *
 * Solo lee: el servidor le ofrece al modelo herramientas de consulta y
 * ninguna que escriba.
 */

const SUGERENCIAS = [
  "¿En qué estado está el paquete 30448011?",
  "¿Cuántos casos abiertos hay este mes y en qué estados?",
  "Reportes de seguimiento abiertos sin tomar",
  "¿Qué repartidores van más atrasados hoy?",
];

type Entrada = MensajeChat & { error?: boolean };

export function Asistente() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Entrada[]>([]);
  const [borrador, setBorrador] = useState("");
  const [pensando, setPensando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Escape cierra, como cualquier panel que tape contenido.
  useEffect(() => {
    if (!abierto) return;
    campo.current?.focus();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // La respuesta nueva queda a la vista.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, pensando]);

  async function preguntar(pregunta: string) {
    const texto = pregunta.trim();
    if (!texto || pensando) return;

    // Los errores se muestran pero no viajan: no son parte de la conversación.
    const historial = [...mensajes.filter((m) => !m.error), { rol: "usuario" as const, texto }];
    setMensajes((previos) => [...previos, { rol: "usuario", texto }]);
    setBorrador("");
    setPensando(true);

    try {
      const respuesta = await fetch("/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensajes: historial.map(({ rol, texto }) => ({ rol, texto })) }),
      });
      const datos = (await respuesta.json().catch(() => null)) as
        | { ok: true; texto: string }
        | { ok: false; error: string }
        | null;

      setMensajes((previos) => [
        ...previos,
        datos?.ok
          ? { rol: "asistente", texto: datos.texto }
          : { rol: "asistente", texto: datos?.error ?? "No se pudo obtener respuesta.", error: true },
      ]);
    } catch {
      setMensajes((previos) => [
        ...previos,
        { rol: "asistente", texto: "No hay conexión con el servidor. Probá de nuevo.", error: true },
      ]);
    } finally {
      setPensando(false);
    }
  }

  function alTeclear(evento: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Shift+Enter hace un salto de línea, como en cualquier chat.
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      void preguntar(borrador);
    }
  }

  if (!abierto) {
    return (
      <button type="button" className={estilos.pestana} onClick={() => setAbierto(true)} data-noimprimir>
        <IconoChispa />
        Asistente
        <span className={estilos.beta}>Beta</span>
      </button>
    );
  }

  return (
    <section className={estilos.panel} aria-label="Asistente" data-noimprimir>
      <header className={estilos.cabecera}>
        <h2 className={estilos.titulo}>
          Asistente <span className={estilos.beta}>Beta</span>
        </h2>
        <div className={estilos.acciones}>
          {mensajes.length > 0 ? (
            <button
              type="button"
              className={estilos.nueva}
              onClick={() => setMensajes([])}
              disabled={pensando}
            >
              Nueva conversación
            </button>
          ) : null}
          <button type="button" className={estilos.cerrar} onClick={() => setAbierto(false)} aria-label="Cerrar">
            ✕
          </button>
        </div>
      </header>

      <div ref={lista} className={estilos.mensajes} aria-live="polite">
        {mensajes.length === 0 ? (
          <div className={estilos.vacio}>
            <p className={estilos.vacioTexto}>
              Preguntá por paquetes, casos, métricas, reportes de seguimiento o repartidores en ruta. Solo
              consulta: no modifica nada.
            </p>
            <ul className={estilos.sugerencias}>
              {SUGERENCIAS.map((sugerencia) => (
                <li key={sugerencia}>
                  <button type="button" className={estilos.sugerencia} onClick={() => void preguntar(sugerencia)}>
                    {sugerencia}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          mensajes.map((mensaje, i) => (
            <div
              key={i}
              className={`${estilos.burbuja} ${
                mensaje.rol === "usuario" ? estilos.usuario : mensaje.error ? estilos.fallo : estilos.respuesta
              }`}
            >
              {mensaje.rol === "usuario" ? mensaje.texto : <Texto texto={mensaje.texto} />}
            </div>
          ))
        )}
        {pensando ? (
          <div className={`${estilos.burbuja} ${estilos.respuesta} ${estilos.pensando}`} role="status">
            <Girando /> Consultando el tablero…
          </div>
        ) : null}
      </div>

      <form
        className={estilos.formulario}
        onSubmit={(evento) => {
          evento.preventDefault();
          void preguntar(borrador);
        }}
      >
        <textarea
          ref={campo}
          className={estilos.entrada}
          rows={2}
          placeholder="Escribí tu pregunta…"
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          onKeyDown={alTeclear}
          maxLength={2000}
          aria-label="Pregunta"
        />
        <button type="submit" className={estilos.enviar} disabled={pensando || !borrador.trim()}>
          Enviar
        </button>
      </form>
      <p className={estilos.pie}>
        En prueba (beta): las respuestas las arma un modelo de IA con datos del tablero. Verificá lo importante antes de
        actuar.
      </p>
    </section>
  );
}

/**
 * Lo poco de formato que se le pide al modelo: párrafos, listas con «- »,
 * **negrita** y enlaces. Se arma con elementos y no con HTML, así
 * que nada de lo que devuelva el modelo puede inyectar marcado.
 */
function Texto({ texto }: { texto: string }) {
  const bloques: { lista: boolean; lineas: string[] }[] = [];
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (!limpia) {
      bloques.push({ lista: false, lineas: [] });
      continue;
    }
    const esItem = /^[-*•]\s+/.test(limpia);
    const contenido = limpia.replace(/^[-*•]\s+/, "");
    const ultimo = bloques.at(-1);
    if (ultimo && ultimo.lista === esItem && ultimo.lineas.length > 0) ultimo.lineas.push(contenido);
    else bloques.push({ lista: esItem, lineas: [contenido] });
  }

  return (
    <>
      {bloques
        .filter((bloque) => bloque.lineas.length > 0)
        .map((bloque, i) =>
          bloque.lista ? (
            <ul key={i} className={estilos.lista}>
              {bloque.lineas.map((linea, j) => (
                <li key={j}>
                  <EnLinea texto={linea} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className={estilos.parrafo}>
              {bloque.lineas.map((linea, j) => (
                <Fragment key={j}>
                  {j > 0 ? <br /> : null}
                  <EnLinea texto={linea} />
                </Fragment>
              ))}
            </p>
          ),
        )}
    </>
  );
}

/**
 * Negrita, enlaces `[texto](url)` y, por si el modelo lo pega suelto, el
 * enlace a un reporte.
 *
 * Solo se vuelven enlace las rutas del tablero y las URLs https de Rapiboy
 * (el operador y las fotos de `files.rapiboy.com`). El texto que lee el modelo
 * incluye comentarios que escribe cualquiera —reportes, repartidores,
 * tiendas—, y uno armado a propósito podría hacerle devolver un enlace a otro
 * sitio con datos en la URL. Con esta lista, ese enlace queda como texto.
 */
function enlaceExternoPermitido(url: string): boolean {
  try {
    const destino = new URL(url);
    return (
      destino.protocol === "https:" &&
      (destino.hostname === "rapiboy.com" || destino.hostname.endsWith(".rapiboy.com"))
    );
  } catch {
    return false;
  }
}
const MARCAS = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|`?\/seguimiento\?reporte=[\w-]+`?)/g;

function EnLinea({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(MARCAS).map((parte, i) => {
        if (parte.startsWith("**") && parte.endsWith("**")) return <strong key={i}>{parte.slice(2, -2)}</strong>;

        const markdown = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(parte);
        const [etiqueta, destino] = markdown
          ? [markdown[1], markdown[2]]
          : parte.includes("/seguimiento?reporte=")
            ? ["Ver reporte", parte.replace(/`/g, "")]
            : [null, null];

        if (destino && /^\/(?!\/)/.test(destino)) {
          return (
            <Link key={i} href={destino} className={estilos.enlace}>
              {etiqueta}
            </Link>
          );
        }
        if (destino && enlaceExternoPermitido(destino)) {
          return (
            <a key={i} href={destino} target="_blank" rel="noopener noreferrer" className={estilos.enlace}>
              {etiqueta}
            </a>
          );
        }
        return <Fragment key={i}>{markdown ? etiqueta : parte.replace(/`/g, "")}</Fragment>;
      })}
    </>
  );
}

function IconoChispa() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        d="M8 1.5 9.4 6.1 14 7.5 9.4 8.9 8 13.5 6.6 8.9 2 7.5 6.6 6.1Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Girando() {
  return (
    <svg className={estilos.girando} width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
