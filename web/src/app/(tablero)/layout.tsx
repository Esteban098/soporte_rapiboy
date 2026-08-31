import { auth } from "@/auth";
import { flujosActualizacion, modoDatos } from "@/lib/config";
import { Shell } from "@/components/Shell";

export default async function TableroLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth();
  const usuario = sesion?.user?.name ?? sesion?.user?.email ?? null;

  return (
    <Shell modo={modoDatos()} usuario={usuario} hayFlujos={flujosActualizacion().length > 0}>
      {children}
    </Shell>
  );
}
