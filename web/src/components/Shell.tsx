import Image from "next/image";
import Link from "next/link";
import { NavLink } from "./NavLink";
import { SignOutButton } from "./SignOutButton";
import { BotonActualizar } from "./BotonActualizar";
import { SeguimientoWidget } from "./SeguimientoWidget";
import { Asistente } from "./Asistente";
import { SelectorTema } from "./SelectorTema";
import { BotonMenu } from "./BotonMenu";
import { CampanaNotificaciones } from "./CampanaNotificaciones";
import { NavegacionHorizontal } from "./NavegacionHorizontal";
import { SECCIONES_PRINCIPALES, type SeccionPrincipal } from "@/lib/navegacion";
import { flujosDe, variableDeFlujo, type ClaveFlujo, type ModoDatos } from "@/lib/config";
import { esComercial, inicioDe, puedeVerRuta, type RolPerfil } from "@/lib/permisos";
import estilos from "./ui.module.css";
/* El mismo archivo que Next sirve como ícono de la pestaña: una sola copia del logo. */
import logo from "@/app/icon.png";

/** Cascarón común de las secciones autenticadas del tablero. */
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
            {SECCIONES_PRINCIPALES.filter((entrada) => puedeVerRuta(rol, entrada.href)).map((entrada) => (
              <ul key={entrada.href} className={`${estilos.railLista} ${estilos.railSuelta}`}>
                <li><Enlace seccion={entrada} esAdmin={esAdmin} /></li>
              </ul>
            ))}
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

        <main className={estilos.main}><NavegacionHorizontal rol={rol} />{children}</main>

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

function Enlace({ seccion, esAdmin }: { seccion: SeccionPrincipal; esAdmin: boolean }) {
  const etiqueta = seccion.etiqueta ?? (esAdmin ? "Perfiles" : "Mi perfil");
  return (
    <NavLink
      href={seccion.href}
      exacto={seccion.exacto}
      destacado={seccion.destacado}
      nuevaVentana={seccion.nuevaVentana}
      rutasActivas={seccion.rutasActivas}
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
