import Link from "next/link";
import { NavLink } from "./NavLink";
import { SignOutButton } from "./SignOutButton";
import { BotonActualizar } from "./BotonActualizar";
import estilos from "./ui.module.css";

const SECCIONES = [
  { href: "/", etiqueta: "Mes en curso" },
  { href: "/operacion", etiqueta: "Ayer" },
  { href: "/demorados", etiqueta: "Demorados" },
  { href: "/reclamos", etiqueta: "Reclamos de tienda" },
  { href: "/repartidores", etiqueta: "Repartidores" },
  { href: "/comercios", etiqueta: "Comercios y zonas" },
];

export function Shell({
  children,
  modo,
  usuario,
}: {
  children: React.ReactNode;
  modo: "sheet" | "fixture";
  usuario?: string | null;
}) {
  return (
    <div className={estilos.shell}>
      <header className={estilos.topbar}>
        <div className={estilos.topbarInner}>
          <Link href="/" className={estilos.brand}>
            <span className={estilos.brandMark} aria-hidden="true" />
            Operación México
            <span className={estilos.brandSub}>Soporte</span>
          </Link>

          <nav className={estilos.nav} aria-label="Secciones">
            {SECCIONES.map((seccion) => (
              <NavLink key={seccion.href} href={seccion.href}>
                {seccion.etiqueta}
              </NavLink>
            ))}
          </nav>

          <div className={estilos.topbarEnd}>
            <BotonActualizar />
            <span className={estilos.fuente} title={fuenteTitulo(modo)}>
              <span
                className={`${estilos.fuenteDot} ${modo === "fixture" ? estilos.fuenteDotFixture : ""}`}
                aria-hidden="true"
              />
              {modo === "fixture" ? "Datos de prueba" : "Sheet en vivo"}
            </span>
            {usuario ? <SignOutButton nombre={usuario} /> : null}
          </div>
        </div>
      </header>

      <main className={estilos.main}>{children}</main>
    </div>
  );
}

function fuenteTitulo(modo: "sheet" | "fixture"): string {
  return modo === "fixture"
    ? "La app está leyendo los fixtures locales, no el Google Sheet"
    : "Los datos vienen del Google Sheet, con una hora de caché";
}

export function PageHead({
  eyebrow,
  titulo,
  dek,
}: {
  eyebrow: string;
  titulo: string;
  dek?: string;
}) {
  return (
    <div className={estilos.pageHead}>
      <p className={estilos.eyebrow}>{eyebrow}</p>
      <h1 className={estilos.pageTitle}>{titulo}</h1>
      {dek ? <p className={estilos.pageDek}>{dek}</p> : null}
    </div>
  );
}
