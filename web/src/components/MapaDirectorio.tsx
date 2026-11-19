"use client";
import { useMemo, useState } from "react";
import { filtrarPuntosDirectorio, type PuntoDirectorio } from "@/lib/directorio-mapa";
import { proyectarEn, type Ventana } from "@/lib/tracker";
import { LienzoMapa, encuadreDe } from "./LienzoMapa";
import { AtribucionTomTom, CapaTomTom } from "./Trafico";
import estilos from "./directorio-mapa.module.css";

export function MapaDirectorio({ puntos, ventana, foco, sinCoordenadas, conDrivers, claveTomTom, children }: {
  puntos: PuntoDirectorio[]; ventana: Ventana; foco: { tipo?: string; id?: string; origen?: string };
  sinCoordenadas: number; conDrivers: boolean; claveTomTom: string | null; children: React.ReactNode;
}) {
  const inicial = puntos.find((p) => p.tipo === foco.tipo && String(p.id) === foco.id && p.origen === foco.origen);
  const [elegido, setElegido] = useState<string | null>(inicial?.clave ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [origen, setOrigen] = useState("todos");
  const [calles, setCalles] = useState(false);
  const visibles = useMemo(() => filtrarPuntosDirectorio(puntos, busqueda, tipo, origen), [puntos, busqueda, tipo, origen]);
  const actual = visibles.find((p) => p.clave === elegido);
  const proyectados = visibles.map((p) => ({ ...p, ...proyectarEn(p, ventana) }));
  return <div className={estilos.contenedor}>
    <aside className={estilos.panel}>
      <label>Buscar punto<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, ID o domicilio" /></label>
      <div className={estilos.filtros}>
        {conDrivers ? <label>Tipo<select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="todos">Todos</option><option value="seller">Sellers</option><option value="driver">Drivers</option></select></label> : null}
        <label>Ubicación<select aria-label="Ubicación" value={origen} onChange={(e) => setOrigen(e.target.value)}><option value="todos">Todas</option><option value="manual">Manual</option><option value="sistema">Sistema</option></select></label>
      </div>
      <p className={estilos.nota}>{visibles.length} de {puntos.length} puntos · {sinCoordenadas} registros sin coordenadas</p>
      {foco.id && !inicial ? <p role="status" className={estilos.nota}>La ubicación seleccionada no tiene coordenadas válidas. Buscá otra ubicación del mismo ID.</p> : null}
      <ul className={estilos.lista}>{visibles.map((p) => <li key={p.clave}><button type="button" aria-pressed={elegido === p.clave} onClick={() => setElegido(p.clave)}>
        <strong>{p.nombre}</strong><span>#{p.id} · {p.tipo === "seller" ? "Seller" : "Driver"} · {p.origen === "manual" ? "Manual" : "Sistema"}</span><small>{p.direccion}</small>
      </button></li>)}</ul>
      {visibles.length === 0 ? <p className={estilos.nota}>Ningún punto coincide con los filtros.</p> : null}
    </aside>
    <section className={estilos.mapa} aria-label="Mapa de ubicaciones">
      <div className={estilos.barra}>
        <span><i className={estilos.seller} /> Sellers {conDrivers ? <>· <i className={estilos.driver} /> Drivers</> : null}</span>
        <button type="button" onClick={() => { setElegido(null); setBusqueda(""); setTipo("todos"); setOrigen("todos"); }}>Ver todos los puntos</button>
        {claveTomTom ? <label><input type="checkbox" checked={calles} onChange={(e) => setCalles(e.target.checked)} />Calles</label> : null}
      </div>
      {actual ? <div className={estilos.seleccion}><strong>{actual.nombre}</strong><span>{actual.direccion} · {actual.lat}, {actual.lon}</span>
        <a href={`https://www.google.com/maps?q=${actual.lat},${actual.lon}`} target="_blank" rel="noopener noreferrer">Abrir en Google Maps ↗</a>
      </div> : null}
      <LienzoMapa ventana={ventana} clave={`${busqueda}|${tipo}|${origen}|${elegido ?? ""}`} encuadrar={() => encuadreDe(actual ? [proyectarEn(actual, ventana)] : proyectados, ventana, .35)} etiqueta="Ubicaciones de sellers y drivers" fondo={children} fondoSobreMapa={calles}
        debajo={claveTomTom && calles ? (lienzo) => <CapaTomTom capa="calles" clave={claveTomTom} ventana={ventana} lienzo={lienzo} /> : undefined}>
        {(k) => proyectados.map((p) => <g key={p.clave} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`Ver ${p.nombre}, ${p.origen}`} onClick={() => setElegido(p.clave)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setElegido(p.clave); } }} className={p.tipo === "seller" ? estilos.pinSeller : estilos.pinDriver}>
          <title>{p.nombre} · {p.direccion} · {p.origen}</title>
          {p.clave === elegido ? <circle r={14 * k} className={estilos.halo} /> : null}
          <circle r={7 * k} strokeWidth={2 * k} fill={p.origen === "manual" ? "currentColor" : "var(--surface)"} />
        </g>)}
      </LienzoMapa>
      {calles ? <AtribucionTomTom trafico={false} /> : null}
      <p className={estilos.nota}>Punto lleno: manual · Punto hueco: sistema. Las ubicaciones de sistema corresponden al mapa de referencia; no son posiciones en vivo.</p>
    </section>
  </div>;
}
