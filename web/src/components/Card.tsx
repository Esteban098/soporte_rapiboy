import type { ColorEstado } from "@/lib/estados";
import estilos from "./ui.module.css";

export function Card({
  titulo,
  nota,
  extra,
  className,
  children,
}: {
  titulo?: string;
  nota?: string;
  extra?: React.ReactNode;
  /** Variante visual puntual, sin duplicar la estructura de una tarjeta. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${estilos.card} ${className ?? ""}`}>
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
  relleno = false,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  tono?: "neutral" | "good" | "bad" | "warning";
  /**
   * Tiñe también el fondo de la tarjeta, no solo la cifra. Para las métricas
   * que hay que reconocer de un vistazo, sin tener que leer el número.
   */
  relleno?: boolean;
}) {
  const claseValor =
    tono === "good"
      ? estilos.kpiValueGood
      : tono === "bad"
        ? estilos.kpiValueBad
        : tono === "warning"
          ? estilos.kpiValueWarning
          : "";

  const claseFondo = relleno
    ? tono === "good"
      ? estilos.kpiFillGood
      : tono === "bad"
        ? estilos.kpiFillBad
        : tono === "warning"
          ? estilos.kpiFillWarning
          : ""
    : "";

  return (
    <div className={`${estilos.kpi} ${claseFondo}`}>
      <span className={estilos.kpiIcono} aria-hidden="true">{iconoDe(etiqueta)}</span>
      <div className={estilos.kpiLabel}>{etiqueta}</div>
      <div className={`${estilos.kpiValue} ${claseValor}`}>{valor}</div>
      {nota ? <div className={estilos.kpiNote}>{nota}</div> : null}
    </div>
  );
}

/** Íconos de apoyo, no de navegación: permiten escanear el tablero sin texto repetido. */
function iconoDe(etiqueta: string) {
  const clave = etiqueta.toLocaleLowerCase("es");
  const comun = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (/(driver|repartidor|ruta)/.test(clave)) return <svg {...comun}><circle cx="7" cy="17" r="2.5" /><circle cx="17" cy="17" r="2.5" /><path d="M7 17h4l3-7h3l2 7M10 10h4" /></svg>;
  if (/(entreg|cerrad|resuelt|cobrad|bodega)/.test(clave)) return <svg {...comun}><path d="m5 12 4 4L19 6" /><path d="M4 4h16v16H4z" /></svg>;
  if (/(abiert|demor|sin entregar|sin respuesta|pendiente)/.test(clave)) return <svg {...comun}><path d="M12 3 21 20H3Z" /><path d="M12 9v4m0 3h.01" /></svg>;
  if (/(tienda|seller|directorio|grupo)/.test(clave)) return <svg {...comun}><path d="M4 10h16v10H4zM3 10l2-6h14l2 6M8 20v-6h4v6" /></svg>;
  return <svg {...comun}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 15v-3m4 3V8m4 7v-5" /></svg>;
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
