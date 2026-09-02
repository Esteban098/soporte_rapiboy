"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { mesLargo } from "@/lib/formato";
import estilos from "./selector-meses.module.css";

/**
 * Elige un mes o un rango de meses.
 *
 * El rango viaja en la URL y no en el estado del componente, a propósito: así
 * la página se arma en el servidor con los datos ya filtrados —no se mandan al
 * navegador meses que nadie pidió— y un link a «agosto y septiembre» se puede
 * pegar en un chat y abre lo mismo para todos.
 *
 * Solo se ofrecen los meses que tienen datos. Un calendario completo invitaría
 * a elegir un mes vacío y a leer el cero como «no pasó nada», cuando lo que
 * pasa es que la ingesta no llegaba tan atrás.
 */
export function SelectorMeses({
  meses,
  desde,
  hasta,
}: {
  /** Los meses con datos, del más viejo al más nuevo. */
  meses: string[];
  desde: string;
  hasta: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [navegando, iniciar] = useTransition();

  function ir(proximoDesde: string, proximoHasta: string) {
    // Se ordenan acá y no en el servidor para que el selector nunca muestre un
    // rango dado vuelta mientras carga.
    const [a, b] =
      proximoDesde <= proximoHasta
        ? [proximoDesde, proximoHasta]
        : [proximoHasta, proximoDesde];
    iniciar(() => router.push(`${ruta}?desde=${a}&hasta=${b}`));
  }

  const ultimo = meses[meses.length - 1];
  const ultimosTres = meses[Math.max(0, meses.length - 3)];
  const todoElRango = desde === meses[0] && hasta === ultimo;
  const soloUltimo = desde === ultimo && hasta === ultimo;

  return (
    <div className={estilos.barra} data-navegando={navegando ? "si" : undefined}>
      <label className={estilos.campo}>
        <span className={estilos.etiqueta}>Desde</span>
        <select
          className={estilos.select}
          value={desde}
          onChange={(e) => ir(e.target.value, hasta)}
          disabled={navegando}
        >
          {meses.map((mes) => (
            <option key={mes} value={mes}>
              {mesLargo(mes)}
            </option>
          ))}
        </select>
      </label>

      <label className={estilos.campo}>
        <span className={estilos.etiqueta}>Hasta</span>
        <select
          className={estilos.select}
          value={hasta}
          onChange={(e) => ir(desde, e.target.value)}
          disabled={navegando}
        >
          {meses.map((mes) => (
            <option key={mes} value={mes}>
              {mesLargo(mes)}
            </option>
          ))}
        </select>
      </label>

      {/* Los atajos cubren lo que se pide casi siempre; los desplegables quedan
          para el rango puntual que no entra en ninguno. */}
      <div className={estilos.atajos}>
        <button
          type="button"
          className={`${estilos.atajo} ${soloUltimo ? estilos.atajoActivo : ""}`}
          onClick={() => ir(ultimo, ultimo)}
          disabled={navegando}
        >
          Último mes
        </button>
        {meses.length > 3 ? (
          <button
            type="button"
            className={`${estilos.atajo} ${desde === ultimosTres && hasta === ultimo ? estilos.atajoActivo : ""}`}
            onClick={() => ir(ultimosTres, ultimo)}
            disabled={navegando}
          >
            Últimos 3
          </button>
        ) : null}
        <button
          type="button"
          className={`${estilos.atajo} ${todoElRango ? estilos.atajoActivo : ""}`}
          onClick={() => ir(meses[0], ultimo)}
          disabled={navegando}
        >
          Todo
        </button>
      </div>
    </div>
  );
}
