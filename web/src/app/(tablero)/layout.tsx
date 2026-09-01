import { auth } from "@/auth";
import { esAdmin } from "@/lib/sesion";
import { flujosActualizacion, modoDatos } from "@/lib/config";
import { Shell } from "@/components/Shell";

export default async function TableroLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth();
  const usuario = sesion?.user?.name ?? sesion?.user?.email ?? null;
  const admin = await esAdmin();

  return (
    <Shell modo={modoDatos()} usuario={usuario} hayFlujos={flujosActualizacion().length > 0} esAdmin={admin}>
      {children}
    </Shell>
  );
}
