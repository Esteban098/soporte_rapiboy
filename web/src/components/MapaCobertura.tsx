import { ALTO, ANCHO, caminos } from "@/lib/cobertura";
import estilos from "./mapa-cobertura.module.css";

/**
 * El contorno de cobertura dibujado en SVG.
 *
 * Es un componente de servidor y sin estado: el polígono es un archivo del
 * repo, no cambia entre visitas y no hay nada que el navegador pueda hacer con
 * él salvo dibujarlo. Los ~3.500 puntos viajan como HTML ya renderizado, así
 * que no hay JavaScript de mapa ni pedidos de tiles a ningún servidor.
 *
 * Se dibujan los 86 polígonos por separado y no una silueta unificada: los
 * bordes internos son información: muestran dónde termina un área de reparto y
 * empieza otra, y dónde quedan los espacios sin cubrir entre polígonos vecinos.
 *
 * El trazo va simplificado —un tercio menos de puntos que el KMZ— porque a 560 px de
 * ancho el detalle completo no se ve y son cientos de KB de HTML. La
 * verificación de si un domicilio entra usa siempre el contorno completo.
 */
export function MapaCobertura() {
  return (
    <svg
      className={estilos.mapa}
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label="Contorno de la zona de cobertura"
    >
      {caminos().map((poligono) => (
        <path
          key={poligono.clave}
          d={poligono.d}
          fillRule="evenodd"
          /* Opaco y no translúcido: los polígonos se pisan en los bordes y con
             transparencia los rellenos se suman, dibujando una costura más
             oscura en cada límite. La cobertura es binaria; nada tiene que
             verse «más cubierto» que otra cosa. */
          fill="color-mix(in srgb, var(--accent) 11%, var(--surface))"
          stroke="var(--accent)"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
