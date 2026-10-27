"use client";

import estilos from "./mapa-evidencia.module.css";

type Punto = { lat: number; lon: number };

const ANCHO = 900;
const ALTO = 420;
const TILE = 256;

function mercator({ lat, lon }: Punto) {
  const limitada = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = limitada * Math.PI / 180;
  return {
    x: (lon + 180) / 360,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2,
  };
}

function vistaPara(a: Punto, b: Punto) {
  const p1 = mercator(a); const p2 = mercator(b);
  const dx = Math.max(Math.abs(p1.x - p2.x), 0.000002);
  const dy = Math.max(Math.abs(p1.y - p2.y), 0.000002);
  let zoom = 2;
  for (let candidato = 18; candidato >= 2; candidato -= 1) {
    const escala = TILE * 2 ** candidato;
    if (dx * escala <= ANCHO - 170 && dy * escala <= ALTO - 130) { zoom = candidato; break; }
  }
  const escala = TILE * 2 ** zoom;
  const centro = { x: ((p1.x + p2.x) / 2) * escala, y: ((p1.y + p2.y) / 2) * escala };
  const proyectar = (p: typeof p1) => ({ x: p.x * escala - centro.x + ANCHO / 2, y: p.y * escala - centro.y + ALTO / 2 });
  return { zoom, escala, centro, evento: proyectar(p1), destino: proyectar(p2) };
}

export function MapaEvidencia({ evento, destino }: { evento: Punto; destino: Punto }) {
  const vista = vistaPara(evento, destino);
  const inicioX = Math.floor((vista.centro.x - ANCHO / 2) / TILE);
  const finX = Math.floor((vista.centro.x + ANCHO / 2) / TILE);
  const inicioY = Math.floor((vista.centro.y - ALTO / 2) / TILE);
  const finY = Math.floor((vista.centro.y + ALTO / 2) / TILE);
  const limite = 2 ** vista.zoom;
  const teselas: { x: number; y: number; izquierda: number; arriba: number }[] = [];
  for (let y = inicioY; y <= finY; y += 1) for (let x = inicioX; x <= finX; x += 1) {
    if (y < 0 || y >= limite) continue;
    teselas.push({
      x: ((x % limite) + limite) % limite, y,
      izquierda: x * TILE - vista.centro.x + ANCHO / 2,
      arriba: y * TILE - vista.centro.y + ALTO / 2,
    });
  }
  return <div className={estilos.mapa}>
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Mapa con el domicilio esperado y el lugar donde se registró la evidencia">
      {teselas.map((t) => <image key={`${t.x}-${t.y}`} href={`https://tile.openstreetmap.org/${vista.zoom}/${t.x}/${t.y}.png`} x={t.izquierda} y={t.arriba} width={TILE + .5} height={TILE + .5} />)}
      <line className={estilos.linea} x1={vista.destino.x} y1={vista.destino.y} x2={vista.evento.x} y2={vista.evento.y} />
      <g transform={`translate(${vista.destino.x} ${vista.destino.y})`}>
        <circle className={`${estilos.halo} ${estilos.haloDestino}`} r="18" />
        <circle className={`${estilos.punto} ${estilos.puntoDestino}`} r="8" />
        <text className={estilos.etiqueta} x="13" y="-13">Domicilio esperado</text>
      </g>
      <g transform={`translate(${vista.evento.x} ${vista.evento.y})`}>
        <circle className={`${estilos.halo} ${estilos.haloEvento}`} r="18" />
        <circle className={`${estilos.punto} ${estilos.puntoEvento}`} r="8" />
        <text className={estilos.etiqueta} x="13" y="25">Evidencia registrada</text>
      </g>
    </svg>
    <div className={estilos.pie}><span><i className={`${estilos.leyenda} ${estilos.leyendaDestino}`} />Domicilio esperado</span><span><i className={`${estilos.leyenda} ${estilos.leyendaEvento}`} />Evidencia registrada</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div>
  </div>;
}
