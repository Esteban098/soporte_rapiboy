import { auth } from "@/auth";
import { modoDatos } from "@/lib/config";
import { leerSellersDirectorio } from "@/lib/directorio-datos";
import { claveTienda } from "@/lib/responsables";
import { ProveedorTiendas } from "@/components/ColorTiendas";
import { ColectasShell } from "@/components/ColectasShell";

export default async function ColectasLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth();
  const usuario = sesion?.user?.name ?? sesion?.user?.email ?? null;
  let indice: Record<string, string> = {};

  if (modoDatos() === "supabase") {
    try {
      const sellers = await leerSellersDirectorio();
      indice = Object.fromEntries(sellers.filter((seller) => seller.soporteAsignado).map((seller) => [
        claveTienda(seller.nombre), seller.soporteAsignado === "CANDE" ? "candelaria@rapiboy.com" : "esteban@rapiboy.com",
      ]));
    } catch { /* El espacio de colectas funciona sin el índice de colores. */ }
  }

  return <ProveedorTiendas indice={indice}><ColectasShell usuario={usuario} puedeOperar={sesion?.user?.rol !== "comercial"}>{children}</ColectasShell></ProveedorTiendas>;
}
