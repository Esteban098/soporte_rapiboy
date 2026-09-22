import Image from "next/image";
import Link from "next/link";
import { NavLink } from "./NavLink";
import { NavGrupo } from "./NavGrupo";
import { SignOutButton } from "./SignOutButton";
import { BotonActualizar } from "./BotonActualizar";
import { SeguimientoWidget } from "./SeguimientoWidget";
import { Asistente } from "./Asistente";
import { SelectorTema } from "./SelectorTema";
import { BotonMenu } from "./BotonMenu";
import { CampanaNotificaciones } from "./CampanaNotificaciones";
import { flujosDe, variableDeFlujo, type ClaveFlujo, type ModoDatos } from "@/lib/config";
import { esComercial, inicioDe, puedeVerRuta, type RolPerfil } from "@/lib/permisos";
import estilos from "./ui.module.css";
/* El mismo archivo que Next sirve como ícono de la pestaña: una sola copia del logo. */
import logo from "@/app/icon.png";

/**
 * Las secciones van agrupadas por para qué se usan, no en una lista corrida.
 *
 * «Cola de trabajo» es lo del turno: todo ahí mira el mes en curso o el día.
 * «Siniestrados» y «Colectas» son procesos con vida propia, cada uno con su
 * pantalla de trabajo y su historial. «Historial» junta los meses cerrados de
 * la cola, que se consultan cuando hay tiempo de analizar y no en medio de la
 * operación. El grupo es la única jerarquía; adentro la navegación es directa,
 * sin submenús.
 *
 * Seguimiento, Cobertura y Cuentas van sueltas, sin grupo. No pertenecen a
 * una cola ni a un período: se entra a reportar algo, a preguntar si un
 * domicilio entra o a tocar la propia cuenta, viniendo de cualquier
 * pantalla. Meterlas en un grupo plegable las escondía detrás de
 * un clic, y un grupo con una sola sección adentro es un rodeo.
 */
type Seccion = {
  href: string;
  /** `null` en las que cambian de nombre según el rol. */
  etiqueta: string | null;
  icono: () => React.ReactElement;
  /** Para las rutas que son prefijo de otra hermana. */
  exacto?: boolean;
  destacado?: boolean;
  beta?: boolean;
};

type Grupo = { titulo: string; icono: () => React.ReactElement; secciones: Seccion[] };

const NAVEGACION: (Grupo | Seccion)[] = [
  {
    titulo: "Cola de trabajo",
    icono: Reloj,
    secciones: [
      { href: "/", etiqueta: "Mes en curso", icono: Calendario },
      { href: "/operacion", etiqueta: "Ayer", icono: Reloj },
      { href: "/demorados", etiqueta: "Demorados", icono: Alerta },
      { href: "/reclamos", etiqueta: "Informacion de tiendas", icono: Barras },
      { href: "/cancelados", etiqueta: "Cancelados", icono: Cruz },
    ],
  },
  {
    titulo: "Siniestrados",
    icono: Alerta,
    secciones: [
      /* `exacto` porque /siniestrados es prefijo de /siniestrados/historial: sin
         eso las dos entradas se encienden a la vez estando en la de abajo. */
      { href: "/siniestrados", etiqueta: "Siniestrados", icono: Alerta, exacto: true },
      { href: "/siniestrados/historial", etiqueta: "Historial", icono: Archivo },
    ],
  },

  { href: "/seguimiento", etiqueta: "Seguimiento", icono: Nota, destacado: true },
  { href: "/cobertura", etiqueta: "Cobertura", icono: Mapa, beta: true },
  /* Suelta y no en «Cola de trabajo»: no mira el mes ni el día de ayer, mira
     lo que está pasando ahora. Se entra a ver dónde está alguien, viniendo de
     cualquier pantalla, igual que a Cobertura. */
  { href: "/live-tracker", etiqueta: "Live tracker", icono: Moto },

  {
    titulo: "Directorio",
    icono: Persona,
    secciones: [
      { href: "/sellers", etiqueta: "Sellers", icono: Local },
      { href: "/drivers", etiqueta: "Drivers", icono: Moto },
    ],
  },

  {
    titulo: "Colectas",
    icono: Camion,
    secciones: [
      /* Mismo motivo que arriba: /colectas es prefijo de /colectas/historial. */
      { href: "/colectas", etiqueta: "Asignación", icono: Persona, exacto: true },
      { href: "/colectas/historial", etiqueta: "Historial", icono: Calendario, beta: true },
      /* Dentro de Colectas porque es donde se consulta: dónde queda el
         comercio que hay que retirar y de quién es. La ruta sigue siendo
         /tiendas, así no cambian los permisos del rol comercial ni los
         enlaces guardados. */
      { href: "/tiendas", etiqueta: "Tiendas", icono: Local },
    ],
  },
  {
    titulo: "Historial",
    icono: Archivo,
    secciones: [
      { href: "/historico", etiqueta: "Históricos Casos", icono: Archivo },
      { href: "/cancelados-historico", etiqueta: "Históricos Cancelados", icono: Archivo },
    ],
  },

  /* Cambia de nombre según el rol: quien administra ve «Perfiles» y el resto,
     «Mi perfil». La entrada está para todos porque cualquiera necesita poder
     cambiar su propia contraseña. */
  { href: "/perfiles", etiqueta: null, icono: Persona },
];

function esGrupo(entrada: Grupo | Seccion): entrada is Grupo {
  return "secciones" in entrada;
}

/**
 * El menú de un rol: sin las secciones que no puede abrir y sin los grupos que
 * quedan vacíos. Es la misma regla del proxy, así que el menú nunca ofrece una
 * pantalla que después rebota.
 */
function navegacionDe(rol: RolPerfil | null): (Grupo | Seccion)[] {
  return NAVEGACION.map((entrada) =>
    esGrupo(entrada)
      ? { ...entrada, secciones: entrada.secciones.filter((s) => puedeVerRuta(rol, s.href)) }
      : entrada,
  ).filter((entrada) =>
    esGrupo(entrada) ? entrada.secciones.length > 0 : puedeVerRuta(rol, entrada.href),
  );
}

export function Shell({
  children,
  modo,
  usuario,
  esAdmin = false,
  rol = null,
}: {
  children: React.ReactNode;
  modo: ModoDatos;
  usuario?: string | null;
  /** Muestra el grupo de administración. No reemplaza el control de la página. */
  esAdmin?: boolean;
  /** Recorta el menú a lo que ese rol puede abrir. No reemplaza el proxy. */
  rol?: RolPerfil | null;
}) {
  // Un comercial no tiene reportes ni menciones: la campana y el widget de
  // seguimiento llaman a acciones que para él están cerradas.
  const conSeguimiento = modo === "supabase" && !esComercial(rol);

  return (
    <div className={estilos.app}>
      <nav className={estilos.rail} aria-label="Secciones">
        <div className={estilos.railFijo}>
          <Link href={inicioDe(rol)} className={estilos.marca}>
            <span className={estilos.marcaSigla}>
              <Image src={logo} alt="Rapiboy" width={28} height={28} priority />
            </span>
            <span className={estilos.marcaTexto} data-rail-texto>
              <span className={estilos.marcaNombre}>Operación México - Entregas Fallidas.</span>
              <span className={estilos.marcaSub}>Soporte</span>
            </span>
          </Link>

          <div className={estilos.railCuerpo}>
            {navegacionDe(rol).map((entrada) =>
              esGrupo(entrada) ? (
                <NavGrupo
                  key={entrada.titulo}
                  titulo={entrada.titulo}
                  rutas={entrada.secciones.map(({ href, exacto }) => ({ href, exacto }))}
                  icono={<entrada.icono />}
                >
                  {entrada.secciones.map((seccion) => (
                    <li key={seccion.href}>
                      <Enlace seccion={seccion} esAdmin={esAdmin} />
                    </li>
                  ))}
                </NavGrupo>
              ) : (
                /* Sin cabecera de grupo y sin la indentación que aplica
                   `.railGrupo .railLista`, así queda al nivel de los grupos y
                   no adentro de ninguno. */
                <ul key={entrada.href} className={`${estilos.railLista} ${estilos.railSuelta}`}>
                  <li>
                    <Enlace seccion={entrada} esAdmin={esAdmin} />
                  </li>
                </ul>
              ),
            )}
          </div>

          <div className={estilos.railPie}>
            <BotonMenu />
            {usuario ? <SignOutButton nombre={usuario} /> : null}
          </div>
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
          {/* Las notificaciones viven en Supabase; con otra fuente no hay campana. */}
          {conSeguimiento ? <CampanaNotificaciones /> : null}
          <SelectorTema />
        </header>

        <main className={estilos.main}>{children}</main>

        {/* Se carga en todas las pantallas del tablero: reportar algo casi
            nunca pasa estando parado en la pantalla de reportes. Solo con la
            base activa, porque es lo único que sabe guardar un reporte. */}
        {conSeguimiento ? <SeguimientoWidget /> : null}
        {/* El asistente consulta lo mismo que ven admin y operador; al
            comercial no le corresponde, igual que Seguimiento. */}
        {conSeguimiento ? <Asistente /> : null}
      </div>
    </div>
  );
}

function Enlace({ seccion, esAdmin }: { seccion: Seccion; esAdmin: boolean }) {
  const etiqueta = seccion.etiqueta ?? (esAdmin ? "Perfiles" : "Mi perfil");
  return (
    <NavLink href={seccion.href} exacto={seccion.exacto} destacado={seccion.destacado} titulo={etiqueta}>
      <seccion.icono />
      {/* `data-rail-texto`: lo que desaparece con el menú plegado. */}
      <span data-rail-texto>{etiqueta}</span>
      {seccion.beta ? <span className={estilos.railBeta} aria-label="Beta">BETA</span> : null}
    </NavLink>
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

/** Contorno cerrado con un punto adentro: el área donde hay servicio. */
function Mapa() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 5.2 6 3.2l4 2 3.5-2v7.6l-3.5 2-4-2-3.5 2Z" strokeLinejoin="round" />
      <path d="M6 3.2v7.6M10 5.2v7.6" />
    </svg>
  );
}

/** Toldo de local a la calle: dónde queda cada comercio. */
function Local() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 6.2 3.2 2.8h9.6L14 6.2" strokeLinejoin="round" />
      <path d="M2 6.2a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" strokeLinejoin="round" />
      <path d="M3 8v5.2h10V8" strokeLinejoin="round" />
      <path d="M6.4 13.2V9.6h3.2v3.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Moto de reparto: lo que se está siguiendo en vivo. */
function Moto() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="4" cy="11.5" r="2.4" />
      <circle cx="12" cy="11.5" r="2.4" />
      <path d="M4 11.5h2.6l2-3.4h2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.6 6.2h2l1.4 5.3" strokeLinecap="round" strokeLinejoin="round" />
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
