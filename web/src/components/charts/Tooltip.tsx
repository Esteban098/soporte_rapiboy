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
