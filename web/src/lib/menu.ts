/** Clave de `localStorage`. La leen el botón de plegar y el script previo al pintado. */
export const CLAVE_MENU = "menu";

/** Valor de `data-menu` en `<html>` con la barra lateral reducida a íconos. */
export const MENU_CORTO = "corto";

/** La barra solo queda desplegada cuando la persona lo eligio explicitamente. */
export const MENU_ABIERTO = "abierto";

/**
 * Corre en `<head>` antes de que se pinte nada. El estado predeterminado es
 * compacto; se conserva abierto unicamente si esa fue la ultima eleccion.
 */
export const SCRIPT_MENU = `try{if(localStorage.getItem(${JSON.stringify(CLAVE_MENU)})!==${JSON.stringify(MENU_ABIERTO)})document.documentElement.setAttribute("data-menu",${JSON.stringify(MENU_CORTO)})}catch(e){document.documentElement.setAttribute("data-menu",${JSON.stringify(MENU_CORTO)})}`;
