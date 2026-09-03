"use client";

import estilos from "./chart.module.css";

export type LineaTooltip = { etiqueta: string; valor: string };

export function CajaTooltip({ titulo, lineas }: { titulo: string; lineas: LineaTooltip[] }) {
  return (
    <div className={estilos.tooltip}>
      <div className={estilos.tooltipTitle}>{titulo}</div>
      {lineas.map((linea) => (
        <div key={linea.etiqueta} className={estilos.tooltipRow}>
          {linea.etiqueta}: {linea.valor}
        </div>
      ))}
    </div>
  );
}

/**
 * Avisa que los puntos del gráfico se pueden tocar.
 *
 * Sin esto el drill-down es invisible: nadie prueba a hacer clic en una barra
 * si nada le dijo que pasa algo.
 */
export function Pista({ que = "una barra" }: { que?: string }) {
  return (
    <p className={estilos.pista}>
      <svg
        className={estilos.pistaIcono}
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M6 2.5v6.2l-1.6-1.3a1.2 1.2 0 0 0-1.6 1.8l3.4 3.4c.4.4 1 .7 1.6.7h2.7a2.5 2.5 0 0 0 2.5-2.5V8.2a1.1 1.1 0 0 0-2.2 0" strokeLinejoin="round" />
      </svg>
      Tocá {que} para ver en una pestaña nueva las filas que hay detrás.
    </p>
  );
}

export function Leyenda({ series }: { series: { nombre: string; color: string }[] }) {
  return (
    <div className={estilos.legend}>
      {series.map((serie) => (
        <span key={serie.nombre} className={estilos.legendItem}>
          <span className={estilos.swatch} style={{ background: serie.color }} aria-hidden="true" />
          {serie.nombre}
        </span>
      ))}
    </div>
  );
}
