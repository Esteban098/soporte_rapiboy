import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * SF Pro, la tipografía del sistema de Apple, servida desde el mismo dominio.
 *
 * Los archivos salieron de `SF-Pro.dmg` y están subseteados a latín + la
 * puntuación y las flechas que usa el tablero: cada peso queda en ~45 KB en vez
 * de los 6 MB del OTF original. Al ser locales, el build ya no necesita salir a
 * Google Fonts y no hay salto de tipografía al cargar.
 *
 * Text para la interfaz y Display para títulos y cifras: es el mismo diseño con
 * el espaciado óptico ajustado a cada tamaño, que es justo lo que hace que los
 * números grandes se lean apretados y el cuerpo chico siga aireado.
 */
const sans = localFont({
  src: [
    { path: "./fonts/SF-Pro-Text-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SF-Pro-Text-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SF-Pro-Text-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/SF-Pro-Text-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fuente-sans",
  display: "swap",
});

const display = localFont({
  src: [
    { path: "./fonts/SF-Pro-Display-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SF-Pro-Display-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SF-Pro-Display-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/SF-Pro-Display-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fuente-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Tablero de Operación",
    template: "%s · Tablero de Operación",
  },
  description: "Casos abiertos, demoras y reclamos de tienda de la operación de México.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
