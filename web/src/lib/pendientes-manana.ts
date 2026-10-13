import "server-only";

import { poligonosAledanosAlPunto, ubicarPunto } from "./cobertura";

export const MINIMO_AVISO_DRIVER = 6;
export const MINIMO_AVISO_OPERATIVO = 16;
export const GRUPO_OPERATIVO_PENDIENTES = "120363325021795726@g.us";

export type DriverPendientes = {
  id: number;
  nombre: string;
  grupoJid: string | null;
  latitudManual: number | null;
  longitudManual: number | null;
};

export type PaqueteNoEntregado = {
  idDriver: number | null;
  latitudDestino: number | null;
  longitudDestino: number | null;
};

export type CandidatoPendientes = {
  idDriver: number;
  nombreDriver: string;
  grupoJid: string | null;
  pendientes: number;
  poligonos: string[];
};

function coordenada(latitud: number | null, longitud: number | null) {
  return latitud != null && longitud != null && Number.isFinite(latitud) && Number.isFinite(longitud)
    ? { lat: latitud, lon: longitud }
    : null;
}

/**
 * Elegibles para recuperar entregas temprano. Solo se cuentan destinos que
 * caen en el polígono del domicilio manual o alguno que comparte su borde.
 */
export function candidatosPendientesManana(
  drivers: DriverPendientes[],
  paquetes: PaqueteNoEntregado[],
): CandidatoPendientes[] {
  const porDriver = new Map<number, PaqueteNoEntregado[]>();
  for (const paquete of paquetes) {
    if (paquete.idDriver == null) continue;
    const lista = porDriver.get(paquete.idDriver) ?? [];
    lista.push(paquete);
    porDriver.set(paquete.idDriver, lista);
  }

  return drivers.flatMap((driver) => {
    const hogar = coordenada(driver.latitudManual, driver.longitudManual);
    if (!hogar) return [];
    const cercanos = new Set(poligonosAledanosAlPunto(hogar).map((zona) => zona.nombre));
    if (cercanos.size === 0) return [];
    const enZona = (porDriver.get(driver.id) ?? []).filter((paquete) => {
      const destino = coordenada(paquete.latitudDestino, paquete.longitudDestino);
      return destino != null && ubicarPunto(destino).some((zona) => cercanos.has(zona.nombre));
    });
    if (enZona.length < MINIMO_AVISO_DRIVER) return [];
    return [{
      idDriver: driver.id,
      nombreDriver: driver.nombre,
      grupoJid: driver.grupoJid,
      pendientes: enZona.length,
      poligonos: [...cercanos].sort((a, b) => a.localeCompare(b, "es")),
    }];
  });
}

export function textoAvisoDriver(candidato: CandidatoPendientes, jornada: string): string {
  return `Hola ${candidato.nombreDriver}. Tenés ${candidato.pendientes} paquetes no visitados de la jornada ${jornada} en una zona cercana a tu domicilio. Durante esta mañana debés realizar esas entregas pendientes antes de iniciar colectas.`;
}

export function textoAvisoOperativo(candidato: CandidatoPendientes, jornada: string): string {
  return `⚠️ Pendientes de entrega\n${candidato.nombreDriver} tiene ${candidato.pendientes} paquetes no visitados de la jornada ${jornada} en una zona cercana a su domicilio. Esta mañana no realiza colecta: estará asignado a recuperar las entregas pendientes.`;
}
