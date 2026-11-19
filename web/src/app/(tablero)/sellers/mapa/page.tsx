import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/sesion";
import { leerMapaDirectorio } from "@/lib/directorio-mapa-datos";
import { ventanaProyeccion } from "@/lib/cobertura";
import { claveTomTom } from "@/lib/config";
import { PageHead } from "@/components/Shell";
import { Callout } from "@/components/Card";
import { FondoCobertura } from "@/components/FondoCobertura";
import { MapaDirectorio } from "@/components/MapaDirectorio";

export const metadata = { title: "Mapa · Base de datos" };
export const dynamic = "force-dynamic";
export default async function Mapa({ searchParams }: { searchParams: Promise<{ tipo?: string; id?: string; origen?: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/acceso");
  const conDrivers = sesion.rol !== "comercial";
  const [datos, foco] = await Promise.all([leerMapaDirectorio(conDrivers), searchParams]);
  return <><PageHead titulo="Mapa de ubicaciones" eyebrow="Base de datos" dek={conDrivers ? "Sellers y drivers · ubicaciones manuales y de sistema." : "Sellers · ubicaciones manuales y de sistema."} />
    {datos.advertencias.map((aviso) => <Callout key={aviso} tono="warning" titulo="Mapa parcial">{aviso}</Callout>)}
    <MapaDirectorio puntos={datos.puntos} sinCoordenadas={datos.sinCoordenadas} conDrivers={conDrivers} ventana={ventanaProyeccion()} foco={foco} claveTomTom={claveTomTom()}><FondoCobertura /></MapaDirectorio>
  </>;
}
