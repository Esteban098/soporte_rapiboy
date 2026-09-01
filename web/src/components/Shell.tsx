import Link from "next/link";
import { NavLink } from "./NavLink";
import { SignOutButton } from "./SignOutButton";
import { BotonActualizar } from "./BotonActualizar";
import { SeguimientoWidget } from "./SeguimientoWidget";
import type { ModoDatos } from "@/lib/config";
import estilos from "./ui.module.css";

/**
 * Las secciones van agrupadas por para qué se usan, no en una lista corrida:
 * las tres primeras son la cola de trabajo del turno y las dos últimas se miran
 * cuando hay tiempo de analizar. El grupo es la única jerarquía; adentro la
 * navegación es directa, sin submenús.
 */
const GRUPOS = [
  {
    titulo: "Cola de trabajo",
    secciones: [
      { href: "/", etiqueta: "Mes en curso", icono: Calendario },
      { href: "/operacion", etiqueta: "Ayer", icono: Reloj },
      { href: "/demorados", etiqueta: "Demorados", icono: Alerta },
      { href: "/reclamos", etiqueta: "Informacion de tiendas", icono: Barras },
      { href: "/cancelados", etiqueta: "Cancelados", icono: Cruz },
      { href: "/seguimiento", etiqueta: "Seguimiento", icono: Nota },
      { href: "/comercios", etiqueta: "Comercios y zonas", icono: Pin },
    ],
  },
  {
    titulo: "Cuenta",
    /* La entrada está para todos —cualquiera necesita poder cambiar su propia
       contraseña— y cambia de nombre según el rol. Quien no administra ve solo
       su perfil: la lista de los demás no sale del servidor. */
    secciones: [{ href: "/perfiles", etiqueta: null, icono: Persona }],
  },
];

export function Shell({
  children,
  modo,
  usuario,
  hayFlujos,
  esAdmin = false,
}: {
  children: React.ReactNode;
  modo: ModoDatos;
  usuario?: string | null;
  /** Si hay webhooks de n8n cargados. Define qué promete el botón Actualizar. */
  hayFlujos: boolean;
  /** Muestra el grupo de administración. No reemplaza el control de la página. */
  esAdmin?: boolean;
}) {
  return (
    <div className={estilos.app}>
      <nav className={estilos.rail} aria-label="Secciones">
        <div className={estilos.railFijo}>
          <Link href="/" className={estilos.marca}>
            <span className={estilos.marcaSigla} aria-hidden="true">
              MX
            </span>
            <span className={estilos.marcaTexto}>
              <span className={estilos.marcaNombre}>Operación México - Entregas Fallidas.</span>
              <span className={estilos.marcaSub}>Soporte</span>
            </span>
          </Link>

          <div className={estilos.railCuerpo}>
            {GRUPOS.map((grupo) => (
              <div key={grupo.titulo} className={estilos.railGrupo}>
                <p className={estilos.railGrupoTitulo}>{grupo.titulo}</p>
                <ul className={estilos.railLista}>
                  {grupo.secciones.map((seccion) => (
                    <li key={seccion.href}>
                      <NavLink href={seccion.href}>
                        <seccion.icono />
                        {seccion.etiqueta ?? (esAdmin ? "Perfiles" : "Mi perfil")}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {usuario ? (
            <div className={estilos.railPie}>
              <SignOutButton nombre={usuario} />
            </div>
          ) : null}
        </div>
      </nav>

      <div className={estilos.lienzo}>
        <header className={estilos.barra}>
          <span className={estilos.fuente} title={fuenteTitulo(modo)}>
            <span
              className={`${estilos.fuenteDot} ${modo === "fixture" ? estilos.fuenteDotFixture : ""}`}
              aria-hidden="true"
            />
            {ETIQUETA_FUENTE[modo]}
          </span>
          <BotonActualizar hayFlujos={hayFlujos} />
        </header>

        <main className={estilos.main}>{children}</main>

        {/* Se carga en todas las pantallas del tablero: reportar algo casi
            nunca pasa estando parado en la pantalla de reportes. Solo con la
            base activa, porque es lo único que sabe guardar un reporte. */}
        {modo === "supabase" ? <SeguimientoWidget /> : null}
      </div>
    </div>
  );
}

/**
 * De dónde salen los casos, a la vista en la barra. No es un detalle técnico:
 * durante la migración conviven la base y el libro, y mirar un número sin saber
 * cuál de los dos lo produjo es la forma más fácil de sacar una conclusión
 * equivocada.
 */
const ETIQUETA_FUENTE: Record<ModoDatos, string> = {
  supabase: "Base en vivo",
  sheet: "Sheet en vivo",
  fixture: "Datos de prueba",
};

const TITULO_FUENTE: Record<ModoDatos, string> = {
  supabase: "Los casos salen de las tablas de Supabase, que n8n actualiza todos los días",
  sheet: "Los casos salen del Google Sheet",
  fixture: "La app está leyendo los fixtures locales, no la base ni el sheet",
};

function fuenteTitulo(modo: ModoDatos): string {
  return TITULO_FUENTE[modo];
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

/* Iconos de la barra: trazo de 1.5, sin relleno, para que no compitan con el texto. */

function Calendario() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M6 6v7.5" />
    </svg>
  );
}

function Reloj() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2.25 1.5" />
    </svg>
  );
}

function Alerta() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 2.75 14 13H2z" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.2v.05" strokeLinecap="round" />
    </svg>
  );
}

function Barras() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 13.5V9M6.5 13.5V4M10.5 13.5V6.5M14 13.5V2.5" strokeLinecap="round" />
    </svg>
  );
}

function Cruz() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M5.9 5.9l4.2 4.2" strokeLinecap="round" />
    </svg>
  );
}

function Nota() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13.5 9.5a1.5 1.5 0 0 1-1.5 1.5H6l-3 2.5V4A1.5 1.5 0 0 1 4.5 2.5H12A1.5 1.5 0 0 1 13.5 4Z" strokeLinejoin="round" />
      <path d="M6 6h4M6 8h2.5" strokeLinecap="round" />
    </svg>
  );
}

function Persona() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M3 13.5c0-2.2 2.2-3.75 5-3.75s5 1.55 5 3.75" strokeLinecap="round" />
    </svg>
  );
}

function Pin() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 14s5-4.2 5-8a5 5 0 1 0-10 0c0 3.8 5 8 5 8Z" strokeLinejoin="round" />
      <circle cx="8" cy="6" r="1.8" />
    </svg>
  );
}
