"use client";

import { useState, useTransition } from "react";
import { guardarUbicacionDriver } from "@/app/sellers";

export function EditarUbicacionDriver({ id, ubicacion, latitud, longitud }: { id: number; ubicacion: string; latitud: number | null; longitud: number | null }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [direccion, setDireccion] = useState(ubicacion);
  const [lat, setLat] = useState(latitud == null ? "" : String(latitud));
  const [lon, setLon] = useState(longitud == null ? "" : String(longitud));
  if (!abierto) return <div>{latitud != null && longitud != null ? <><div>{ubicacion || "Ubicación manual"}</div><small>{latitud}, {longitud}</small></> : <span>Sin ubicación manual</span>}<div><button type="button" onClick={() => setAbierto(true)}>{latitud != null && longitud != null ? "Editar" : "Agregar"}</button></div></div>;
  return <div>
    <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ubicación o domicilio" aria-label={`Ubicación manual del driver ${id}`} />
    <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitud" inputMode="decimal" aria-label="Latitud" />
    <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitud" inputMode="decimal" aria-label="Longitud" />
    <button type="button" disabled={pendiente} onClick={() => iniciar(async () => { const r = await guardarUbicacionDriver(id, { ubicacion: direccion, latitud: Number(lat), longitud: Number(lon) }); if (!r.ok) window.alert(r.error); else setAbierto(false); })}>Guardar</button>
    {latitud != null && longitud != null ? <button type="button" disabled={pendiente} onClick={() => iniciar(async () => { const r = await guardarUbicacionDriver(id, null); if (!r.ok) window.alert(r.error); else setAbierto(false); })}>Borrar</button> : null}
    <button type="button" disabled={pendiente} onClick={() => setAbierto(false)}>Cancelar</button>
  </div>;
}
