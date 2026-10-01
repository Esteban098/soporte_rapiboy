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
  /** Para las rutas que son prefijo de otra hermana. */
  exacto?: boolean;
  destacado?: boolean;
  beta?: boolean;
  nuevaVentana?: boolean;
};

type Grupo = { titulo: string; secciones: Seccion[] };

const NAVEGACION: (Grupo | Seccion)[] = [
  {
    titulo: "Cola de trabajo",
    secciones: [
      { href: "/", etiqueta: "Mes en curso" },
      { href: "/operacion", etiqueta: "Última jornada" },
      { href: "/demorados", etiqueta: "Demorados" },
      { href: "/reclamos", etiqueta: "Informacion de tiendas" },
      { href: "/cancelados", etiqueta: "Cancelados" },
    ],
  },
  {
    titulo: "Siniestrados",
    secciones: [
      /* `exacto` porque /siniestrados es prefijo de /siniestrados/historial: sin
         eso las dos entradas se encienden a la vez estando en la de abajo. */
      { href: "/siniestrados", etiqueta: "Siniestrados", exacto: true },
      { href: "/siniestrados/historial", etiqueta: "Historial" },
    ],
  },

  { href: "/seguimiento", etiqueta: "Seguimiento", destacado: true },
  { href: "/cobertura", etiqueta: "Cobertura", beta: true },
  /* Suelta y no en «Cola de trabajo»: no mira el mes ni el día de ayer, mira
     lo que está pasando ahora. Se entra a ver dónde está alguien, viniendo de
     cualquier pantalla, igual que a Cobertura. */
  { href: "/live-tracker", etiqueta: "Live tracker" },

  {
    titulo: "Base de datos",
    secciones: [
      { href: "/sellers", etiqueta: "Sellers" },
      { href: "/drivers", etiqueta: "Drivers" },
    ],
  },

  /* Colectas abre su propio espacio de trabajo. El tablero que quedó atrás se
     conserva abierto para poder contrastar una ruta con la operación general. */
  { href: "/colectas", etiqueta: "Colectas", nuevaVentana: true },
  {
    titulo: "Historial",
    secciones: [
      { href: "/historico", etiqueta: "Históricos Casos" },
      { href: "/cancelados-historico", etiqueta: "Históricos Cancelados" },
    ],
  },

  /* Cambia de nombre según el rol: quien administra ve «Perfiles» y el resto,
     «Mi perfil». La entrada está para todos porque cualquiera necesita poder
     cambiar su propia contraseña. */
  { href: "/perfiles", etiqueta: null },
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
    <NavLink
      href={seccion.href}
      exacto={seccion.exacto}
      destacado={seccion.destacado}
      nuevaVentana={seccion.nuevaVentana}
      titulo={seccion.nuevaVentana ? `${etiqueta} · abrir en una nueva ventana` : etiqueta}
    >
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
