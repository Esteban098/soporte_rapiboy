/** Clave de `localStorage`. La leen el botón de plegar y el script previo al pintado. */
export const CLAVE_MENU = "menu";

/** Valor de `data-menu` en `<html>` con la barra lateral reducida a íconos. */
export const MENU_CORTO = "corto";

/**
 * Corre en `<head>` antes de que se pinte nada: sin esto, quien plegó el menú
 * lo vería abrirse y cerrarse en cada carga hasta que hidrate el botón.
 */
export const SCRIPT_MENU = `try{if(localStorage.getItem(${JSON.stringify(CLAVE_MENU)})===${JSON.stringify(MENU_CORTO)})document.documentElement.setAttribute("data-menu",${JSON.stringify(MENU_CORTO)})}catch(e){}`;
