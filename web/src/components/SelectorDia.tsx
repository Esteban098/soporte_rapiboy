"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { diaLargo } from "@/lib/formato";
import estilos from "./selector-meses.module.css";

/**
 * Elige un día entre los que tienen colectas cargadas.
 *
 * Comparte los estilos con el selector de meses: son el mismo control con otra
 * unidad, y dos hojas distintas para lo mismo se separan en cuanto alguien
 * retoca una.
 *
 * El día viaja en la URL, así la página se arma en el servidor con los datos ya
 * filtrados y un link a un día puntual se puede pegar en un chat.
 */
export function SelectorDia({
  dias,
  actual,
}: {
  /** Días con colectas, del más nuevo al más viejo. */
  dias: string[];
  actual: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [navegando, iniciar] = useTransition();

  const ir = (dia: string) => iniciar(() => router.push(`${ruta}?dia=${dia}`));

  const indice = dias.indexOf(actual);
  // `dias` viene del más nuevo al más viejo, así que «anterior» es el siguiente
  // del arreglo. Se calcula acá y no con fechas para no ofrecer un domingo que
  // no tiene nada cargado.
  const anterior = indice >= 0 && indice < dias.length - 1 ? dias[indice + 1] : null;
  const posterior = indice > 0 ? dias[indice - 1] : null;

  return (
    <div className={estilos.barra} data-navegando={navegando ? "si" : undefined}>
      <label className={estilos.campo}>
        <span className={estilos.etiqueta}>Día</span>
        <select
          className={estilos.select}
          value={actual}
          onChange={(e) => ir(e.target.value)}
          disabled={navegando}
        >
          {dias.map((dia) => (
            <option key={dia} value={dia}>
              {diaLargo(dia)}
            </option>
          ))}
        </select>
      </label>

      <div className={estilos.atajos}>
        <button
          type="button"
          className={estilos.atajo}
          onClick={() => anterior && ir(anterior)}
          disabled={navegando || !anterior}
        >
          ← Anterior
        </button>
        <button
          type="button"
          className={estilos.atajo}
          onClick={() => posterior && ir(posterior)}
          disabled={navegando || !posterior}
        >
          Siguiente →
        </button>
        <button
          type="button"
          className={`${estilos.atajo} ${actual === dias[0] ? estilos.atajoActivo : ""}`}
          onClick={() => ir(dias[0])}
          disabled={navegando}
        >
          Último día
        </button>
      </div>
    </div>
  );
}
