import type { Pedido } from "./normalizar";
import { enRango, mesesOperativos, type Rango } from "./periodos";
import type { Columna } from "@/components/Tabla";

export type OrigenCobro = "mensual" | "historico";

export function esOrigenCobro(valor: unknown): valor is OrigenCobro {
  return valor === "mensual" || valor === "historico";
}

export const COLUMNAS_COBRO: Columna[] = [
  { clave: "valor70", titulo: "Valor al 70%", tipo: "decimal" },
  { clave: "cobrado", titulo: "Cobrado", tipo: "cobrado" },
];

export function esSiniestrado(pedido: Pedido): boolean {
  return pedido.estado.trim().toLowerCase() === "siniestrado";
}

export function siniestradosOperativos(pedidos: Pedido[], hoy = new Date()): Pedido[] {
  const meses = mesesOperativos(hoy);
  return pedidos.filter((pedido) => meses.includes(pedido.mes) && esSiniestrado(pedido));
}

export function siniestradosHistoricos(pedidos: Pedido[], rango: Rango): Pedido[] {
  return pedidos.filter((pedido) => enRango(pedido.mes, rango) && esSiniestrado(pedido));
}

export function resumenSiniestrados(pedidos: Pedido[]) {
  let centavos = 0;
  let sinValor = 0;
  for (const pedido of pedidos) {
    if (pedido.valorProducto == null) sinValor += 1;
    else centavos += Math.round(pedido.valorProducto * 100);
  }
  return { casos: pedidos.length, valorTotal: centavos / 100, sinValor };
}
