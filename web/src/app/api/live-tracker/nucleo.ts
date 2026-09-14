import "server-only";
import { NextResponse } from "next/server";
import {
  TABLA_TRACKER_DEMORAS,
  TIMEOUT_FLUJO_MS,
  flujosDe,
  variableDeFlujo,
  type ClaveFlujo,
} from "@/lib/config";
import type { Operador } from "@/lib/sesion";
import { insertarFila, TablaFaltante } from "@/lib/supabase";
import { ZONA_OPERACION, diaDePaquetes, estadoDemoraDriver } from "@/lib/tracker";
import { leerTracker } from "@/lib/tracker-datos";

/**
 * El motor de los tres endpoints del live tracker.
 *
 * Está separado de las rutas para poder probarlo. Quién está operando entra
 * como parámetro en vez de resolverse acá adentro: `@/lib/sesion` arrastra
 * next-auth, que no se puede cargar bajo la condición `react-server` con la
 * que corren las pruebas de este proyecto. Invirtiendo la dependencia, la ruta
 * queda como un adaptador de cuatro líneas y toda la lógica —incluido el
 * rechazo sin sesión— se puede ejercitar de verdad.
 *
 * Los dos endpoints hacen exactamente lo mismo con distinto webhook, así que
 * la lógica vive una sola vez: autenticar, disparar el flujo, esperar el
 * resultado de verdad y traducirlo a algo que la pantalla pueda mostrar.
 *
 * Los endpoints de sincronización no tocan la base. Quien escribe esas fotos
 * es n8n, con su credencial de servicio; el tablero solo pide que corra y
 * después vuelve a leer. La única escritura directa de este módulo es el
 * motivo humano de una demora confirmada, en su tabla separada.
 */

export type ResumenSync = {
  ok: boolean;
  tipo: "drivers" | "paquetes";
  /** El día de operación que se reconcilió, en hora de México. */
  dia: string;
  leidos: number;
  insertados: number;
  actualizados: number;
  desactivados: number;
  /** Filas que la consulta trajo pero el flujo no pudo usar. */
  omitidos: number;
  conError: number;
  mensaje: string | null;
};

/** Lo que manda el tablero al webhook. Mismo contrato que el resto de flujos. */
type CuerpoTracker = {
  origen: "tablero";
  momento: string;
  alcance: ClaveFlujo;
  /** El día lo decide la web y no n8n: así los tres relojes no pueden discrepar. */
  dia: string;
  zona: string;
  /** Cuántos días atrás salió ese día. Va para que quede en el log del flujo. */
};

export async function ejecutarSync(
  clave: ClaveFlujo,
  tipo: "drivers" | "paquetes",
  operador: Operador | null,
): Promise<NextResponse> {
  /*
   * El proxy ya redirige a /acceso cualquier ruta sin sesión, así que en la
   * práctica no se llega acá sin permiso. Se comprueba igual porque un
   * endpoint se puede invocar por HTTP directo y porque el matcher del proxy
   * es una línea de configuración: el día que alguien agregue `api` a la
   * exclusión, esto sigue cerrado.
   */
  if (!operador) {
    return NextResponse.json({ ok: false, error: "Sin permiso." }, { status: 401 });
  }

  const flujos = flujosDe(clave);
  if (flujos.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `No hay webhook configurado para esta sincronización. Se carga en ` +
          `${variableDeFlujo(clave)}, con la URL de producción del flujo.`,
      },
      { status: 503 },
    );
  }

  /* Ambos flujos necesitan los repartidores y paquetes de la ruta visible. */
  const dia = diaDePaquetes();
  const cuerpo: CuerpoTracker = {
    origen: "tablero",
    momento: new Date().toISOString(),
    alcance: clave,
    dia,
    zona: ZONA_OPERACION,
  };

  // Un solo webhook por botón. Si alguien carga varios en la variable, se usa
  // el primero: dos corridas del mismo tipo en paralelo chocan contra el lock
  // de la base y la segunda fallaría siempre.
  const url = flujos[0];

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_FLUJO_MS),
    });

    const texto = await respuesta.text().catch(() => "");

    if (!respuesta.ok) {
      /*
       * 409 es el caso esperable, no una falla: alguien más ya está corriendo
       * la misma sincronización. Se distingue del resto para que el botón
       * pueda decir «esperá a que termine» en vez de «falló».
       */
      const yaCorriendo = /lock_not_available|ya hay una sincronización/i.test(texto);
      return NextResponse.json(
        {
          ok: false,
          error: yaCorriendo
            ? "Ya hay una sincronización de este tipo en curso. Esperá a que termine."
            : respuesta.status === 404
              ? "n8n no reconoce el webhook (404). Si el flujo está en modo prueba, hay que activarlo."
              : `El flujo respondió ${respuesta.status}.`,
        },
        { status: yaCorriendo ? 409 : 502 },
      );
    }

    return NextResponse.json(interpretar(texto, tipo, dia));
  } catch (error) {
    const vencido = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        ok: false,
        error: vencido
          ? `El flujo sigue corriendo después de ${Math.round(TIMEOUT_FLUJO_MS / 1000)} s. ` +
            `Los datos que ya estaban se conservan.`
          : "No se pudo contactar al flujo de n8n.",
      },
      { status: vencido ? 504 : 502 },
    );
  }
}

/**
 * Traduce la respuesta del flujo al resumen que muestra la pantalla.
 *
 * Va toda defensiva porque el cuerpo lo arma n8n: si alguien cambia el último
 * nodo, lo peor que puede pasar es que los contadores queden en cero y el
 * botón diga que no sabe cuánto se movió. Lo que no puede pasar es que la
 * pantalla se rompa por un campo que faltó.
 */
function interpretar(texto: string, tipo: "drivers" | "paquetes", dia: string): ResumenSync {
  const vacio: ResumenSync = {
    ok: true,
    tipo,
    dia,
    leidos: 0,
    insertados: 0,
    actualizados: 0,
    desactivados: 0,
    omitidos: 0,
    conError: 0,
    mensaje: null,
  };

  let dato: unknown;
  try {
    dato = JSON.parse(texto);
  } catch {
    return { ...vacio, mensaje: "El flujo corrió pero no devolvió un resumen." };
  }

  // n8n devuelve el último nodo como arreglo de items cuando hay más de uno.
  const fila = (Array.isArray(dato) ? dato[0] : dato) as Record<string, unknown> | null;
  if (!fila || typeof fila !== "object") {
    return { ...vacio, mensaje: "El flujo corrió pero no devolvió un resumen." };
  }

  const entero = (clave: string): number => {
    const valor = Number(fila[clave]);
    return Number.isFinite(valor) ? Math.trunc(valor) : 0;
  };

  const estado = String(fila.estado ?? "");
  const mensajeError = typeof fila.mensaje_error === "string" ? fila.mensaje_error : null;

  return {
    ok: estado !== "failed",
    tipo,
    dia: typeof fila.fecha_operacion === "string" ? fila.fecha_operacion : dia,
    leidos: entero("registros_leidos"),
    insertados: entero("registros_insertados"),
    actualizados: entero("registros_actualizados"),
    desactivados: entero("registros_desactivados"),
    omitidos: entero("registros_omitidos"),
    conError: entero("registros_con_error"),
    mensaje: mensajeError,
  };
}

/* ---------- Lectura de la jornada ---------- */

/**
 * La jornada entera, para que el mapa vuelva a leerla sin recargar la página.
 *
 * Devuelve JSON y no un render nuevo a propósito: refrescar el árbol de
 * servidor remontaría el mapa y con él se irían la selección, el zoom y el
 * encuadre. Reemplazando solo los datos, queda intacto todo lo que el operador
 * puso en pantalla con la mano.
 */
export async function responderJornada(operador: Operador | null): Promise<NextResponse> {
  if (!operador) {
    return NextResponse.json({ ok: false, error: "Sin permiso." }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, datos: await leerTracker() });
  } catch (error) {
    if (error instanceof TablaFaltante) {
      return NextResponse.json(
        { ok: false, error: `Falta la tabla "${error.tabla}". Corré web/supabase/live-tracker.sql.` },
        { status: 503 },
      );
    }

    // El detalle puede traer la consulta entera, y con ella domicilios. Al
    // navegador va el aviso; el detalle queda en el log del servidor.
    console.error("[live-tracker] no se pudo leer la jornada", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer la jornada desde la base." },
      { status: 502 },
    );
  }
}

export type EntradaMotivoDemora = {
  idDriver?: unknown;
  motivo?: unknown;
  confirmaQueNoContinua?: unknown;
};

type DependenciasMotivo = {
  leer: typeof leerTracker;
  insertar: typeof insertarFila;
};

const DEPENDENCIAS_MOTIVO: DependenciasMotivo = {
  leer: leerTracker,
  insertar: insertarFila,
};

/**
 * Registra solamente inconvenientes confirmados que detienen la ruta.
 *
 * El nombre, el día, la última posición y la cantidad pendiente salen de la
 * lectura del servidor: el navegador manda únicamente el id, el texto y la
 * confirmación. Así un cliente modificado no puede inventar a quién pertenece
 * el registro ni silenciar a alguien que ya volvió a moverse.
 */
export async function registrarMotivoDemora(
  operador: Operador | null,
  entrada: EntradaMotivoDemora,
  momento = new Date(),
  dependencias: DependenciasMotivo = DEPENDENCIAS_MOTIVO,
): Promise<NextResponse> {
  if (!operador) {
    return NextResponse.json({ ok: false, error: "Sin permiso." }, { status: 401 });
  }

  const idDriver = Number(entrada.idDriver);
  const motivo = typeof entrada.motivo === "string" ? entrada.motivo.trim() : "";
  if (!Number.isSafeInteger(idDriver) || idDriver <= 0) {
    return NextResponse.json({ ok: false, error: "El driver no es válido." }, { status: 400 });
  }
  if (entrada.confirmaQueNoContinua !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Confirmá que el driver informó un inconveniente y no continuará la ruta.",
      },
      { status: 400 },
    );
  }
  if (motivo.length < 5 || motivo.length > 1000) {
    return NextResponse.json(
      { ok: false, error: "El motivo debe tener entre 5 y 1000 caracteres." },
      { status: 400 },
    );
  }

  try {
    const datos = await dependencias.leer(undefined, momento);
    if (datos.tablasFaltantes.includes(TABLA_TRACKER_DEMORAS)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta instalar web/supabase/migracion-10-tracker-demoras.sql.",
        },
        { status: 503 },
      );
    }

    const driver = datos.drivers.find((candidato) => candidato.id === idDriver);
    if (!driver) {
      return NextResponse.json(
        { ok: false, error: "El driver ya no pertenece a la ruta visible." },
        { status: 404 },
      );
    }

    const demora = estadoDemoraDriver(driver, momento);
    if (!demora.notificar || !driver.fechaUltimoMovimiento) {
      return NextResponse.json(
        { ok: false, error: "La demora ya no está activa. Actualizá el tracker." },
        { status: 409 },
      );
    }

    const error = await dependencias.insertar(TABLA_TRACKER_DEMORAS, {
      fecha_operacion: datos.dia,
      id_motoboy: driver.id,
      nombre_driver: driver.nombre,
      motivo,
      ultima_movimiento_en: driver.fechaUltimoMovimiento,
      paquetes_sin_visitar: demora.paquetesSinVisitar,
      registrado_por: operador.email,
    });
    if (error) {
      const duplicado =
        /ya est[aá] cargado|duplicate key|tracker_demoras_fecha_operacion_id_motoboy_key|23505/i
          .test(error);
      return NextResponse.json(
        {
          ok: false,
          error: duplicado
            ? "Otro usuario ya registró un motivo para este driver. Actualizá el tracker."
            : error,
        },
        { status: duplicado ? 409 : 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[live-tracker] no se pudo registrar el motivo de demora", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo registrar el motivo." },
      { status: 502 },
    );
  }
}
