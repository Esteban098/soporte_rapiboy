export type Tema = "light" | "dark" | "system";

/** Clave de `localStorage`. La leen el selector y el script previo al pintado. */
export const CLAVE_TEMA = "tema";
export const TEMA_PREDETERMINADO: Tema = "system";

/**
 * Corre en `<head>` antes de que se pinte nada: respeta la elección guardada o
 * resuelve la preferencia del sistema sin destellos al hidratar el selector.
 */
export const SCRIPT_TEMA = `(function(){var t=${JSON.stringify(TEMA_PREDETERMINADO)};try{var v=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});if(v==="light"||v==="dark"||v==="system")t=v}catch(e){}var r=t;if(t==="system"){try{r=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){r="light"}}document.documentElement.setAttribute("data-theme",r)})()`;
