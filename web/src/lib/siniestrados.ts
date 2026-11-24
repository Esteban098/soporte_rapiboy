import type { Pedido } from "./normalizar";
import { enRango, mesesOperativos, type Rango } from "./periodos";
import type { Columna } from "@/components/Tabla";

export type OrigenCobro = "mensual" | "historico";

export function esOrigenCobro(valor: unknown): valor is OrigenCobro {
  return valor === "mensual" || valor === "historico";
}

export const COLUMNAS_COBRO: Columna[] = [
  { clave: "valor70", titulo: "Monto 70%", tipo: "decimal" },
  { clave: "siniestroAvisado", titulo: "Avisado", tipo: "avisadoSiniestro" },
  { clave: "cobrado", titulo: "Cobrado", tipo: "cobrado" },
  { clave: "motivoSiniestro", titulo: "Motivo", tipo: "texto" },
  { clave: "comentarioSiniestro", titulo: "Comentario", tipo: "texto" },
];

export const COLUMNAS_INICIALES_SINIESTRADOS = [
  "id",
  "estado",
  "repartidor",
  "tienda",
  "valorProducto",
  "valor70",
  "siniestroAvisado",
  "cobrado",
  "motivoSiniestro",
  "comentarioSiniestro",
] as const;

export const TITULOS_COLUMNAS_SINIESTRADOS: Record<string, string> = {
  id: "ID",
  repartidor: "Driver",
  tienda: "Seller",
  valorProducto: "Monto",
};

export const MOTIVOS_SINIESTRO = [
  "Perdido en Deposito",
  "Roto",
  "Perdido por driver",
  "Mal entregado",
  "Otros",
] as const;

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
  let cobrados = 0;
  for (const pedido of pedidos) {
    if (pedido.valorProducto == null) sinValor += 1;
    else centavos += Math.round(pedido.valorProducto * 100);
    if (pedido.cobrado === true) cobrados += 1;
  }
  return { casos: pedidos.length, valorTotal: centavos / 100, sinValor, cobrados };
}
