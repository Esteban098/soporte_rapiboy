"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { consultarAlertasEvidencias } from "@/app/evidencias";
import type { EvidenciaPanel } from "@/lib/evidencias";
import estilos from "./evidencias.module.css";

const CLAVE_VISTAS = "rapiboy:evidencias-alertadas";

export function AlertasEvidencia() {
  const [nuevas, setNuevas] = useState<EvidenciaPanel[]>([]);
  const refrescar = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const items = await consultarAlertasEvidencias().catch(() => []);
    const vistas = new Set<string>(JSON.parse(sessionStorage.getItem(CLAVE_VISTAS) || "[]"));
    setNuevas(items.filter((item) => !vistas.has(item.id)));
  }, []);
  useEffect(() => { const primero = setTimeout(refrescar, 1_000); const intervalo = setInterval(refrescar, 60_000); return () => { clearTimeout(primero); clearInterval(intervalo); }; }, [refrescar]);
  if (nuevas.length === 0) return null;
  function cerrar() {
    const vistas = new Set<string>(JSON.parse(sessionStorage.getItem(CLAVE_VISTAS) || "[]"));
    nuevas.forEach((item) => vistas.add(item.id)); sessionStorage.setItem(CLAVE_VISTAS, JSON.stringify([...vistas].slice(-200))); setNuevas([]);
  }
  return <aside className={estilos.toast} role="status" aria-live="polite">
    <div className={estilos.toastHead}><h2>{nuevas.length} evidencia{nuevas.length === 1 ? "" : "s"} para revisar</h2><button onClick={cerrar} aria-label="Cerrar">×</button></div>
    <ul>{nuevas.slice(0, 3).map((item) => <li key={item.id} className={estilos.toastItem}>
      {item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer"><Image src={item.fotoUrl} alt="Vista previa de evidencia" width={64} height={52} unoptimized /></a> : null}
      <span><strong>Viaje #{item.idViaje} · {item.driver}</strong><br />{item.estadoGeografico === "FUERA_DEL_RANGO" ? `Fuera del rango: ${item.distanciaM?.toLocaleString("es-MX")} m del destino (rango ${item.radioM} m).` : item.motivo}<br />{item.fotoUrl ? <a href={item.fotoUrl} target="_blank" rel="noreferrer">Abrir evidencia</a> : null}</span>
    </li>)}</ul>
    {nuevas.length > 3 ? <p>Y {nuevas.length - 3} más.</p> : null}<Link href="/evidencias" onClick={cerrar}>Abrir bandeja de revisión</Link>
  </aside>;
}
