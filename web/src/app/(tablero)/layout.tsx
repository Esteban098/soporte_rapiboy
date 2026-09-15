import { auth } from "@/auth";
import { esAdmin } from "@/lib/sesion";
import { modoDatos } from "@/lib/config";
import { indiceResponsables } from "@/lib/responsables-datos";
import { Shell } from "@/components/Shell";
import { ProveedorTiendas } from "@/components/ColorTiendas";

export default async function TableroLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth();
  const usuario = sesion?.user?.name ?? sesion?.user?.email ?? null;
  const admin = await esAdmin();

  // Sin base no hay distribución que leer: las tiendas se ven sin color.
  const indice = modoDatos() === "supabase" ? await indiceResponsables() : {};

  return (
    <ProveedorTiendas indice={indice}>
      <Shell modo={modoDatos()} usuario={usuario} esAdmin={admin}>
        {children}
      </Shell>
    </ProveedorTiendas>
  );
}
