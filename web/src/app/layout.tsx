import type { Metadata } from "next";
import { Asap, Bitter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Las fuentes se sirven desde el mismo dominio: una request menos y sin salto
// de tipografía al cargar.
// Asap para la interfaz: humanista, con modulación de trazo y terminales
// levemente suavizadas. Legible en cuerpos chicos sin el aire neutro de las
// grotescas de sistema.
const sans = Asap({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-sans",
  display: "swap",
});

// Bitter, una slab pensada para pantalla, en títulos y cifras: le da peso
// técnico a los números sin recurrir a una geométrica.
const display = Bitter({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--fuente-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--fuente-mono",
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
    <html lang="es-MX" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
