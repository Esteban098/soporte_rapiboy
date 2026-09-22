import { auth } from "@/auth";
import { esAdmin } from "@/lib/sesion";
import { modoDatos } from "@/lib/config";
import { leerSellersDirectorio } from "@/lib/directorio-datos";
import { claveTienda } from "@/lib/responsables";
import { Shell } from "@/components/Shell";
import { ProveedorTiendas } from "@/components/ColorTiendas";

export default async function TableroLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth();
  const usuario = sesion?.user?.name ?? sesion?.user?.email ?? null;
  const admin = await esAdmin();

  let indice: Record<string, string> = {};
  if (modoDatos() === "supabase") {
    try {
      const sellers = await leerSellersDirectorio();
      indice = Object.fromEntries(
        sellers
          .filter((seller) => seller.soporteAsignado)
          .map((seller) => [
            claveTienda(seller.nombre),
            seller.soporteAsignado === "CANDE" ? "candelaria@rapiboy.com" : "esteban@rapiboy.com",
          ]),
      );
    } catch {
      indice = {};
    }
  }

  return (
    <ProveedorTiendas indice={indice}>
      <Shell modo={modoDatos()} usuario={usuario} esAdmin={admin} rol={sesion?.user?.rol ?? null}>
        {children}
      </Shell>
    </ProveedorTiendas>
  );
}
