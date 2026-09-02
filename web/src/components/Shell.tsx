import Link from "next/link";
import { NavLink } from "./NavLink";
import { NavGrupo } from "./NavGrupo";
import { SignOutButton } from "./SignOutButton";
import { BotonActualizar } from "./BotonActualizar";
import { SeguimientoWidget } from "./SeguimientoWidget";
import { flujosDe, variableDeFlujo, type ClaveFlujo, type ModoDatos } from "@/lib/config";
import estilos from "./ui.module.css";

/**
 * Las secciones van agrupadas por para qué se usan, no en una lista corrida.
 *
 * «Cola de trabajo» es lo del turno: todo ahí mira el mes en curso o el día.
 * «Historial» son los meses cerrados, que se consultan cuando hay tiempo de
 * analizar y no en medio de la operación. El grupo es la única jerarquía;
 * adentro la navegación es directa, sin submenús.
 */
const GRUPOS = [
  {
    titulo: "Cola de trabajo",
    icono: Reloj,
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
    titulo: "Colectas",
    icono: Camion,
    secciones: [
      /* `exacto` porque /colectas es prefijo de /colectas/historial: sin eso las dos
         entradas se encienden a la vez estando en la de abajo. */
      { href: "/colectas", etiqueta: "Asignación", icono: Persona, exacto: true },
      { href: "/colectas/historial", etiqueta: "Historial", icono: Calendario },
    ],
  },
  {
    titulo: "Historial",
    icono: Archivo,
    secciones: [
      { href: "/historico", etiqueta: "Histórico", icono: Archivo },
      { href: "/cancelados-historico", etiqueta: "Cancelados históricos", icono: Archivo },
    ],
  },
  {
    titulo: "Cuenta",
    icono: Persona,
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
  esAdmin = false,
}: {
  children: React.ReactNode;
  modo: ModoDatos;
  usuario?: string | null;
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
              <NavGrupo
                key={grupo.titulo}
                titulo={grupo.titulo}
                rutas={grupo.secciones.map((s) => s.href)}
                icono={<grupo.icono />}
              >
                {grupo.secciones.map((seccion) => (
                  <li key={seccion.href}>
                    <NavLink href={seccion.href} exacto={"exacto" in seccion && seccion.exacto}>
                      <seccion.icono />
                      {seccion.etiqueta ?? (esAdmin ? "Perfiles" : "Mi perfil")}
                    </NavLink>
                  </li>
                ))}
              </NavGrupo>
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
  flujo,
  periodo,
}: {
  eyebrow: string;
  titulo: string;
  dek?: string;
  /**
   * Qué juego de flujos actualiza esta pantalla.
   *
   * El botón vive acá y no en la barra superior porque no todas las pantallas
   * se actualizan igual: la cola del día y el histórico corren flujos
   * distintos, y uno solo arriba obligaba a que dijera lo mismo en las dos.
   * Las pantallas que no dependen de n8n —perfiles, seguimiento— no lo pasan y
   * no lo muestran.
   */
  flujo?: ClaveFlujo;
  /** Meses que se están mirando, para que el flujo pueda acotar la consulta. */
  periodo?: { desde: string; hasta: string };
}) {
  return (
    <div className={estilos.pageHead}>
      <div className={estilos.pageHeadFila}>
        <div className={estilos.pageHeadTexto}>
          <p className={estilos.eyebrow}>{eyebrow}</p>
          <h1 className={estilos.pageTitle}>{titulo}</h1>
        </div>
        {flujo ? (
          <BotonActualizar
            clave={flujo}
            hayFlujos={flujosDe(flujo).length > 0}
            variable={variableDeFlujo(flujo)}
            periodo={periodo}
          />
        ) : null}
      </div>
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

/** Cajas apiladas: lo guardado, por oposición a lo que está sobre la mesa. */
function Archivo() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <rect x="2" y="2.5" width="12" height="3.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.2 6v6.4a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1="6.4" y1="9" x2="9.6" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Camioneta de reparto: lo que pasa a buscar la mercadería al comercio. */
function Camion() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <path d="M1.5 4.5h7.2v6.2H1.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.7 6.9h2.9l2.9 2.4v1.4H8.7z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.6" cy="12.2" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.6" cy="12.2" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
