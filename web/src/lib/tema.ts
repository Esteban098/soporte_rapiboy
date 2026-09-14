export type Tema = "light" | "dark" | "system";

/** Clave de `localStorage`. La leen el selector y el script previo al pintado. */
export const CLAVE_TEMA = "tema";

/**
 * Corre en `<head>` antes de que se pinte nada: sin esto, quien eligió oscuro
 * vería un destello claro en cada carga hasta que hidrate el selector.
 */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
