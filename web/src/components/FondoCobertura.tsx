import { caminos } from "@/lib/cobertura";

/**
 * Los polígonos de reparto, como fondo del live tracker.
 *
 * Es el mismo trazo que dibuja `MapaCobertura`, sin el relleno con acento: acá
 * la cobertura no es el tema, es la referencia contra la que se leen los
 * puntos. El color y el grosor los pone la hoja de estilos del tracker.
 *
 * Componente de servidor y sin estado, igual que su hermano: el KMZ es un
 * archivo del repo y estos ~3.500 puntos viajan como HTML ya renderizado, así
 * que el navegador no descarga el polígono ni pide tiles a ningún servidor.
 */
export function FondoCobertura() {
  return (
    <>
      {caminos().map((poligono) => (
        <path
          key={poligono.clave}
          d={poligono.d}
          fillRule="evenodd"
          strokeLinejoin="round"
          data-poligono-nombre={poligono.nombre}
          data-poligono-zona={poligono.zona}
          role="button"
          tabIndex={0}
          aria-label={`Ver polígono ${poligono.nombre}`}
        >
          <title>{poligono.nombre}</title>
        </path>
      ))}
    </>
  );
}
