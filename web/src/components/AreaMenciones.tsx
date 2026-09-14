"use client";

import { useId, useRef, useState } from "react";
import { personasMencionables } from "@/app/notificaciones";
import { consultaEnCurso, type Mencionable } from "@/lib/menciones";
import { colorDePersona, inicialesDePersona } from "@/lib/seguimiento";
import estilos from "./menciones.module.css";

/**
 * Un textarea que sugiere personas al escribir `@`.
 *
 * El directorio se pide una sola vez por pestaña y recién cuando alguien
 * escribe la primera arroba: la mayoría de los reportes no menciona a nadie y
 * no tiene sentido pedirlo al abrir el formulario.
 */
let directorio: Promise<Mencionable[]> | null = null;

function cargarDirectorio(): Promise<Mencionable[]> {
  directorio ??= personasMencionables().catch(() => {
    // Si falló, que el próximo `@` lo vuelva a intentar.
    directorio = null;
    return [];
  });
  return directorio;
}

const MAXIMO_SUGERENCIAS = 6;

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (valor: string) => void;
};

export function AreaMenciones({ value, onValueChange, onKeyDown, onBlur, ...resto }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [personas, setPersonas] = useState<Mencionable[]>([]);
  const [consulta, setConsulta] = useState<{ inicio: number; consulta: string } | null>(null);
  const [activa, setActiva] = useState(0);
  const idLista = useId();

  const sugerencias = consulta
    ? personas
        .filter(
          (persona) =>
            persona.alias.includes(consulta.consulta) ||
            (persona.nombre ?? "").toLowerCase().includes(consulta.consulta),
        )
        .slice(0, MAXIMO_SUGERENCIAS)
    : [];
  const abierta = sugerencias.length > 0;
  const indice = Math.min(activa, Math.max(0, sugerencias.length - 1));

  function revisar(texto: string, cursor: number) {
    const encontrada = consultaEnCurso(texto, cursor);
    setConsulta(encontrada);
    setActiva(0);
    if (encontrada) void cargarDirectorio().then(setPersonas);
  }

  function elegir(persona: Mencionable) {
    if (!consulta) return;
    const cursor = area.current?.selectionStart ?? value.length;
    const insertado = `@${persona.alias} `;
    onValueChange(`${value.slice(0, consulta.inicio)}${insertado}${value.slice(cursor)}`);
    setConsulta(null);

    const posicion = consulta.inicio + insertado.length;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(posicion, posicion);
    });
  }

  return (
    <div className={estilos.contenedor}>
      <textarea
        {...resto}
        ref={area}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={abierta}
        aria-controls={idLista}
        aria-activedescendant={abierta ? `${idLista}-${indice}` : undefined}
        onChange={(evento) => {
          onValueChange(evento.target.value);
          revisar(evento.target.value, evento.target.selectionStart ?? evento.target.value.length);
        }}
        onClick={(evento) =>
          revisar(evento.currentTarget.value, evento.currentTarget.selectionStart ?? 0)
        }
        onKeyDown={(evento) => {
          if (abierta) {
            if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
              evento.preventDefault();
              const paso = evento.key === "ArrowDown" ? 1 : -1;
              setActiva((indice + paso + sugerencias.length) % sugerencias.length);
              return;
            }
            if ((evento.key === "Enter" || evento.key === "Tab") && !evento.shiftKey) {
              evento.preventDefault();
              elegir(sugerencias[indice]);
              return;
            }
            if (evento.key === "Escape") {
              // Cierra la lista y no el panel que contiene el campo.
              evento.preventDefault();
              evento.stopPropagation();
              setConsulta(null);
              return;
            }
          }
          onKeyDown?.(evento);
        }}
        onBlur={(evento) => {
          // Un momento de gracia para que el clic en una sugerencia llegue.
          setTimeout(() => setConsulta(null), 120);
          onBlur?.(evento);
        }}
      />

      {abierta ? (
        <ul id={idLista} role="listbox" className={estilos.lista} aria-label="Personas para mencionar">
          {sugerencias.map((persona, posicion) => (
            <li
              key={persona.email}
              id={`${idLista}-${posicion}`}
              role="option"
              aria-selected={posicion === indice}
              className={`${estilos.opcion} ${posicion === indice ? estilos.opcionActiva : ""}`}
              onMouseDown={(evento) => {
                evento.preventDefault();
                elegir(persona);
              }}
              onMouseEnter={() => setActiva(posicion)}
            >
              <span
                className={estilos.avatar}
                style={{ background: colorDePersona(persona.email) }}
                aria-hidden="true"
              >
                {inicialesDePersona(persona.email)}
              </span>
              <span className={estilos.alias}>@{persona.alias}</span>
              {persona.nombre ? <span className={estilos.nombre}>{persona.nombre}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
