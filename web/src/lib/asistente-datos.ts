import "server-only";
import {
  asignacionParaModelo,
  booleano,
  canceladoParaModelo,
  colectaParaModelo,
  contarPor,
  contiene,
  cruzarEstados,
  diaLegible,
  diaValido,
  historialParaModelo,
  idValido,
  limite,
  mesValido,
  momentoLegible,
  normalizar,
  paqueteEnRutaParaModelo,
  pedidoParaModelo,
  recortar,
  repartidorEnListaParaModelo,
  repartidorParaModelo,
  reporteParaModelo,
  texto,
  type NombreHerramienta,
} from "./asistente";
import type { Cancelado } from "./cancelados";
import { enlaceViaje } from "./enlaces";
import { cargaPorChofer, diasDisponibles, resumirAsignaciones, resumirDia } from "./colectas";
import {
  TABLA_ASISTENCIA_CONTACTOS,
  TABLA_ASISTENCIA_VOTOS,
  TABLA_AYER,
  TABLA_CANCELADOS,
  TABLA_CANCELADOS_HISTORICO,
  TABLA_COLECTAS,
  TABLA_COLECTAS_ASIGNACION,
  TABLA_COLECTAS_VIVO,
  TABLA_COLECTAS_VIVO_DRIVERS,
  TABLA_COLECTAS_VIVO_POSICIONES,
  TABLA_DRIVERS_ACTIVOS,
  TABLA_MENSUAL,
  TABLA_MENSUAL_HISTORICO,
  TABLA_NOTIFICACIONES,
  TABLA_SEGUIMIENTO,
  TABLA_SELLERS_ACTIVOS,
  TABLA_TRACKER_DEMORAS,
  TABLA_TRACKER_DRIVERS,
  TABLA_TRACKER_PAQUETES,
  TABLA_TRACKER_TIENDAS,
  historialViajeConfig,
  modoDatos,
} from "./config";
import {
  cargarAsignaciones,
  cargarAyer,
  cargarCancelados,
  cargarCanceladosHistoricos,
  cargarColectas,
  cargarPedidos,
  cargarPedidosHistoricos,
  cargarSeguimientos,
} from "./datos";
import { cierre, demorados, porEstado, resumen } from "./metricas";
import type { Pedido } from "./normalizar";
import { mesEnCurso } from "./periodos";
import { etapaDe } from "./seguimiento";
import { consultarFresco, TablaFaltante } from "./supabase";
import type { DriverFila, PaqueteFila } from "./tracker";
import { leerTracker } from "./tracker-datos";

/**
 * Ejecuta una herramienta del asistente contra los datos del tablero.
 *
 * Lee con las mismas funciones que las pantallas —y con su caché—, así que el
 * chat y el tablero no pueden contestar distinto la misma pregunta. Nunca
 * escribe.
 *
 * No tira: un error vuelve como `{ error }` para que el modelo lo cuente en vez
 * de cortar la conversación. «No corriste la migración» sigue siendo distinto
 * de «no hay datos», igual que en las pantallas.
 */
export async function ejecutarHerramienta(
  nombre: NombreHerramienta,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    switch (nombre) {
      case "buscar_paquete":
        return await buscarPaquete(args);
      case "historial_viaje": {
        const id = idValido(texto(args, "id"));
        return id ? await historialViaje(id) : { error: "El ID de viaje tiene que ser un número." };
      }
      case "buscar_casos":
        return await buscarCasos(args);
      case "metricas_mes":
        return await metricasMes(args);
      case "reportes_seguimiento":
        return await reportesSeguimiento(args);
      case "repartidor_en_vivo":
        return await repartidorEnVivo(args);
      case "asignacion_colectas":
        return await asignacionColectas(args);
      case "colectas_realizadas":
        return await colectasRealizadas(args);
      case "consultar_datos":
        return await consultarDatos(args);
    }
  } catch (error) {
    if (error instanceof TablaFaltante) {
      return { error: `La tabla "${error.tabla}" todavía no existe en la base: falta correr su migración.` };
    }
    console.error(`[asistente] Falló la herramienta ${nombre}:`, error);
    return { error: "No se pudo leer la base en este momento." };
  }
}

/* ---------------------------------------------------------------------------
   buscar_paquete
   --------------------------------------------------------------------------- */

/** Movimientos que trae `buscar_paquete`; el historial entero es `historial_viaje`. */
const MOVIMIENTOS_EN_BUSQUEDA = 15;

/**
 * Un paquete, primero en el sistema y después en el tablero.
 *
 * El sistema (flujo 11 de n8n contra RapiboyData) es la fuente del estado
 * actual y de la historia del viaje. El tablero aporta lo que no existe en el
 * sistema: el caso de entrega fallida, el siniestro y su cobro, el reclamo y
 * el aviso de la tienda, los reportes de seguimiento, la cancelación y la ruta
 * del día. Todo se pide en paralelo: el tablero no espera al sistema.
 */
async function buscarPaquete(args: Record<string, unknown>) {
  const id = idValido(texto(args, "id"));
  if (!id) return { error: "El ID de viaje tiene que ser un número." };
  const numero = Number(id);

  const [sistema, mensual, historico, ayer, cancelados, canceladosHistoricos, seguimiento, enRuta] =
    await Promise.all([
      historialViaje(id, MOVIMIENTOS_EN_BUSQUEDA),
      cargarPedidos(),
      cargarPedidosHistoricos(),
      cargarAyer(),
      cargarCancelados(),
      cargarCanceladosHistoricos(),
      cargarSeguimientos(),
      paqueteEnRuta(numero),
    ]);

  // Mensual e Histórico pueden compartir un id sin que sea un error: son
  // ventanas distintas. Manda el operativo, que es el que se sigue trabajando.
  const enMensual = mensual.pedidos.find((p) => p.id === numero);
  const enHistorico = historico.pedidos.find((p) => p.id === numero);
  const caso = enMensual ?? enHistorico;
  const cancelado =
    cancelados.find((c) => c.id === numero) ?? canceladosHistoricos.find((c) => c.id === numero);
  const reportes = seguimiento.reportes.filter((r) => r.casoId === id);

  const enTablero = Boolean(caso || cancelado || enRuta || reportes.length);
  const estadoSistema = "encontrado" in sistema && sistema.encontrado ? (sistema.estado_actual ?? null) : null;
  const estadoTablero = caso?.estado || cancelado?.estadoRbp || enRuta?.estado || null;

  return {
    id: numero,
    sistema,
    tablero: {
      encontrado: enTablero,
      caso_entrega_fallida: caso
        ? { ...pedidoParaModelo(caso), ventana: enMensual ? "mes en curso" : "histórico" }
        : null,
      // Ayer comparte ids con Mensual a propósito: es la cola de lo nuevo, no un duplicado.
      entro_ayer: ayer.pedidos.some((p) => p.id === numero),
      cancelado: cancelado ? canceladoParaModelo(cancelado) : null,
      en_ruta: enRuta,
      reportes_seguimiento: reportes.map(reporteParaModelo),
    },
    cruce: cruzarEstados(estadoSistema, estadoTablero),
    enlace_rapiboy: enlaceViaje(numero),
  };
}

/** El paquete en la jornada del tracker, con el nombre de su repartidor. */
async function paqueteEnRuta(id: number) {
  if (modoDatos() !== "supabase") return null;
  try {
    const [paquete] = await consultarFresco<PaqueteFila>(TABLA_TRACKER_PAQUETES, {
      id_viaje: `eq.${id}`,
      limit: "1",
    });
    if (!paquete) return null;

    const [driver] = paquete.id_motoboy
      ? await consultarFresco<Pick<DriverFila, "nombre" | "apellido">>(TABLA_TRACKER_DRIVERS, {
          select: "nombre,apellido",
          id_motoboy: `eq.${paquete.id_motoboy}`,
          limit: "1",
        })
      : [];
    const repartidor = [driver?.nombre, driver?.apellido].filter(Boolean).join(" ") || null;

    return { ...paqueteEnRutaParaModelo(paquete), repartidor };
  } catch (error) {
    // Sin el tracker instalado, el resto de la búsqueda sirve igual.
    if (error instanceof TablaFaltante) return null;
    throw error;
  }
}

/* ---------------------------------------------------------------------------
   historial_viaje: flujo 11 de n8n
   --------------------------------------------------------------------------- */

/** El flujo es una sola consulta de solo lectura; si tarda más, algo anda mal. */
const TIMEOUT_HISTORIAL_MS = 30_000;

/**
 * El encabezado que espera la credencial Header Auth del webhook en n8n. Es
 * su campo «Name»: si no coincide letra por letra, n8n responde 403 con
 * «Authorization data is wrong!» aunque el valor sea el correcto.
 */
const ENCABEZADO_TOKEN_HISTORIAL = "ChatBot-Rapiboy-Token";

/**
 * Le pide a n8n el historial de un viaje en RapiboyData.
 *
 * La web no habla con SQL Server: igual que en el resto del tablero, quien
 * consulta el sistema es n8n. El flujo solo lee y devuelve el resultado en la
 * misma respuesta (`Response Mode: Last Node`).
 */
async function historialViaje(id: string, maxMovimientos = 60) {
  const config = historialViajeConfig();
  if (!config) {
    return { error: "La consulta al sistema no está configurada (falta N8N_WEBHOOK_HISTORIAL_VIAJE)." };
  }

  try {
    const respuesta = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { [ENCABEZADO_TOKEN_HISTORIAL]: config.token } : {}),
      },
      body: JSON.stringify({ origen: "asistente", id }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_HISTORIAL_MS),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      console.error(`[asistente] El flujo de historial respondió ${respuesta.status}:`, detalle.slice(0, 300));
      return {
        error:
          respuesta.status === 404
            ? "El flujo de historial no está activo en n8n."
            : respuesta.status === 401 || respuesta.status === 403
              ? "n8n rechazó el token del flujo de historial."
              : "El sistema de Rapiboy no respondió bien.",
      };
    }
    return historialParaModelo(await respuesta.json(), maxMovimientos);
  } catch (error) {
    console.error("[asistente] No se pudo consultar el historial:", error);
    return { error: "No se pudo consultar el sistema de Rapiboy en este momento." };
  }
}

/** Valida el estado vigente en RapiboyData antes de editar datos sensibles. */
export async function estadoActualDelSistema(id: number): Promise<
  { ok: true; estado: string } | { ok: false; error: string }
> {
  const resultado = await historialViaje(String(id), 0);
  if ("error" in resultado) return { ok: false, error: resultado.error };
  if (!resultado.encontrado || resultado.en_alcance_del_tablero === false) {
    return { ok: false, error: "No se pudo validar el estado del viaje en el sistema." };
  }
  const estado = resultado.estado_actual?.trim() ?? "";
  if (!estado) return { ok: false, error: "El sistema no informó el estado actual del viaje." };
  return { ok: true, estado };
}

/* ---------------------------------------------------------------------------
   buscar_casos
   --------------------------------------------------------------------------- */

const TABLAS_CASOS = ["mensual", "historico", "ayer", "cancelados", "cancelados_historico"] as const;
type TablaCasos = (typeof TABLAS_CASOS)[number];

async function buscarCasos(args: Record<string, unknown>) {
  const tabla = texto(args, "tabla") as TablaCasos | null;
  if (!tabla || !TABLAS_CASOS.includes(tabla)) {
    return { error: `La tabla tiene que ser una de: ${TABLAS_CASOS.join(", ")}.` };
  }
  const mes = mesValido(texto(args, "mes"));
  if (texto(args, "mes") && !mes) return { error: "El mes tiene que tener la forma AAAA-MM." };

  if (tabla === "cancelados" || tabla === "cancelados_historico") {
    const filas = tabla === "cancelados" ? await cargarCancelados() : await cargarCanceladosHistoricos();
    return buscarCancelados(filas, args, mes);
  }

  const { pedidos } =
    tabla === "mensual" ? await cargarPedidos() : tabla === "historico" ? await cargarPedidosHistoricos() : await cargarAyer();

  const estado = texto(args, "estado");
  const tienda = texto(args, "tienda");
  const repartidor = texto(args, "repartidor");
  const poligono = texto(args, "poligono");
  const demora = booleano(args, "solo_demorados") ? new Set(demorados(pedidos).map((p) => p.id)) : null;

  const filtrados = pedidos
    .filter(
      (p) =>
        (!mes || p.mes === mes) &&
        contiene(p.estado, estado) &&
        contiene(p.tienda, tienda) &&
        contiene(p.repartidor, repartidor) &&
        contiene(p.poligono, poligono) &&
        (!booleano(args, "solo_abiertos") || !p.cerrado) &&
        (!booleano(args, "con_datos_tienda") || p.tieneDatosTienda) &&
        (!demora || demora.has(p.id)),
    )
    // Lo que lleva más tiempo quieto primero: es lo que se mira en una cola.
    .sort((a, b) => (a.ultimoMovimiento?.getTime() ?? 0) - (b.ultimoMovimiento?.getTime() ?? 0));

  const agrupar = texto(args, "agrupar_por");
  const muestra = recortar(filtrados, tamanoMuestra(args, agrupar));

  return {
    tabla,
    total: muestra.total,
    abiertos: filtrados.filter((p) => !p.cerrado).length,
    agrupado: agrupar ? contarPor(filtrados, campoDePedido(agrupar)) : undefined,
    filas: muestra.filas.map(pedidoParaModelo),
    recortado: muestra.recortado && muestra.filas.length > 0
      ? `Se muestran ${muestra.filas.length} de ${muestra.total}, los de movimiento más viejo.`
      : undefined,
  };
}

/**
 * Un conteo agrupado sin `limite` explícito no trae filas: la pregunta era
 * «cuántos», y una muestra recortada solo agrega tokens y un aviso de recorte
 * que el modelo termina repitiendo.
 */
function tamanoMuestra(args: Record<string, unknown>, agrupar: string | null): number {
  return agrupar && args.limite === undefined ? 0 : limite(args);
}

function campoDePedido(campo: string): (p: Pedido) => string {
  switch (campo) {
    case "tienda":
      return (p) => p.tienda;
    case "repartidor":
      return (p) => p.repartidor;
    case "poligono":
      return (p) => p.poligono;
    case "mes":
      return (p) => p.mes;
    default:
      return (p) => p.estado;
  }
}

function buscarCancelados(filas: Cancelado[], args: Record<string, unknown>, mes: string | null) {
  const estado = texto(args, "estado");
  const tienda = texto(args, "tienda");

  const filtrados = filas
    .filter(
      (c) =>
        (!mes || c.mes === mes) &&
        contiene(c.tienda, tienda) &&
        (contiene(c.estadoRbp, estado) || contiene(c.estadoMeli, estado)),
    )
    .sort((a, b) => b.dia.localeCompare(a.dia));

  const agrupar = texto(args, "agrupar_por");
  const muestra = recortar(filtrados, tamanoMuestra(args, agrupar));
  const campo =
    agrupar === "tienda"
      ? (c: Cancelado) => c.tienda
      : agrupar === "mes"
        ? (c: Cancelado) => c.mes
        : (c: Cancelado) => c.estadoRbp;

  return {
    tabla: "cancelados",
    total: muestra.total,
    agrupado: agrupar ? contarPor(filtrados, campo) : undefined,
    filas: muestra.filas.map(canceladoParaModelo),
    recortado: muestra.recortado && muestra.filas.length > 0
      ? `Se muestran ${muestra.filas.length} de ${muestra.total}, los más recientes.`
      : undefined,
  };
}

/* ---------------------------------------------------------------------------
   metricas_mes
   --------------------------------------------------------------------------- */

async function metricasMes(args: Record<string, unknown>) {
  const pedido = texto(args, "mes");
  const mes = pedido ? mesValido(pedido) : mesEnCurso();
  if (!mes) return { error: "El mes tiene que tener la forma AAAA-MM." };

  // Un mes está en Mensual o en Histórico, nunca repartido: la rotación lo
  // mueve entero. Se mira primero la tabla operativa.
  const operativos = (await cargarPedidos()).pedidos.filter((p) => p.mes === mes);
  const origen = operativos.length > 0 ? "mensual" : "historico";
  const pedidos =
    operativos.length > 0 ? operativos : (await cargarPedidosHistoricos()).pedidos.filter((p) => p.mes === mes);

  if (pedidos.length === 0) return { mes, casos: 0, nota: "No hay casos cargados para ese mes." };

  const base = resumen(pedidos);
  const estado = cierre(pedidos);
  return {
    mes,
    origen,
    casos: base.casos,
    cerrados: estado.cerrados,
    abiertos: estado.abiertos,
    tasa_cierre_pct: Math.round(estado.tasaCierre * 10) / 10,
    entregados: base.entregados,
    devueltos: base.devoluciones,
    tasa_devolucion_pct: Math.round(base.tasaDevolucion * 10) / 10,
    visitas_promedio: Math.round(base.visitasPromedio * 100) / 100,
    por_estado: porEstado(pedidos).map((fila) => ({
      estado: fila.estado,
      casos: fila.casos,
      cierra_el_caso: fila.cerrado,
    })),
    // La cola de Demorados solo existe sobre la ventana operativa.
    demorados: origen === "mensual" ? demorados(pedidos).length : undefined,
  };
}

/* ---------------------------------------------------------------------------
   reportes_seguimiento
   --------------------------------------------------------------------------- */

async function reportesSeguimiento(args: Record<string, unknown>) {
  const { reportes, sinTabla } = await cargarSeguimientos();
  if (sinTabla) return { error: "La tabla de seguimiento todavía no existe en la base." };

  const etapa = texto(args, "etapa");
  const caso = idValido(texto(args, "caso_id"));
  const persona = texto(args, "persona");
  const buscado = texto(args, "texto");

  const filtrados = reportes.filter(
    (r) =>
      (!etapa || etapaDe(r) === etapa) &&
      (!caso || r.casoId === caso) &&
      (!persona || [r.creadoPor, r.tomadoPor, r.atendidoPor].some((correo) => contiene(correo, persona))) &&
      (!buscado ||
        [r.comentario, r.resumen, r.driver, r.seller].some((campo) => contiene(campo, buscado))),
  );

  const muestra = recortar(filtrados, limite(args));
  return {
    total: muestra.total,
    por_etapa: contarPor(filtrados, etapaDe),
    reportes: muestra.filas.map(reporteParaModelo),
    recortado: muestra.recortado && muestra.filas.length > 0
      ? `Se muestran ${muestra.filas.length} de ${muestra.total}, los más recientes.`
      : undefined,
    nota: reportes.length >= 500 ? "Solo se consultan los 500 reportes más recientes." : undefined,
  };
}

/* ---------------------------------------------------------------------------
   repartidor_en_vivo
   --------------------------------------------------------------------------- */

async function repartidorEnVivo(args: Record<string, unknown>) {
  if (modoDatos() !== "supabase") return { error: "El live tracker solo funciona con la base de Supabase." };

  const datos = await leerTracker();
  const buscado = texto(args, "repartidor");
  const jornada = {
    dia_paquetes: datos.dia,
    dia_posiciones: datos.diaPosiciones,
    solo_pendientes_de_la_jornada_anterior: datos.pendientesAnteriores,
    leido_en: datos.leidoEn,
  };

  if (!buscado) {
    const lista = recortar(
      [...datos.drivers].sort((a, b) => (a.resumen.avance ?? 0) - (b.resumen.avance ?? 0)),
      limite(args),
    );
    return {
      ...jornada,
      repartidores: lista.total,
      paquetes_sin_repartidor: datos.huerfanos.length,
      lista: lista.filas.map(repartidorEnListaParaModelo),
      recortado: lista.recortado ? `Se muestran ${lista.filas.length} de ${lista.total}, los de menor avance.` : undefined,
    };
  }

  const id = idValido(buscado);
  const coincidencias = id
    ? datos.drivers.filter((d) => d.id === Number(id))
    : datos.drivers.filter((d) => normalizar(d.nombre).includes(normalizar(buscado)));

  if (coincidencias.length === 0) {
    return { ...jornada, encontrado: false, nota: "Nadie con ese nombre o id tiene ruta en la jornada visible." };
  }
  // Con varios, no se elige uno a ciegas: igual que el buscador del mapa.
  if (coincidencias.length > 1) {
    return {
      ...jornada,
      encontrado: false,
      nota: "Varios repartidores coinciden; pedí que aclaren cuál.",
      coincidencias: coincidencias.slice(0, 15).map((d) => ({ id: d.id, nombre: d.nombre })),
    };
  }
  return { ...jornada, encontrado: true, repartidor: repartidorParaModelo(coincidencias[0]) };
}

/* ---------------------------------------------------------------------------
   asignacion_colectas y colectas_realizadas
   --------------------------------------------------------------------------- */

async function asignacionColectas(args: Record<string, unknown>) {
  const { filas, sinTabla } = await cargarAsignaciones();
  if (sinTabla) return { error: "Las tablas de colectas todavía no existen en la base (supabase/colectas.sql)." };

  const comercio = texto(args, "comercio");
  const chofer = texto(args, "chofer");
  const soloSinAsignar = booleano(args, "solo_sin_asignar");

  const resumen = resumirAsignaciones(filas);
  const general = {
    comercios: resumen.comercios,
    sin_asignar: resumen.sinAsignar,
    choferes: resumen.choferes,
    lugares_de_retiro: resumen.lugares,
    en_dropoff: resumen.enDropOff,
    actualizado: momentoLegible(resumen.actualizado),
  };

  // Sin filtros, la pregunta es «cómo está repartido»: resumen y carga por chofer.
  if (!comercio && !chofer && !soloSinAsignar) {
    return {
      ...general,
      carga_por_chofer: cargaPorChofer(filas).slice(0, limite(args)),
    };
  }

  const filtrados = filas
    .filter(
      (a) =>
        (contiene(a.seller, comercio) || contiene(a.lugarColecta, comercio)) &&
        (!chofer || (!a.sinAsignar && contiene(a.chofer, chofer))) &&
        (!soloSinAsignar || a.sinAsignar),
    )
    .sort((a, b) => a.seller.localeCompare(b.seller));

  const muestra = recortar(filtrados, limite(args));
  return {
    actualizado: general.actualizado,
    total: muestra.total,
    comercios: muestra.filas.map(asignacionParaModelo),
    recortado: muestra.recortado ? `Se muestran ${muestra.filas.length} de ${muestra.total}.` : undefined,
  };
}

async function colectasRealizadas(args: Record<string, unknown>) {
  const { filas, sinTabla } = await cargarColectas();
  if (sinTabla) return { error: "Las tablas de colectas todavía no existen en la base (supabase/colectas.sql)." };
  if (filas.length === 0) return { total: 0, nota: "No hay colectas cargadas." };

  const pedido = texto(args, "dia");
  const dia = pedido ? diaValido(pedido) : diasDisponibles(filas)[0];
  if (!dia) return { error: "El día tiene que tener la forma AAAA-MM-DD." };

  const comercio = texto(args, "comercio");
  const repartidor = texto(args, "repartidor");
  const estado = texto(args, "estado");

  const delDia = filas.filter((c) => c.fecha === dia);
  const filtrados = delDia.filter(
    (c) =>
      contiene(c.seller, comercio) &&
      contiene(c.repartidor, repartidor) &&
      (!estado || c.estado === estado),
  );

  const resumen = resumirDia(filtrados);
  const muestra = recortar(filtrados, limite(args));
  return {
    dia: diaLegible(dia),
    colectas: resumen.colectas,
    comercios: resumen.sellers,
    repartidores: resumen.repartidores,
    sin_repartidor: resumen.sinRepartidor,
    pendientes: resumen.pendientes,
    canceladas: resumen.canceladas,
    incompletas: resumen.incompletas,
    paquetes_pedidos: resumen.paquetesSolicitados,
    paquetes_colectados: resumen.paquetesColectados,
    detalle: muestra.filas.map(colectaParaModelo),
    recortado: muestra.recortado ? `Se muestran ${muestra.filas.length} de ${muestra.total}.` : undefined,
    nota: delDia.length === 0 ? "No hay colectas cargadas ese día (la tabla guarda los últimos 30 días)." : undefined,
  };
}

/* ---------------------------------------------------------------------------
   consultar_datos
   --------------------------------------------------------------------------- */

const FUENTES_DATOS = {
  mensual: TABLA_MENSUAL,
  mensual_historico: TABLA_MENSUAL_HISTORICO,
  ayer: TABLA_AYER,
  cancelados: TABLA_CANCELADOS,
  cancelados_historico: TABLA_CANCELADOS_HISTORICO,
  seguimiento: TABLA_SEGUIMIENTO,
  colectas: TABLA_COLECTAS,
  colectas_asignacion: TABLA_COLECTAS_ASIGNACION,
  colectas_vivo: TABLA_COLECTAS_VIVO,
  colectas_vivo_drivers: TABLA_COLECTAS_VIVO_DRIVERS,
  colectas_vivo_posiciones: TABLA_COLECTAS_VIVO_POSICIONES,
  asistencia_votos: TABLA_ASISTENCIA_VOTOS,
  asistencia_contactos: TABLA_ASISTENCIA_CONTACTOS,
  tracker_drivers: TABLA_TRACKER_DRIVERS,
  tracker_paquetes: TABLA_TRACKER_PAQUETES,
  tracker_demoras: TABLA_TRACKER_DEMORAS,
  tracker_tiendas: TABLA_TRACKER_TIENDAS,
  sellers_activos: TABLA_SELLERS_ACTIVOS,
  drivers_activos: TABLA_DRIVERS_ACTIVOS,
  notificaciones: TABLA_NOTIFICACIONES,
} as const;

type FuenteDatos = keyof typeof FUENTES_DATOS;

const ORDEN_DATOS: Record<FuenteDatos, string> = {
  mensual: "id.desc",
  mensual_historico: "id.desc",
  ayer: "id.desc",
  cancelados: "id.desc",
  cancelados_historico: "id.desc",
  seguimiento: "created_at.desc",
  colectas: "id.desc",
  colectas_asignacion: "id_usuario.asc",
  colectas_vivo: "id_colecta.asc",
  colectas_vivo_drivers: "id_motoboy.asc",
  colectas_vivo_posiciones: "id_motoboy.asc",
  asistencia_votos: "recibido_en.desc",
  asistencia_contactos: "actualizado_en.desc",
  tracker_drivers: "id_motoboy.asc",
  tracker_paquetes: "id_viaje.asc",
  tracker_demoras: "registrado_en.desc",
  tracker_tiendas: "nombre_mapa.asc",
  sellers_activos: "id_usuario.asc",
  drivers_activos: "id_motoboy.asc",
  notificaciones: "created_at.desc",
};

/** Campos que nunca deben viajar al modelo, aunque la tabla los tuviera. */
function esCampoSecreto(campo: string): boolean {
  return /password|secret|clave|api[_-]?key|hash/i.test(campo);
}

function filaParaModelo(fila: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fila).filter(([campo]) => !esCampoSecreto(campo)));
}

async function consultarDatos(args: Record<string, unknown>) {
  const fuente = texto(args, "fuente") as FuenteDatos | null;
  if (!fuente || !(fuente in FUENTES_DATOS)) {
    return { error: `La fuente tiene que ser una de: ${Object.keys(FUENTES_DATOS).join(", ")}.` };
  }
  if (modoDatos() !== "supabase") return { error: "La consulta de datos requiere la base de Supabase." };

  const campo = texto(args, "campo");
  if (campo && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(campo)) {
    return { error: "El campo solo puede contener letras, números y guion bajo." };
  }
  if (campo && esCampoSecreto(campo)) return { error: "Ese campo no está disponible para el asistente." };

  const buscado = texto(args, "valor");
  const paginaPedido = Number(args.pagina);
  const pagina = Number.isFinite(paginaPedido) && paginaPedido >= 1 ? Math.floor(paginaPedido) : 1;
  const tope = limite(args);
  const parametros: Record<string, string> = {
    limit: String(tope),
    offset: String((pagina - 1) * tope),
    order: ORDEN_DATOS[fuente],
  };

  // El nombre de columna está validado arriba y el valor viaja por URLSearchParams.
  // Para columnas numéricas PostgREST no admite ilike; los dígitos se comparan exactos.
  if (campo && buscado) {
    const valor = buscado.replace(/[,*]/g, " ").slice(0, 100);
    parametros[campo] = /^-?\d+(\.\d+)?$/.test(valor) ? `eq.${valor}` : `ilike.*${valor}*`;
  }

  const filas = await consultarFresco<Record<string, unknown>>(FUENTES_DATOS[fuente], parametros);
  const visibles = filas
    .filter((fila) => {
      if (!buscado || campo) return true;
      const termino = normalizar(buscado);
      return Object.entries(fila).some(([clave, valor]) => !esCampoSecreto(clave) && normalizar(String(valor ?? "")).includes(termino));
    })
    .map(filaParaModelo);

  return {
    fuente,
    tabla: FUENTES_DATOS[fuente],
    pagina,
    limite: tope,
    filas: visibles,
    campos: visibles[0] ? Object.keys(visibles[0]) : [],
    recortado: filas.length === tope ? "Puede haber más resultados: pedí otra página o agregá un filtro." : undefined,
    nota: buscado && !campo
      ? "La búsqueda sin columna se hizo sobre esta página; indicá campo para buscar en toda la tabla de forma eficiente."
      : undefined,
  };
}
