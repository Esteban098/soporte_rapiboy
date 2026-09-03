"use client";

import { useEffect } from "react";

/**
 * El revelado al hacer scroll, en un solo lugar.
 *
 * En vez de un componente cliente por tarjeta, esto se monta una vez en el
 * armazón y observa todo lo que lleve `data-revelar` en el documento. Las
 * tarjetas siguen siendo componentes de servidor: lo único que hacen es marcar
 * el atributo, sin envolver nada en un div extra que después pelee con la
 * grilla.
 *
 * El `MutationObserver` está porque el tablero agrega nodos después del primer
 * pintado —al navegar entre secciones, al abrir un grupo del menú, al pedir más
 * filas— y esos también tienen que entrar animados en vez de aparecer de golpe.
 */
export function Revelar() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const visto = (el: Element) => el.setAttribute("data-revelar", "visible");

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          visto(entrada.target);
          observador.unobserve(entrada.target);
        }
      },
      // Un margen inferior negativo hace que el elemento se revele cuando ya
      // entró de verdad en pantalla y no apenas asoma el borde.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
    );

    const registrar = (raiz: ParentNode) => {
      const nodos = raiz.querySelectorAll?.("[data-revelar='']") ?? [];
      for (const nodo of nodos) observador.observe(nodo);
    };

    registrar(document);

    const mutaciones = new MutationObserver((cambios) => {
      for (const cambio of cambios) {
        for (const nodo of cambio.addedNodes) {
          if (!(nodo instanceof Element)) continue;
          if (nodo.matches("[data-revelar='']")) observador.observe(nodo);
          registrar(nodo);
        }
      }
    });
    mutaciones.observe(document.body, { childList: true, subtree: true });

    return () => {
      observador.disconnect();
      mutaciones.disconnect();
    };
  }, []);

  return null;
}
