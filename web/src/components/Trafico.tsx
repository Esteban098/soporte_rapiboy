"use client";

import { useEffect, useState } from "react";
import { teselasParaLienzo, urlTesela, type CapaTomTom } from "@/lib/trafico";
import { proyectarEn, type Ventana } from "@/lib/tracker";
import type { Lienzo } from "./LienzoMapa";
import estilos from "./live-tracker.module.css";

/**
 * Las capas de TomTom dentro del SVG del mapa: calles debajo de las zonas,
 * tráfico encima.
 *
 * Cada tesela se ubica por sus propias esquinas proyectadas, igual que el
 * radar. El mapa del tablero no es Mercator y las teselas sí, pero a zoom de
 * calle cada tesela es tan chica que el relleno parejo queda a menos de un
 * metro de donde corresponde; la prueba lo mide.
 */

/** Lo que el mapa necesita saber de las capas de TomTom. */
export type EstadoTomTom = {
  clave: string;
  calles: boolean;
  trafico: boolean;
  /** Sube cada vez que toca volver a pedir el tráfico. */
  ciclo: number;
};

/**
 * Un contador que avanza cada `ms` mientras la capa esté prendida.
 *
 * TomTom manda estas teselas con `no-store`, así que el navegador no las
 * guarda: volver a montar las imágenes alcanza para traer el tráfico nuevo, y
 * el contador va en la clave de React de cada una. Mientras el ciclo no
 * cambia, arrastrar el mapa reutiliza las imágenes que ya están y no pide
 * nada de nuevo.
 */
export function useCiclo(activo: boolean, ms: number): number {
  const [ciclo, setCiclo] = useState(0);

  useEffect(() => {
    if (!activo) return;
    const reloj = setInterval(() => setCiclo((c) => c + 1), ms);
    return () => clearInterval(reloj);
  }, [activo, ms]);

  return ciclo;
}

export function CapaTomTom({
  capa,
  clave,
  ventana,
  lienzo,
  ciclo = 0,
}: {
  capa: CapaTomTom;
  clave: string;
  ventana: Ventana;
  lienzo: Lienzo;
  ciclo?: number;
}) {
  const teselas = teselasParaLienzo(ventana, lienzo);

  return (
    <g
      className={capa === "calles" ? estilos.calles : estilos.trafico}
      aria-hidden="true"
      /* Sin esto el tráfico taparía los clics sobre las zonas de abajo. */
      pointerEvents="none"
    >
      {teselas.map((t) => {
        const arriba = proyectarEn({ lon: t.oeste, lat: t.norte }, ventana);
        const abajo = proyectarEn({ lon: t.este, lat: t.sur }, ventana);
        return (
          <image
            key={`${capa}/${ciclo}/${t.z}/${t.x}/${t.y}`}
            href={urlTesela(capa, clave, t)}
            x={arriba.x}
            y={arriba.y}
            /* Un pelín de solape para que el antialias no deje una línea de
               fondo entre dos teselas vecinas. */
            width={abajo.x - arriba.x + SOLAPE * lienzoEscala(lienzo)}
            height={abajo.y - arriba.y + SOLAPE * lienzoEscala(lienzo)}
            preserveAspectRatio="none"
          />
        );
      })}
    </g>
  );
}

/** Medio píxel de pantalla, en unidades del `viewBox`, a cualquier zoom. */
const SOLAPE = 0.5;

function lienzoEscala({ vista, caja }: Lienzo): number {
  return 1 / Math.min(caja.ancho / vista.w, caja.alto / vista.h);
}

/**
 * Las casillas de calles y tráfico.
 *
 * Viven acá y no copiadas en cada pantalla, igual que la atribución de abajo:
 * las usan el live tracker y tiendas, y así no pueden separarse.
 */
export function ControlesTomTom({
  calles,
  trafico,
  onCalles,
  onTrafico,
}: {
  calles: boolean;
  trafico: boolean;
  onCalles: (valor: boolean) => void;
  onTrafico: (valor: boolean) => void;
}) {
  return (
    <>
      <label className={estilos.filtro}>
        <input type="checkbox" checked={calles} onChange={(e) => onCalles(e.target.checked)} />
        Calles
      </label>

      <label className={estilos.filtro}>
        <input type="checkbox" checked={trafico} onChange={(e) => onTrafico(e.target.checked)} />
        Tráfico en vivo
      </label>
    </>
  );
}

/**
 * La atribución de TomTom, que es condición de uso mientras sus imágenes estén
 * en pantalla.
 *
 * Va separada de las casillas porque en la barra de arriba del mapa las
 * casillas van en fila y esto es un párrafo: en la misma fila se partiría en
 * una columna angosta. Vive en un solo lugar para que ninguna pantalla pueda
 * quedarse sin ella.
 */
export function AtribucionTomTom({ trafico }: { trafico: boolean }) {
  return (
    <p className={estilos.radarPie}>
      {trafico
        ? "Verde es tránsito normal para esa calle; rojo, mucho más lento que de costumbre. Se actualiza cada 2 minutos. "
        : null}
      Mapa y tráfico de{" "}
      <a href="https://www.tomtom.com/" target="_blank" rel="noreferrer noopener">
        © TomTom
      </a>
      .
    </p>
  );
}
