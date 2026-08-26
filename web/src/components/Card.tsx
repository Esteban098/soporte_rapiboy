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
    <section className={estilos.card}>
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
    <div className={`${estilos.callout} ${clase}`}>
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
    <div className={estilos.kpi}>
      <div className={estilos.kpiLabel}>{etiqueta}</div>
      <div className={`${estilos.kpiValue} ${clase}`}>{valor}</div>
      {nota ? <div className={estilos.kpiNote}>{nota}</div> : null}
    </div>
  );
}

/** Chip con el color propio de un estado del paquete. */
export function ChipEstado({ estado, color }: { estado: string; color: ColorEstado }) {
  const clase = {
    entregado: estilos.estadoEntregado,
    devuelto: estilos.estadoDevuelto,
    devolucion: estilos.estadoDevolucion,
    deposito: estilos.estadoDeposito,
    retirado: estilos.estadoRetirado,
    pararetirar: estilos.estadoPararetirar,
    siniestrado: estilos.estadoSiniestrado,
    noentregado: estilos.estadoNoentregado,
    neutral: estilos.chipNeutral,
  }[color];

  return <span className={`${estilos.chip} ${clase}`}>{estado}</span>;
}

export function Chip({
  tono = "neutral",
  children,
}: {
  tono?: "neutral" | "good" | "warning" | "critical" | "info";
  children: React.ReactNode;
}) {
  const clase = {
    neutral: estilos.chipNeutral,
    good: estilos.chipGood,
    warning: estilos.chipWarning,
    critical: estilos.chipCritical,
    info: estilos.chipInfo,
  }[tono];

  return <span className={`${estilos.chip} ${clase}`}>{children}</span>;
}
