"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Ventana } from "@/lib/tracker";
import estilos from "./live-tracker.module.css";

/**
 * El lienzo compartido de los mapas del tablero: encuadre movible sobre los
 * polígonos de cobertura.
 *
 * No hay librería de mapas ni tiles. El fondo son los polígonos del KMZ, que
 * ya están en el repo y llegan renderizados desde el servidor, así que ninguna
 * de estas pantallas le pide nada a un servidor de mapas y todas funcionan con
 * la red caída. Para una operación acotada a una ciudad, el contorno de las
 * zonas de reparto ubica mejor que un mapa de calles: es exactamente el marco
 * contra el que la operación piensa.
 *
 * Mover y acercar cambian solamente el `viewBox`, así que los ~3.500 puntos
 * del contorno se dibujan una vez y el resto es trabajo del navegador.
 *
 * Lo usan el live tracker y el mapa de tiendas. Vive acá y no duplicado en los
 * dos porque el encuadre tiene tres sutilezas -la escala real en píxeles, el
 * foco de la rueda y el re-encuadre durante el render- que se arreglaron una
 * vez y no conviene volver a arreglar en dos lugares.
 */

export type Vista = { x: number; y: number; w: number; h: number };

export function LienzoMapa({
  ventana,
  clave,
  encuadrar,
  etiqueta,
  fondo,
  onPoligono,
  children,
}: {
  ventana: Ventana;

  /**
   * Cuando cambia, se rehace el encuadre.
   *
   * Es la diferencia entre «elegí otra cosa, mostrámela» y «apreté
   * Actualizar»: en el segundo caso quien mira ya acomodó el mapa donde
   * quería, y moverlo sería deshacerle el trabajo. Por eso la clave la arma
   * quien llama, con lo que identifica la selección y no con los datos.
   */
  clave: string;

  /** El encuadre para la selección actual. `null` es «mostrar todo». */
  encuadrar: () => Vista | null;

  etiqueta: string;

  /** Los polígonos de cobertura, dibujados en el servidor. */
  fondo: React.ReactNode;

  /** Informa el nombre original del KMZ cuando se toca un polígono. */
  onPoligono?: (poligono: { nombre: string; zona: string }) => void;

  /** Lo que va encima, con `k` = cuánto mide un píxel en unidades del viewBox. */
  children: (k: number) => React.ReactNode;
}) {
  const completa = useMemo<Vista>(
    () => ({ x: 0, y: 0, w: ventana.ancho, h: ventana.alto }),
    [ventana],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const arrastre = useRef<{
    x: number;
    y: number;
    vista: Vista;
    movio: boolean;
    poligono: { nombre: string; zona: string } | null;
  } | null>(null);

  const [vista, setVista] = useState<Vista>(completa);

  /*
   * El re-encuadre va como ajuste durante el render y no como efecto. Un
   * efecto pintaría primero el encuadre viejo y lo corregiría después, con el
   * salto a la vista; así React descarta el render a medio hacer y sale
   * directo con el bueno. Es el patrón que la documentación de React llama
   * «ajustar estado cuando cambian las props».
   */
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    setVista(encuadrar() ?? completa);
  }

  /*
   * Cuánto mide un píxel de pantalla en unidades del `viewBox`.
   *
   * Los marcadores tienen que medir siempre lo mismo en pantalla: si crecieran
   * con el zoom, acercarse para separar dos puntos vecinos los taparía con dos
   * círculos gigantes, y alejarse para ver la ciudad entera los volvería
   * invisibles. Dibujándolos con `r * k`, un radio escrito en píxeles sale en
   * píxeles a cualquier zoom.
   *
   * La escala no es `vista.w / ventana.ancho`. Con `preserveAspectRatio` en
   * `meet` -el valor por defecto- el navegador usa la menor de las dos escalas
   * para que entre todo, así que la buena depende también del alto y del
   * tamaño real de la caja. De ahí que haga falta medirla.
   */
  const [caja, setCaja] = useState({ ancho: 900, alto: 560 });

  useEffect(() => {
    const elemento = svgRef.current;
    if (!elemento) return;

    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      if (width > 0 && height > 0) setCaja({ ancho: width, alto: height });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const k = 1 / Math.min(caja.ancho / vista.w, caja.alto / vista.h);

  const acercar = useCallback(
    (factor: number, foco?: { x: number; y: number }) => {
      setVista((v) => {
        const w = Math.min(Math.max(v.w * factor, ventana.ancho * 0.004), ventana.ancho);
        const h = w * (v.h / v.w);
        const cx = foco?.x ?? v.x + v.w / 2;
        const cy = foco?.y ?? v.y + v.h / 2;
        // El punto bajo el cursor se queda quieto: es lo que hace que acercar
        // con la rueda se sienta como acercar y no como saltar a otro lado.
        return {
          x: cx - ((cx - v.x) * w) / v.w,
          y: cy - ((cy - v.y) * h) / v.h,
          w,
          h,
        };
      });
    },
    [ventana],
  );

  function aCoordenadas(evento: { clientX: number; clientY: number }): { x: number; y: number } {
    const medida = svgRef.current?.getBoundingClientRect();
    if (!medida) return { x: vista.x + vista.w / 2, y: vista.y + vista.h / 2 };
    return {
      x: vista.x + ((evento.clientX - medida.left) / medida.width) * vista.w,
      y: vista.y + ((evento.clientY - medida.top) / medida.height) * vista.h,
    };
  }

  function poligonoDe(elemento: EventTarget | null): { nombre: string; zona: string } | null {
    if (!(elemento instanceof Element)) return null;
    const path = elemento.closest("[data-poligono-nombre]");
    const nombre = path?.getAttribute("data-poligono-nombre")?.trim();
    if (!nombre) return null;
    return { nombre, zona: path?.getAttribute("data-poligono-zona")?.trim() ?? "" };
  }

  return (
    <div className={estilos.mapaCaja}>
      <svg
        ref={svgRef}
        className={estilos.mapa}
        viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
        role="img"
        aria-label={etiqueta}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          const poligono = poligonoDe(e.target);
          if (!poligono) return;
          e.preventDefault();
          onPoligono?.(poligono);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastre.current = {
            x: e.clientX,
            y: e.clientY,
            vista,
            movio: false,
            // Con pointer capture, al soltar `event.target` pasa a ser el SVG.
            // El nombre se conserva acá, antes de que se pierda ese target.
            poligono: poligonoDe(e.target),
          };
        }}
        onPointerMove={(e) => {
          const inicio = arrastre.current;
          if (!inicio) return;
          if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 3) inicio.movio = true;
          const medida = svgRef.current?.getBoundingClientRect();
          if (!medida) return;
          setVista({
            ...inicio.vista,
            x: inicio.vista.x - ((e.clientX - inicio.x) / medida.width) * inicio.vista.w,
            y: inicio.vista.y - ((e.clientY - inicio.y) / medida.height) * inicio.vista.h,
          });
        }}
        onPointerUp={() => {
          const gesto = arrastre.current;
          arrastre.current = null;
          if (gesto && !gesto.movio && gesto.poligono) onPoligono?.(gesto.poligono);
        }}
        onPointerCancel={() => {
          arrastre.current = null;
        }}
        onWheel={(e) => acercar(e.deltaY > 0 ? 1.15 : 1 / 1.15, aCoordenadas(e))}
      >
        {/* El fondo, dibujado en el servidor. No se vuelve a pintar nunca. */}
        <g className={estilos.fondo}>{fondo}</g>

        {children(k)}
      </svg>

      <div className={estilos.controles}>
        <button type="button" onClick={() => acercar(1 / 1.4)} aria-label="Acercar">
          +
        </button>
        <button type="button" onClick={() => acercar(1.4)} aria-label="Alejar">
          −
        </button>
        <button type="button" onClick={() => setVista(completa)} aria-label="Ver toda la zona">
          ⤢
        </button>
      </div>
    </div>
  );
}

/**
 * El encuadre que muestra enteros unos puntos, con aire alrededor.
 *
 * Devuelve `null` sin puntos, que quien llama traduce a «mostrar todo».
 */
export function encuadreDe(
  puntos: { x: number; y: number }[],
  ventana: Ventana,
  margen = 0.25,
): Vista | null {
  if (puntos.length === 0) return null;

  const xs = puntos.map((p) => p.x);
  const ys = puntos.map((p) => p.y);

  // Un margen proporcional, con un piso: sin el piso, un solo punto daría una
  // caja de ancho cero y un zoom infinito.
  const ancho = Math.max(Math.max(...xs) - Math.min(...xs), ventana.ancho * 0.06);
  const alto = Math.max(Math.max(...ys) - Math.min(...ys), ventana.alto * 0.06);

  return {
    x: Math.min(...xs) - ancho * margen,
    y: Math.min(...ys) - alto * margen,
    w: ancho * (1 + margen * 2),
    h: alto * (1 + margen * 2),
  };
}
