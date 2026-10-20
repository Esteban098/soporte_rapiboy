import estilos from "./valor-metrica.module.css";

/** Cifras, signos y unidades como texto real en Avilock, nunca SVG. */
export function ValorMetrica({ valor }: { valor: string }) {
  if (!/[\p{L}\d]/u.test(valor)) return <>{valor}</>;
  const largo = valor.length > 9 ? estilos.muyLargo : valor.length > 6 ? estilos.largo : "";
  return <span className={`${estilos.valor} ${largo}`}>{valor}</span>;
}
