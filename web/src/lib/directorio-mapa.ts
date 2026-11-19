import type { DriverDirectorio, SellerDirectorio } from "./directorio";

export type PuntoDirectorio = {
  clave: string; id: number; tipo: "seller" | "driver"; origen: "manual" | "sistema";
  nombre: string; direccion: string; lat: number; lon: number;
};
export type ReferenciaDirectorio = { id: number; tipo: "seller" | "driver"; nombre: string; direccion?: string; lat: number; lon: number; clave: string };

export function coordenadaDirectorio(valor: unknown): number | null {
  if (valor == null || (typeof valor === "string" && !valor.trim())) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}
export function puntoDirectorioValido(lat: number | null, lon: number | null): boolean {
  return lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}
export function enlaceMapaDirectorio(tipo: "seller" | "driver", id: number, origen: "manual" | "sistema" = "manual") {
  return `/sellers/mapa?${new URLSearchParams({ tipo, id: String(id), origen })}`;
}
export function armarPuntosDirectorio(sellers: SellerDirectorio[], drivers: DriverDirectorio[], referencias: ReferenciaDirectorio[]): PuntoDirectorio[] {
  const puntos: PuntoDirectorio[] = [];
  for (const [tipo, filas] of [["seller", sellers], ["driver", drivers]] as const) {
    for (const fila of filas) {
      if (puntoDirectorioValido(fila.latitudManual, fila.longitudManual)) puntos.push({
        clave: `${tipo}:${fila.id}:manual`, id: fila.id, tipo, origen: "manual", nombre: fila.nombre,
        direccion: fila.ubicacionManual || ("direccion" in fila ? fila.direccion : "") || "Ubicación manual",
        lat: fila.latitudManual!, lon: fila.longitudManual!,
      });
    }
  }
  for (const ref of referencias) {
    const fila = ref.tipo === "seller" ? sellers.find((s) => s.id === ref.id) : drivers.find((d) => d.id === ref.id);
    if (!fila || !puntoDirectorioValido(ref.lat, ref.lon)) continue;
    puntos.push({ clave: `${ref.tipo}:${ref.id}:sistema:${ref.clave}`, id: ref.id, tipo: ref.tipo, origen: "sistema",
      nombre: fila.nombre, direccion: ref.direccion || ("direccion" in fila ? fila.direccion : "") || ref.nombre,
      lat: ref.lat, lon: ref.lon });
  }
  return puntos.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.clave.localeCompare(b.clave));
}
export function filtrarPuntosDirectorio(puntos: PuntoDirectorio[], busqueda: string, tipo: string, origen: string) {
  const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const consulta = normalizar(busqueda.trim());
  return puntos.filter((p) => (tipo === "todos" || p.tipo === tipo) && (origen === "todos" || p.origen === origen) &&
    normalizar(`${p.nombre} ${p.id} ${p.direccion}`).includes(consulta));
}
