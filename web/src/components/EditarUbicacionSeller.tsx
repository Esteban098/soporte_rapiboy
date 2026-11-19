"use client";

import { useState, useTransition } from "react";
import { guardarUbicacionSeller } from "@/app/sellers";
import estilos from "./directorio-edicion.module.css";
import { puntoDirectorioValido } from "@/lib/directorio-mapa";
import { EnlaceUbicacionDirectorio } from "./EnlaceUbicacionDirectorio";

export function EditarUbicacionSeller({
  id,
  ubicacion,
  latitud,
  longitud,
}: {
  id: number;
  ubicacion: string;
  latitud: number | null;
  longitud: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [direccion, setDireccion] = useState(ubicacion);
  const [lat, setLat] = useState(latitud == null ? "" : String(latitud));
  const [lon, setLon] = useState(longitud == null ? "" : String(longitud));
  const valida = puntoDirectorioValido(latitud, longitud);

  if (!abierto) {
    return (
      <div className={estilos.ubicacion}>
        {valida ? (
          <>
            <EnlaceUbicacionDirectorio tipo="seller" id={id} texto={ubicacion || "Ver ubicación manual"} />
          </>
        ) : (
          <span className={estilos.coordenadas}>Sin ubicación manual</span>
        )}
        <button className={estilos.accion} type="button" onClick={() => setAbierto(true)}>{valida ? "Editar" : "Agregar"}</button>
      </div>
    );
  }

  return (
    <div className={estilos.formulario}>
      <input className={estilos.entrada} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ubicación o domicilio" aria-label={`Ubicación manual del seller ${id}`} />
      <input className={estilos.entrada} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitud" inputMode="decimal" aria-label="Latitud" />
      <input className={estilos.entrada} value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitud" inputMode="decimal" aria-label="Longitud" />
      <div className={estilos.acciones}><button className={estilos.accion} type="button" disabled={pendiente} onClick={() => iniciar(async () => {
        const resultado = await guardarUbicacionSeller(id, { ubicacion: direccion, latitud: Number(lat), longitud: Number(lon) });
        if (!resultado.ok) window.alert(resultado.error);
        else setAbierto(false);
      })}>Guardar</button>
      {latitud != null && longitud != null ? <button className={`${estilos.accion} ${estilos.peligro}`} type="button" disabled={pendiente} onClick={() => iniciar(async () => {
        const resultado = await guardarUbicacionSeller(id, null);
        if (!resultado.ok) window.alert(resultado.error);
        else setAbierto(false);
      })}>Borrar</button> : null}
      <button className={estilos.accion} type="button" disabled={pendiente} onClick={() => setAbierto(false)}>Cancelar</button></div>
    </div>
  );
}
