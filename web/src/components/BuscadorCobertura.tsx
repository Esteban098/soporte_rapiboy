"use client";

import { useState, useTransition } from "react";
import { verificarDireccion, type Veredicto } from "@/app/cobertura";
import estilos from "./mapa-cobertura.module.css";

/**
 * Buscador de cobertura: una dirección o unas coordenadas.
 *
 * Un solo campo para las dos cosas: un par `lat, lon` o un link de Google Maps
 * se reconocen solos y se resuelven sin salir a la red, así que pedirle a quien
 * busca que declare antes qué está pegando sería un paso de más.
 */
export function BuscadorCobertura({
  ancho,
  alto,
  children,
}: {
  ancho: number;
  alto: number;
  /** El mapa, renderizado en el servidor. Va debajo de la capa de la marca. */
  children: React.ReactNode;
}) {
  const [consulta, setConsulta] = useState("");
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);
  const [buscando, iniciar] = useTransition();

  // Solo los veredictos ubicados traen marca; «sin resultado» y «error» no
  // tienen dónde ponerla y dejan el mapa limpio.
  const marca =
    veredicto && "marca" in veredicto
      ? { ...veredicto.marca, color: color(veredicto.estado) }
      : null;

  function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    const texto = consulta.trim();
    if (!texto || buscando) return;

    iniciar(async () => {
      setVeredicto(await verificarDireccion(texto));
    });
  }

  return (
    <>
      <form className={estilos.buscador} onSubmit={buscar}>
        <input
          className={estilos.campo}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Dirección, o coordenadas pegadas de Google Maps"
          aria-label="Dirección o coordenadas"
          enterKeyHint="search"
        />
        <button className={estilos.boton} type="submit" disabled={buscando || !consulta.trim()}>
          {buscando ? "Buscando…" : "Verificar"}
        </button>
      </form>

      <p className={estilos.ayuda}>
        Conviene escribir la dirección con colonia y alcaldía: sin eso, media docena de calles del
        país se llaman igual. También podés pegar un link de Google Maps o un par{" "}
        <code>lat, lon</code>, que se resuelve sin salir a la red.
      </p>

      {veredicto ? <Resultado veredicto={veredicto} /> : null}

      <div className={estilos.mapaCaja}>
        {children}
        {marca ? (
          <svg className={estilos.marca} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
            <circle className={estilos.pulso} cx={marca.x} cy={marca.y} fill={marca.color} />
            <circle cx={marca.x} cy={marca.y} r={7} fill={marca.color} />
            <circle cx={marca.x} cy={marca.y} r={7} fill="none" stroke="var(--surface)" strokeWidth={2.5} />
          </svg>
        ) : null}
      </div>

      <div className={estilos.leyenda}>
        <span className={estilos.leyendaItem}>
          <span className={estilos.muestra} aria-hidden="true" />
          Zona con cobertura
        </span>
        <span className={estilos.leyendaItem}>
          <span className={estilos.muestraFondo} aria-hidden="true" />
          Sin servicio: también los espacios que quedan entre polígonos vecinos
        </span>
      </div>
    </>
  );
}

function color(estado: Veredicto["estado"]): string {
  if (estado === "dentro") return "var(--good)";
  if (estado === "fuera") return "var(--critical)";
  return "var(--warning)";
}

function Resultado({ veredicto }: { veredicto: Veredicto }) {
  if (veredicto.estado === "sin-resultado" || veredicto.estado === "error") {
    return (
      <div className={`${estilos.resultado} ${estilos.resultadoAviso}`} role="status">
        <p className={`${estilos.veredicto} ${estilos.veredictoAviso}`}>
          {veredicto.estado === "error" ? "No se pudo verificar" : "Sin resultado"}
        </p>
        <p className={estilos.detalle}>{veredicto.mensaje}</p>
      </div>
    );
  }

  const { clase, claseTexto, titulo } = PRESENTACION[veredicto.estado];

  return (
    <div className={`${estilos.resultado} ${clase}`} role="status">
      <p className={`${estilos.veredicto} ${claseTexto}`}>{titulo}</p>
      {veredicto.estado === "dentro" ? <Poligonos zonas={veredicto.zonas} /> : null}
      <p className={estilos.detalle}>
        {veredicto.etiqueta}
        {veredicto.direccion ? `: ${veredicto.direccion}` : null}
      </p>
      <p className={`${estilos.detalle} ${estilos.coordenadas}`}>
        {veredicto.punto.lat.toFixed(5)}, {veredicto.punto.lon.toFixed(5)}
      </p>
    </div>
  );
}

/**
 * Qué polígonos lo cubren.
 *
 * Va junto al veredicto porque no es un detalle: el nombre es el mismo que
 * lleva la columna `poligono` del pedido, así que quien mira un caso puede
 * comparar de un vistazo si está asignado al área que le corresponde.
 *
 * Casi siempre es uno solo. En los bordes puede haber dos, porque los polígonos
 * se pisan un poco al tocarse; ahí se listan los dos en vez de elegir, porque
 * elegir sería inventar una prioridad que el archivo no declara.
 */
function Poligonos({ zonas }: { zonas: { nombre: string; zona: string }[] }) {
  return (
    <p className={estilos.poligono}>
      {zonas.map((z, i) => (
        <span key={`${z.zona}-${z.nombre}-${i}`}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          <span className={estilos.poligonoNombre}>{z.nombre}</span>{" "}
          <span className={estilos.poligonoZona}>({z.zona})</span>
        </span>
      ))}
    </p>
  );
}

const PRESENTACION = {
  dentro: {
    clase: estilos.resultadoDentro,
    claseTexto: estilos.veredictoDentro,
    titulo: "Dentro de cobertura",
  },
  fuera: {
    clase: estilos.resultadoFuera,
    claseTexto: estilos.veredictoFuera,
    titulo: "Fuera de cobertura",
  },
  /* Fuera del mapa entero. Se distingue de «fuera» porque a esta altura el
     problema casi nunca es la cobertura sino la dirección: la geocodificación
     agarró otra ciudad. */
  lejos: {
    clase: estilos.resultadoAviso,
    claseTexto: estilos.veredictoAviso,
    titulo: "Fuera de la zona de operación",
  },
} as const;
