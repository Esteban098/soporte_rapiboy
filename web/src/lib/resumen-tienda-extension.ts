import "server-only";

import { cargarPedidos, cargarSeguimientos } from "./datos";
import { leerSellersDirectorio } from "./directorio-datos";
import { demorados } from "./metricas";
import { esSiniestrado } from "./siniestrados";

function normalizar(valor: string | null | undefined): string {
  return (valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

function mismaTienda(a: string | null | undefined, b: string | null | undefined): boolean {
  const izquierda = normalizar(a);
  const derecha = normalizar(b);
  if (!izquierda || !derecha) return false;
  return izquierda === derecha || (Math.min(izquierda.length, derecha.length) >= 6 && (izquierda.includes(derecha) || derecha.includes(izquierda)));
}

export async function resumenTiendaExtension(id: number) {
  const [sellers, casos, seguimiento] = await Promise.all([
    leerSellersDirectorio(),
    cargarPedidos(),
    cargarSeguimientos(),
  ]);
  const seller = sellers.find((fila) => fila.id === id);
  if (!seller) return null;

  const pedidos = casos.pedidos.filter((pedido) => mismaTienda(pedido.tienda, seller.nombre));
  const demoradosTienda = new Set(demorados(pedidos).map((pedido) => pedido.id));
  const reportes = seguimiento.reportes.filter((reporte) => mismaTienda(reporte.seller, seller.nombre));
  return {
    id: seller.id,
    nombre: seller.nombre,
    direccion: seller.ubicacionManual || seller.direccion || null,
    celular: seller.celular || null,
    grupo: seller.grupoWhatsapp,
    soporte: seller.soporteAsignado,
    estadoSistema: seller.offlineSistema ? "Offline" : "Online",
    metricas: {
      casosAbiertos: pedidos.filter((pedido) => !pedido.cerrado).length,
      seguimientosAbiertos: reportes.filter((reporte) => reporte.estado === "abierto").length,
      demorados: demoradosTienda.size,
      noEntregados: pedidos.filter((pedido) => normalizar(pedido.estado) === "pedido no entregado").length,
      siniestros: pedidos.filter(esSiniestrado).length,
    },
    enlaces: {
      sellers: "/sellers",
      seguimiento: "/seguimiento",
      demorados: "/demorados",
      siniestros: "/siniestrados",
    },
  };
}
