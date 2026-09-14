import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La ejecución CLI de Next 16 pierde stdout de `tsc --showConfig` con el
  // Node del servidor y aborta aunque el JSON sea válido. Usar la API oficial
  // de TypeScript mantiene exactamente el mismo chequeo y permite compilar.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
