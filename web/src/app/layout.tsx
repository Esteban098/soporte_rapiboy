import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Las fuentes se sirven desde el mismo dominio: una request menos y sin salto
// de tipografía al cargar.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-sans",
  display: "swap",
});

const display = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
  description: "Entregas fallidas, demoras y cancelaciones de la operación de México.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
