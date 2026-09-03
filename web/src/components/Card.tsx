import type { ColorEstado } from "@/lib/estados";
import estilos from "./ui.module.css";

export function Card({
  titulo,
  nota,
  extra,
  children,
}: {
  titulo?: string;
  nota?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={estilos.card} data-revelar="">
      {titulo ? (
        <div className={estilos.cardHead}>
          <h2 className={estilos.cardTitle}>{titulo}</h2>
          {extra}
        </div>
      ) : null}
      {nota ? <p className={estilos.cardNote}>{nota}</p> : null}
      {children}
    </section>
  );
}

export function Callout({
  tono = "neutral",
  titulo,
  children,
}: {
  tono?: "neutral" | "warning" | "critical";
  titulo: string;
  children: React.ReactNode;
}) {
  const clase =
    tono === "critical"
      ? estilos.calloutCritical
      : tono === "warning"
        ? estilos.calloutWarning
        : "";

  return (
    <div className={`${estilos.callout} ${clase}`} data-revelar="">
      <h3 className={estilos.calloutTitle}>{titulo}</h3>
      <p className={estilos.calloutBody}>{children}</p>
    </div>
  );
}

export function Kpi({
  etiqueta,
  valor,
  nota,
  tono = "neutral",
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  tono?: "neutral" | "good" | "bad";
}) {
  const clase =
    tono === "good" ? estilos.kpiValueGood : tono === "bad" ? estilos.kpiValueBad : "";

  return (
    <div className={estilos.kpi} data-revelar="">
      <div className={estilos.kpiLabel}>{etiqueta}</div>
      <div className={`${estilos.kpiValue} ${clase}`}>{valor}</div>
      {nota ? <div className={estilos.kpiNote}>{nota}</div> : null}
    </div>
  );
}

/** Estado del paquete: texto con su color, sin pill. */
export function TextoEstado({ estado, color }: { estado: string; color: ColorEstado }) {
  const clase = {
    entregado: estilos.estadoEntregado,
    devuelto: estilos.estadoDevuelto,
    devolucion: estilos.estadoDevolucion,
    deposito: estilos.estadoDeposito,
    retirado: estilos.estadoRetirado,
    pararetirar: estilos.estadoPararetirar,
    siniestrado: estilos.estadoSiniestrado,
    noentregado: estilos.estadoNoentregado,
    cancelado: estilos.estadoCancelado,
    neutral: estilos.estadoNeutral,
  }[color];

  return <span className={clase}>{estado}</span>;
}

/**
 * Caso cerrado o abierto. Es la única pill del proyecto: resuelto contra
 * pendiente es la métrica que la operación mira primero, así que conviene que
 * salte a la vista por encima del resto.
 */
export function ChipCaso({ cerrado }: { cerrado: boolean }) {
  return (
    <span className={`${estilos.chip} ${cerrado ? estilos.casoCerrado : estilos.casoAbierto}`}>
      {cerrado ? "Cerrado" : "Abierto"}
    </span>
  );
}
