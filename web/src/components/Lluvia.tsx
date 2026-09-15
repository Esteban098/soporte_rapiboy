"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INDICE_RAINVIEWER,
  cuadroActual,
  horaDeCuadro,
  leerIndice,
  mosaico,
  urlTesela,
  zoomDeMosaico,
  type IndiceRadar,
} from "@/lib/lluvia";
import { proyectarEn, type Ventana } from "@/lib/tracker";
import estilos from "./live-tracker.module.css";

/**
 * La capa de lluvia del live tracker, con radar de RainViewer.
 *
 * Responde a una pregunta que la operación se hace todos los días de agua:
 * «¿esta ruta va lenta por el driver o porque está diluviando en esa zona?».
 * Antes había que abrir otra pestaña y comparar a ojo dos mapas distintos;
 * acá la lluvia queda debajo de los mismos puntos.
 *
 * Va apagada y no pide nada hasta que alguien la prende. El resto del tablero
 * no habla con ningún servidor de mapas —los polígonos son un archivo del
 * repo— y esa propiedad se conserva: con la capa apagada, o con RainViewer
 * caído, la pantalla es exactamente la de siempre.
 *
 * Tres piezas: `useLluvia` maneja el estado y la descarga, `ControlLluvia` es
 * lo que se toca y `CapaLluvia` son las imágenes dentro del SVG.
 */

/** Cada cuánto se relee el índice: RainViewer publica un cuadro cada 10 min. */
const REFRESCO_MS = 5 * 60 * 1000;

/** Ritmo de la animación, y la pausa más larga al llegar al último cuadro. */
const CUADRO_MS = 500;
const PAUSA_FINAL_MS = 1400;

export type EstadoLluvia = ReturnType<typeof useLluvia>;

export function useLluvia(ventana: Ventana) {
  const [activa, setActiva] = useState(false);
  const [indice, setIndice] = useState<IndiceRadar | null>(null);
  const [cuadro, setCuadro] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teselas = useMemo(() => mosaico(ventana, zoomDeMosaico(ventana)), [ventana]);

  /*
   * El índice se relee cada cinco minutos mientras la capa está prendida, y
   * el pedido se corta al apagarla: si alguien la prende y la apaga mientras
   * la red tarda, la respuesta que llegue después no tiene que revivirla.
   */
  useEffect(() => {
    if (!activa) return;

    const corte = new AbortController();
    let vivo = true;

    async function traer() {
      setCargando(true);
      try {
        const respuesta = await fetch(INDICE_RAINVIEWER, {
          signal: corte.signal,
          cache: "no-store",
        });
        if (!respuesta.ok) throw new Error(String(respuesta.status));
        const leido = leerIndice(await respuesta.json());
        if (!vivo) return;
        if (!leido) {
          setError("RainViewer respondió algo que no se entiende.");
          setIndice(null);
          return;
        }
        setError(null);
        setIndice(leido);
        // Al releer se vuelve al presente en vez de conservar la posición: el
        // cuadro número tres de hace cinco minutos ya no es el mismo momento.
        setCuadro(cuadroActual(leido));
      } catch (falla) {
        if (!vivo || (falla instanceof Error && falla.name === "AbortError")) return;
        setError("No se pudo traer el radar. La lluvia no se dibuja; el mapa sigue igual.");
        setIndice(null);
      } finally {
        if (vivo) setCargando(false);
      }
    }

    void traer();
    const reloj = setInterval(() => void traer(), REFRESCO_MS);

    return () => {
      vivo = false;
      corte.abort();
      clearInterval(reloj);
    };
  }, [activa]);

  /*
   * Las imágenes se bajan de una a la caché del navegador antes de animar. Sin
   * esto el primer ciclo parpadea: cambiar el `href` de una tesela que todavía
   * no llegó deja el hueco en blanco y la animación se ve rota justo la
   * primera vez, que es cuando se la mira.
   *
   * Lo que se guarda es *qué* índice quedó precargado, no un booleano: así
   * releer el índice vuelve a «cargando» sin tener que apagar la bandera desde
   * el efecto, que es una renderización de más y un parpadeo en el control.
   */
  const [precargadoDe, setPrecargadoDe] = useState<IndiceRadar | null>(null);
  const precargado = indice !== null && precargadoDe === indice;

  useEffect(() => {
    if (!indice) return;
    let vivo = true;

    (async () => {
      for (const c of indice.cuadros) {
        if (!vivo) return;
        await Promise.allSettled(
          teselas.map(
            (t) =>
              new Promise((listo, falla) => {
                const img = new Image();
                img.onload = listo;
                img.onerror = falla;
                img.src = urlTesela(indice, c, t);
              }),
          ),
        );
      }
      if (vivo) setPrecargadoDe(indice);
    })();

    return () => {
      vivo = false;
    };
  }, [indice, teselas]);

  useEffect(() => {
    if (!indice || !reproduciendo || !precargado) return;
    const ultimo = cuadro === indice.cuadros.length - 1;
    const salto = setTimeout(
      () => setCuadro((c) => (c + 1) % indice.cuadros.length),
      ultimo ? PAUSA_FINAL_MS : CUADRO_MS,
    );
    return () => clearTimeout(salto);
  }, [indice, reproduciendo, precargado, cuadro]);

  const prender = useCallback((valor: boolean) => {
    setActiva(valor);
    setReproduciendo(true);
    // Apagarla la deja limpia: si se vuelve a prender diez minutos después, el
    // radar viejo no tiene que aparecer un instante antes del nuevo.
    if (!valor) {
      setIndice(null);
      setPrecargadoDe(null);
      setError(null);
    }
  }, []);

  const elegirCuadro = useCallback((valor: number) => {
    // Mover la barra a mano es pedir mirar ese momento, no competir con la
    // animación por quién manda el cuadro.
    setReproduciendo(false);
    setCuadro(valor);
  }, []);

  return {
    activa,
    prender,
    indice,
    teselas,
    cuadro: indice ? Math.min(cuadro, indice.cuadros.length - 1) : 0,
    elegirCuadro,
    reproduciendo,
    alternarReproduccion: () => setReproduciendo((r) => !r),
    cargando,
    precargado,
    error,
  };
}

/** El control del radar, debajo de los filtros del panel. */
export function ControlLluvia({ estado }: { estado: EstadoLluvia }) {
  const { indice, cuadro, error, cargando, precargado } = estado;

  if (error) {
    return (
      <p className={estilos.radarAviso} role="status">
        {error}
      </p>
    );
  }

  if (!indice) {
    return (
      <p className={estilos.radarAviso} role="status">
        {cargando ? "Trayendo el radar…" : "Sin datos de radar."}
      </p>
    );
  }

  const actual = indice.cuadros[cuadro];

  return (
    <div className={estilos.radar}>
      <div className={estilos.radarBarra}>
        <button
          type="button"
          onClick={estado.alternarReproduccion}
          aria-label={estado.reproduciendo ? "Pausar la animación" : "Animar el radar"}
          disabled={!precargado}
        >
          {estado.reproduciendo ? "❚❚" : "▶"}
        </button>

        <input
          type="range"
          min={0}
          max={indice.cuadros.length - 1}
          step={1}
          value={cuadro}
          onChange={(e) => estado.elegirCuadro(Number(e.target.value))}
          aria-label="Momento del radar"
        />

        <span className={estilos.radarHora}>
          {horaDeCuadro(actual.time)}
          {actual.pronostico ? " ·  pronóstico" : ""}
        </span>
      </div>

      <p className={estilos.radarPie}>
        {precargado ? null : "Bajando los cuadros… "}
        Radar de{" "}
        <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer noopener">
          RainViewer
        </a>
        . Es lo único de esta pantalla que sale a internet.
      </p>
    </div>
  );
}

/**
 * Las teselas del radar, dentro del SVG del mapa.
 *
 * Cada una se ubica por sus propias esquinas proyectadas, así que no hace
 * falta que la proyección del tablero y la de las teselas coincidan: alcanza
 * con que cada recuadro caiga donde le toca.
 */
export function CapaLluvia({ estado, ventana }: { estado: EstadoLluvia; ventana: Ventana }) {
  const { indice, teselas, cuadro } = estado;
  if (!indice) return null;
  const actual = indice.cuadros[cuadro];
  if (!actual) return null;

  return (
    <g className={estilos.lluvia} aria-hidden="true" pointerEvents="none">
      {teselas.map((t) => {
        const arriba = proyectarEn({ lon: t.oeste, lat: t.norte }, ventana);
        const abajo = proyectarEn({ lon: t.este, lat: t.sur }, ventana);
        return (
          <image
            key={`${t.z}/${t.x}/${t.y}`}
            href={urlTesela(indice, actual, t)}
            x={arriba.x}
            y={arriba.y}
            /* El solape tapa la línea de fondo que el antialias deja entre dos
               recuadros vecinos. Es medio punto sobre mil: no corre nada. */
            width={abajo.x - arriba.x + SOLAPE}
            height={abajo.y - arriba.y + SOLAPE}
            preserveAspectRatio="none"
          />
        );
      })}
    </g>
  );
}

const SOLAPE = 0.5;
