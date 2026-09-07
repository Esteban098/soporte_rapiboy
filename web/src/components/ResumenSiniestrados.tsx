import type { Pedido } from "@/lib/normalizar";
import { resumenSiniestrados } from "@/lib/siniestrados";
import { decimal, numero } from "@/lib/formato";
import { Kpi } from "./Card";
import estilos from "./ui.module.css";

export function ResumenSiniestrados({ pedidos }: { pedidos: Pedido[] }) {
  const resumen = resumenSiniestrados(pedidos);
  return (
    <div className={estilos.kpis}>
      <Kpi etiqueta="Paquetes siniestrados" valor={numero(resumen.casos)} tono="bad" />
      <Kpi
        etiqueta="Valor declarado total"
        valor={resumen.casos > 0 && resumen.sinValor === resumen.casos ? "—" : decimal(resumen.valorTotal)}
        nota={resumen.sinValor > 0 ? "Total parcial: hay productos sin valor informado" : "Suma del valor de los productos"}
      />
      <Kpi
        etiqueta="Sin valor informado"
        valor={numero(resumen.sinValor)}
        tono={resumen.sinValor > 0 ? "warning" : "neutral"}
        nota="Los valores faltantes no se consideran cero"
      />
    </div>
  );
}
