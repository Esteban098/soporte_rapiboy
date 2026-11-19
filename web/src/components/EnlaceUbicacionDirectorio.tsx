import { enlaceMapaDirectorio } from "@/lib/directorio-mapa";
import estilos from "./directorio-edicion.module.css";
export function EnlaceUbicacionDirectorio({ tipo, id, origen = "manual", texto }: { tipo: "seller" | "driver"; id: number; origen?: "manual" | "sistema"; texto: string }) {
  return <a className={estilos.enlaceMapa} href={enlaceMapaDirectorio(tipo, id, origen)} target="_blank" rel="noopener noreferrer" title={`${texto} · Abrir mapa de ubicaciones`}>{texto} ↗</a>;
}
