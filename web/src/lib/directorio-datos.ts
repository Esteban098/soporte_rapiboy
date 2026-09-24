import "server-only";

import {
  TABLA_DRIVERS_ACTIVOS,
  TABLA_SELLERS_ACTIVOS,
} from "./config";
import { consultarTodo } from "./supabase";
import type { DriverDirectorio, SellerDirectorio } from "./directorio";

type SellerFila = {
  id_seller?: number | string;
  nombre: string | null;
  hora_corte: string | null;
  direccion: string | null;
  fecha_activacion: string | null;
  celular: string | null;
  comercial: string | null;
  email: string | null;
  lleva_bodega: boolean | null;
  lleva_dropoff: boolean | null;
  paga_colecta: boolean | null;
  offline_sistema: boolean | null;
  tope_maximo: number | string | null;
  actualizado_en: string | null;
};

type SellerConsolidadoFila = SellerFila & {
  id_usuario: number | string;
  grupo_nombre: string | null;
  soporte_asignado: "CANDE" | "ESTEBAN" | null;
  labels_waha: unknown;
  ubicacion_manual: string | null;
  latitud_manual: number | string | null;
  longitud_manual: number | string | null;
};

type DriverFila = {
  id_motoboy: number | string;
  nombre: string | null;
  condicion: string | null;
  flotilla: string | null;
  ultima_reserva: string | null;
  grupo_nombre: string | null;
  labels_waha: unknown;
  ubicacion_manual: string | null;
  latitud_manual: number | string | null;
  longitud_manual: number | string | null;
  activo: boolean;
  visto_por_ultima_vez: string | null;
  actualizado_en: string | null;
};

function texto(valor: unknown): string {
  return valor == null ? "" : String(valor).trim();
}

function labelsWaha(valor: unknown): { id?: string | number; name?: string; color?: string }[] {
  const lista = Array.isArray(valor)
    ? valor
    : valor && typeof valor === "object" && Array.isArray((valor as { labels?: unknown }).labels)
      ? (valor as { labels: unknown[] }).labels
      : [];
  return lista.flatMap((label) => {
    if (!label || typeof label !== "object") return [];
    const fila = label as Record<string, unknown>;
    const name = texto(fila.name ?? fila.nombre ?? fila.label);
    return name ? [{ id: fila.id as string | number | undefined, name, color: texto(fila.color) || undefined }] : [];
  });
}

/** Sellers activos. El JID se conserva en Supabase para los flujos, no viaja al navegador. */
export async function leerSellersDirectorio(): Promise<SellerDirectorio[]> {
  const sellers = await consultarTodo<SellerConsolidadoFila>(
    TABLA_SELLERS_ACTIVOS,
    { activo: "eq.true" },
    "nombre.asc,id_usuario.asc",
  );

  return sellers.map((fila) => {
    const tope = fila.tope_maximo == null ? null : Number(fila.tope_maximo);
    return {
      id: Number(fila.id_usuario),
      nombre: texto(fila.nombre),
      horaCorte: texto(fila.hora_corte).slice(0, 5),
      direccion: texto(fila.direccion),
      fechaActivacion: texto(fila.fecha_activacion),
      celular: texto(fila.celular),
      comercial: texto(fila.comercial),
      email: texto(fila.email),
      llevaBodega: fila.lleva_bodega === true,
      llevaDropoff: fila.lleva_dropoff === true,
      pagaColecta: fila.paga_colecta === true,
      offlineSistema: fila.offline_sistema === true,
      topeMaximo: Number.isFinite(tope) ? tope : null,
      grupoWhatsapp: texto(fila.grupo_nombre) || null,
      labelsWaha: labelsWaha(fila.labels_waha),
      ubicacionManual: texto(fila.ubicacion_manual),
      latitudManual: Number.isFinite(Number(fila.latitud_manual)) ? Number(fila.latitud_manual) : null,
      longitudManual: Number.isFinite(Number(fila.longitud_manual)) ? Number(fila.longitud_manual) : null,
      asignacion: fila.grupo_nombre ? "AUTOMATICO" : null,
      soporteAsignado: fila.soporte_asignado,
      actualizadoEn: texto(fila.actualizado_en),
    };
  });
}

/** Drivers activos según la ventana de reservas del flujo 13. */
export async function leerDriversDirectorio(): Promise<DriverDirectorio[]> {
  const drivers = await consultarTodo<DriverFila>(TABLA_DRIVERS_ACTIVOS, { activo: "eq.true" }, "nombre.asc,id_motoboy.asc");
  return drivers.map((fila) => {
    const etiquetas = labelsWaha(fila.labels_waha);
    return {
      id: Number(fila.id_motoboy),
      nombre: texto(fila.nombre),
      condicion: texto(fila.condicion),
      flotilla: texto(fila.flotilla),
      ultimaReserva: texto(fila.ultima_reserva),
      grupoWhatsapp: texto(fila.grupo_nombre) || null,
      labelsWaha: etiquetas,
      ubicacionManual: texto(fila.ubicacion_manual),
      latitudManual: Number.isFinite(Number(fila.latitud_manual)) ? Number(fila.latitud_manual) : null,
      longitudManual: Number.isFinite(Number(fila.longitud_manual)) ? Number(fila.longitud_manual) : null,
      asignacion: fila.grupo_nombre ? "AUTOMATICO" : null,
      actualizadoEn: texto(fila.actualizado_en),
    };
  });
}
