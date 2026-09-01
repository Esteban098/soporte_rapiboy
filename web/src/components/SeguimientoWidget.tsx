"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearSeguimiento, prepararAdjuntos, reportesDelCaso, type Previo } from "@/app/seguimiento";
import { ETIQUETA_ESTADO } from "@/lib/seguimiento";
import estilos from "./seguimiento-widget.module.css";

/**
 * Pestaña de carga de reportes, fija abajo a la derecha en todo el tablero.
 *
 * Está en todas las pantallas porque el momento de reportar algo casi nunca
 * coincide con estar parado en la pantalla de reportes: quien encuentra algo
 * raro lo encuentra mirando Demorados o el mes en curso. Si hubiera que navegar
 * a otra sección para escribirlo, se escribiría menos.
 *
 * Empieza colapsada y ocupa una franja mínima: es una herramienta secundaria y
 * no puede taparle filas a la tabla que alguien está leyendo.
 */
export function SeguimientoWidget() {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [paso, setPaso] = useState<"subiendo" | "guardando" | null>(null);
  const [previo, setPrevio] = useState<Previo | null>(null);
  const [enviando, iniciar] = useTransition();
  const formulario = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // El aviso de guardado se va solo: es una confirmación, no algo que haya que
  // leer y descartar.
  useEffect(() => {
    if (!listo) return;
    const temporizador = setTimeout(() => setListo(false), 5000);
    return () => clearTimeout(temporizador);
  }, [listo]);

  // Escape cierra, como cualquier panel que tape contenido.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  /**
   * Enviar tiene dos tramos: los archivos van directo del navegador a Supabase
   * con URLs firmadas, y recién después se guarda el reporte con las rutas.
   * Los archivos no pasan por el servidor —ver `prepararAdjuntos`—, así que el
   * paso extra es lo que permite adjuntar una foto de teléfono.
   */
  /**
   * Al salir del campo de id, mira si ese caso ya tiene reportes.
   *
   * Se consulta al salir del campo y no mientras se escribe: un id se teclea de
   * a un dígito y consultar en cada tecla sería una consulta por dígito, todas
   * sobre ids incompletos que no existen.
   */
  function revisarCaso(casoId: string) {
    const limpio = casoId.trim();
    if (!limpio) {
      setPrevio(null);
      return;
    }
    reportesDelCaso(limpio)
      .then((resultado) => setPrevio(resultado.total > 0 ? resultado : null))
      // Que falle la consulta no puede trabar la carga: es un aviso, no un
      // requisito.
      .catch(() => setPrevio(null));
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const campos = new FormData(evento.currentTarget);
    const casoId = String(campos.get("casoId") ?? "");
    const comentario = String(campos.get("comentario") ?? "");
    const archivos = campos
      .getAll("archivos")
      .filter((v): v is File => v instanceof File && v.size > 0);

    iniciar(async () => {
      setError(null);

      let rutas: string[] = [];
      if (archivos.length > 0) {
        setPaso("subiendo");
        const permiso = await prepararAdjuntos(
          casoId,
          archivos.map((archivo) => ({ nombre: archivo.name, tamano: archivo.size })),
        );

        if (!permiso.ok) {
          setPaso(null);
          setError(permiso.error);
          return;
        }

        const falla = await subir(archivos, permiso.subidas);
        if (falla) {
          setPaso(null);
          setError(falla);
          return;
        }
        rutas = permiso.subidas.map((subida) => subida.ruta);
      }

      setPaso("guardando");
      const resultado = await crearSeguimiento({ casoId, comentario, archivos: rutas });
      setPaso(null);

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }

      formulario.current?.reset();
      setPrevio(null);
      setListo(true);
      // Si quien reporta está parado en la pantalla de seguimiento, ve su
      // reporte aparecer sin recargar.
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        className={estilos.pestana}
        onClick={() => setAbierto(true)}
        data-noimprimir
      >
        <IconoChat />
        Añadir seguimiento
      </button>
    );
  }

  return (
    <section className={estilos.panel} aria-label="Añadir seguimiento" data-noimprimir>
      <header className={estilos.cabecera}>
        <h2 className={estilos.titulo}>Añadir seguimiento</h2>
        <button
          type="button"
          className={estilos.cerrar}
          onClick={() => setAbierto(false)}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </header>

      <form ref={formulario} className={estilos.formulario} onSubmit={enviar}>
        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Id del caso</span>
          <input
            name="casoId"
            className={estilos.entrada}
            placeholder="29642607"
            inputMode="numeric"
            required
            disabled={enviando}
            onBlur={(e) => revisarCaso(e.target.value)}
          />
        </label>

        {previo ? (
          <div className={estilos.previo} role="status">
            <strong className={estilos.previoTitulo}>
              {previo.total === 1
                ? "Este caso ya tiene un reporte"
                : `Este caso ya tiene ${previo.total} reportes`}
            </strong>
            {previo.ultimo ? (
              <p className={estilos.previoTexto}>
                Último ({ETIQUETA_ESTADO[previo.ultimo.estado].toLowerCase()}
                {previo.ultimo.cuando ? `, ${cuando(previo.ultimo.cuando)}` : ""}):{" "}
                {recortar(previo.ultimo.texto)}
              </p>
            ) : null}
            <p className={estilos.previoTexto}>
              Podés cargarlo igual si tenés algo nuevo que agregar.
            </p>
          </div>
        ) : null}

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Comentario</span>
          <textarea
            name="comentario"
            className={`${estilos.entrada} ${estilos.area}`}
            rows={4}
            placeholder="Qué pasó y qué hace falta hacer."
            required
            disabled={enviando}
          />
        </label>

        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Fotos o archivos</span>
          <input
            type="file"
            name="archivos"
            className={estilos.archivos}
            multiple
            accept="image/*,application/pdf"
            disabled={enviando}
          />
          <span className={estilos.ayuda}>Hasta 5 archivos, 10 MB cada uno.</span>
        </label>

        {error ? <p className={estilos.error}>{error}</p> : null}
        {listo ? (
          <p className={estilos.exito} role="status">
            Reporte guardado. Queda como abierto hasta que alguien lo tome.
          </p>
        ) : null}

        <button type="submit" className={estilos.enviar} disabled={enviando}>
          {enviando ? <Girando /> : null}
          {paso === "subiendo" ? "Subiendo archivos…" : paso === "guardando" ? "Guardando…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}

/**
 * Manda cada archivo a su URL firmada. Devuelve el motivo del primer fallo.
 *
 * Si uno falla se corta y el reporte no se guarda: decir "guardado" cuando la
 * foto que lo respalda no llegó es peor que pedir que se intente de nuevo.
 */
async function subir(archivos: File[], subidas: { ruta: string; url: string }[]) {
  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    const destino = subidas[i];
    if (!destino) return "Faltó preparar la subida de un archivo.";

    const respuesta = await fetch(destino.url, {
      method: "PUT",
      headers: { "content-type": archivo.type || "application/octet-stream" },
      body: archivo,
    }).catch(() => null);

    if (!respuesta?.ok) {
      return `No se pudo subir "${archivo.name}". Probá de nuevo o mandá el reporte sin adjuntos.`;
    }
  }
  return null;
}

/** Fecha corta en horario de México, para el aviso de reportes previos. */
function cuando(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

/** El aviso es una referencia, no el reporte: alcanza con el principio. */
function recortar(texto: string): string {
  return texto.length > 140 ? `${texto.slice(0, 140).trimEnd()}…` : texto;
}

function IconoChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13.5 9.5a1.5 1.5 0 0 1-1.5 1.5H6l-3 2.5V4A1.5 1.5 0 0 1 4.5 2.5H12A1.5 1.5 0 0 1 13.5 4Z" strokeLinejoin="round" />
    </svg>
  );
}

/** El giro dice que algo está pasando: la subida y el resumen tardan. */
function Girando() {
  return (
    <svg className={estilos.girando} width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
