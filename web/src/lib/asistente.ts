/**
 * Asistente del tablero: lo que no depende del servidor.
 *
 * El modelo no ve la base. Ve cinco herramientas de solo lectura, cada una
 * apoyada en las mismas funciones que usan las pantallas, así que contesta con
 * las reglas del tablero —qué es un caso cerrado, a qué mes pertenece, qué es
 * un demorado— y no con las que se le ocurran. Dejarlo escribir SQL sería
 * darle la base sin esas reglas: contestaría números distintos a los de la
 * pantalla, y con total seguridad.
 *
 * Este módulo es puro a propósito: define las herramientas, los filtros y qué
 * sale de cada fila, y se prueba sin red (`npm run test:asistente`). La
 * ejecución contra la base vive en `asistente-datos.ts` y la conversación con
 * OpenAI en `asistente-chat.ts`.
 */

import type { Cancelado } from "./cancelados";
import type { Asignacion, Colecta } from "./colectas";
import { enlaceFotoEntrega, enlaceViaje } from "./enlaces";
import type { Pedido } from "./normalizar";
import { etapaDe, nombreDePersona, type EtapaSeguimiento, type Seguimiento } from "./seguimiento";
import { esSiniestrado } from "./siniestrados";
import type { PaqueteFila } from "./tracker";
import type { DriverDelTracker } from "./tracker-datos";

/* ---------------------------------------------------------------------------
   Conversación
   --------------------------------------------------------------------------- */

export type RolMensaje = "usuario" | "asistente";
export type MensajeChat = { rol: RolMensaje; texto: string };

/** Cuánto del ida y vuelta viaja en cada pregunta. Más es más caro, no mejor. */
export const MAX_MENSAJES = 12;
export const MAX_TEXTO = 2000;

/**
 * El historial llega del navegador: se valida la forma y se recorta.
 *
 * Solo viajan textos de usuario y asistente. Los resultados de herramientas de
 * preguntas anteriores no se reenvían: son la parte pesada de cada vuelta, y si
 * la pregunta nueva los necesita, el modelo los vuelve a pedir.
 */
export function validarHistorial(entrada: unknown): MensajeChat[] | null {
  if (!Array.isArray(entrada) || entrada.length === 0) return null;

  const mensajes: MensajeChat[] = [];
  for (const item of entrada) {
    if (!item || typeof item !== "object") return null;
    const { rol, texto } = item as Record<string, unknown>;
    if (rol !== "usuario" && rol !== "asistente") return null;
    if (typeof texto !== "string") return null;
    const limpio = texto.trim();
    if (!limpio) continue;
    mensajes.push({ rol, texto: limpio.slice(0, MAX_TEXTO) });
  }

  const recientes = mensajes.slice(-MAX_MENSAJES);
  // La última palabra tiene que ser una pregunta: si no, no hay nada que responder.
  if (recientes.at(-1)?.rol !== "usuario") return null;
  return recientes;
}

/* ---------------------------------------------------------------------------
   Instrucciones
   --------------------------------------------------------------------------- */

/** Hoy en Ciudad de México, como `2026-09-21`. */
export function hoyEnMexico(momento = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(momento);
}

export function instrucciones(momento = new Date()): string {
  const hoy = hoyEnMexico(momento);
  return [
    "Sos el asistente del tablero de soporte de Rapiboy México: entregas fallidas, cancelaciones,",
    "reclamos de tiendas, reportes de seguimiento, colectas y el live tracker de repartidores.",
    `Hoy es ${hoy} en Ciudad de México y el mes en curso es ${hoy.slice(0, 7)}.`,
    "",
    "Reglas:",
    "- Respondé solo con lo que devuelvan las herramientas. Si un dato no está, decilo. Nunca inventes",
    "  IDs, estados, nombres ni cifras, y no completes con suposiciones.",
    "- Un caso está cerrado cuando su estado es Entregado, Devuelto o Siniestrado. «Devolucion» sigue",
    "  abierto: la devolución está en curso.",
    "- El último movimiento es la fecha del último cambio de estado, no una fecha de entrega prometida.",
    "- El identificador de un paquete es el ID de viaje (Viaje.Id), un número de 7 a 9 dígitos.",
    "- La posición de un repartidor es siempre la «última posición conocida»: decí hace cuánto es.",
    "- Si una herramienta avisa que recortó resultados y estás listando casos, decilo y da el total",
    "  real. Si la pregunta es de cantidades, contestá con los conteos y no menciones las filas de muestra.",
    "- Si piden un listado largo, resumí y sugerí la pantalla del tablero donde verlo completo.",
    "- Sos de solo lectura: no podés modificar casos, reportes, avisos ni cobros. Si te lo piden,",
    "  explicá en qué pantalla se hace.",
    "- No tenés teléfonos ni domicilios de clientes: están en la ficha del caso en el tablero.",
    "- buscar_paquete consulta primero el sistema de Rapiboy (RapiboyData) y lo cruza con el tablero:",
    "  - `sistema` manda para el estado actual, la tienda, la zona y los movimientos.",
    "  - `tablero` es lo que trabajó el equipo: caso de entrega fallida, siniestro y cobro, reclamo y",
    "    aviso de la tienda, reportes de seguimiento, cancelación y ruta del día.",
    "  - `cruce` dice si los dos estados coinciden. Si no, contá el del sistema como el actual y aclaralo",
    "    dentro del resumen («el tablero todavía no se actualizó»), no como un punto aparte.",
    "  - Si el caso está siniestrado, decí siempre si ya está cobrado y el valor al 70%.",
    "  - Si no está en el tablero, explicá por qué: fuera de alcance (otra localidad o modalidad) o,",
    "    si está en alcance, que nunca fue una entrega fallida.",
    "  - Si el sistema no respondió, contestá con el tablero y aclaralo.",
    "  Para más movimientos que los que trae, usá historial_viaje.",
    "- Colectas: la asignación dice qué chofer colecta habitualmente cada comercio (el que más fue en",
    "  30 días), no una orden. Lo que pasó un día puntual está en colectas_realizadas: un comercio",
    "  puede tener un chofer asignado y que ese día haya ido otro.",
    "",
    "Cómo escribir:",
    "- Hablá como un compañero del equipo que ya miró el caso. Empezá con un resumen claro de 1 a 3",
    "  oraciones con lo importante: qué pasó, dónde está y qué falta. Después, solo si suma, una lista",
    "  corta de detalles con «- ».",
    "- Nunca muestres nombres de campos, JSON, valores true/false/null, IDs internos de reportes ni",
    "  fechas en formato técnico. Traducí a lenguaje simple: «no hay visita registrada», «ya lo tomó",
    "  Esteban», «lo cargó Candelaria el 17 sep». Las fechas ya vienen legibles: usalas tal cual.",
    "- Para las personas usá el nombre, no el correo: esteban@rapiboy.com es «Esteban».",
    "- No enumeres datos que faltan ni cuentes cómo buscaste, salvo que lo pregunten.",
    "- Si los datos se contradicen (por ejemplo, entregado pero sin visita registrada), señalalo en",
    "  una oración simple.",
    "- Enlaces: cuando la herramienta los traiga, cerrá con ellos en formato [texto](url), cada uno en",
    "  su línea: [Ver reporte](enlace del reporte), [Ver evidencia](enlace_evidencia) y",
    "  [Abrir en Rapiboy](enlace_rapiboy). Usá solo URLs que devolvió una herramienta; nunca inventes una.",
    "- Respondé en español. **Negrita** solo para el dato clave. No uses tablas, encabezados ni",
    "  etiquetas como «Resumen:». La lista de detalles tiene como mucho 4 puntos y no repite lo que ya",
    "  dijo el resumen. Nada de paréntesis técnicos como «(visitado: no)».",
    "",
    "Ejemplo del tono buscado, para un paquete:",
    "El 30543375 figura **Entregado** en la ruta del 11 sep de Valentina Marina Moncada, pero no tiene",
    "visita registrada y hay un reporte abierto que pide recuperarlo: conviene revisarlo.",
    "- Tienda: SPG Online · Zona: MX Atizapan Centro",
    "- Reporte: lo cargó Candelaria el 17 sep y lo tomó Esteban. «Josue comenta que pasarían hoy a recuperar».",
    "[Ver reporte](/seguimiento?reporte=...)",
    "[Ver evidencia](https://files.rapiboy.com/...)",
    "[Abrir en Rapiboy](https://rapiboy.com/Operador?...)",
  ].join("\n");
}

/* ---------------------------------------------------------------------------
   Herramientas
   --------------------------------------------------------------------------- */

export const NOMBRES_HERRAMIENTAS = [
  "buscar_paquete",
  "historial_viaje",
  "buscar_casos",
  "metricas_mes",
  "reportes_seguimiento",
  "repartidor_en_vivo",
  "asignacion_colectas",
  "colectas_realizadas",
] as const;

export type NombreHerramienta = (typeof NOMBRES_HERRAMIENTAS)[number];

export function esHerramienta(nombre: string): nombre is NombreHerramienta {
  return (NOMBRES_HERRAMIENTAS as readonly string[]).includes(nombre);
}

/** Lo máximo que devuelve una herramienta por pedido, pida lo que pida el modelo. */
export const TOPE_FILAS = 50;
export const FILAS_POR_DEFECTO = 20;

const MES = { type: "string", description: "Mes como AAAA-MM. Si se omite, el mes en curso." };
const LIMITE = {
  type: "integer",
  description: `Cuántas filas devolver (máximo ${TOPE_FILAS}, por defecto ${FILAS_POR_DEFECTO}).`,
};

/** Definiciones en el formato de function calling de OpenAI. */
export const HERRAMIENTAS = [
  {
    type: "function",
    function: {
      name: "buscar_paquete",
      description:
        "Consulta un paquete por su ID de viaje: primero en el sistema de Rapiboy (estado actual, tienda, " +
        "zona y últimos movimientos) y después lo cruza con el tablero: caso de entrega fallida, siniestro " +
        "y cobro, reclamo y aviso de la tienda, reportes de seguimiento, cancelación y ruta del día. " +
        "Es la herramienta para cualquier pregunta sobre un paquete puntual.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "ID de viaje, solo dígitos." } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "historial_viaje",
      description:
        "Historial completo de un viaje en el sistema de Rapiboy: hasta 60 cambios de estado con fecha, " +
        "repartidor y si hubo visita. buscar_paquete ya trae los últimos movimientos; usá esta solo si " +
        "piden el historial entero.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "ID de viaje, solo dígitos." } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_casos",
      description:
        "Busca y cuenta casos de entregas fallidas o cancelaciones con filtros. Devuelve el total, conteos " +
        "agrupados y una muestra de filas. Para preguntas de «cuántos» usá `agrupar_por` en vez de pedir filas.",
      parameters: {
        type: "object",
        properties: {
          tabla: {
            type: "string",
            enum: ["mensual", "historico", "ayer", "cancelados", "cancelados_historico"],
            description:
              "mensual: período operativo (mes en curso, y del 1 al 9 también el anterior). historico: meses " +
              "cerrados. ayer: casos nuevos de la última jornada. cancelados: cancelaciones del mismo día de la colecta.",
          },
          mes: { ...MES, description: "Mes como AAAA-MM. Si se omite, todos los de la tabla." },
          estado: { type: "string", description: "Estado exacto o parcial, por ejemplo «Devuelto»." },
          tienda: { type: "string", description: "Nombre de la tienda o comercio, o parte de él." },
          repartidor: { type: "string", description: "Nombre del repartidor, o parte de él." },
          poligono: { type: "string", description: "Zona o polígono de reparto, o parte de él." },
          solo_abiertos: { type: "boolean", description: "Solo casos sin cerrar." },
          solo_demorados: {
            type: "boolean",
            description: "Solo abiertos con más de 2 días sin cambiar de estado (la cola de Demorados).",
          },
          con_datos_tienda: { type: "boolean", description: "Solo casos donde la tienda aportó datos (Reclamos)." },
          agrupar_por: {
            type: "string",
            enum: ["estado", "tienda", "repartidor", "poligono", "mes"],
            description: "Además de las filas, contar los resultados agrupados por este campo.",
          },
          limite: LIMITE,
        },
        required: ["tabla"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "metricas_mes",
      description:
        "Métricas de un mes de entregas fallidas: casos, abiertos contra cerrados, entregados, devueltos, " +
        "tasa de devolución, visitas promedio, desglose por estado y demorados.",
      parameters: {
        type: "object",
        properties: { mes: MES },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reportes_seguimiento",
      description:
        "Reportes de seguimiento que carga el equipo (los 500 más recientes). Etapas: abierto (sin tomar), " +
        "tomado (alguien lo está trabajando) y cerrado.",
      parameters: {
        type: "object",
        properties: {
          etapa: { type: "string", enum: ["abierto", "tomado", "cerrado"] },
          caso_id: { type: "string", description: "ID del caso reportado." },
          persona: {
            type: "string",
            description: "Correo o parte del correo de quien lo creó, lo tomó o lo cerró.",
          },
          texto: { type: "string", description: "Texto a buscar en el comentario, driver o seller." },
          limite: LIMITE,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repartidor_en_vivo",
      description:
        "La jornada visible del live tracker. Con `repartidor`, su avance, última posición conocida, " +
        "tiempo sin moverse, próximo destino y demoras. Sin él, la lista de repartidores con su avance.",
      parameters: {
        type: "object",
        properties: {
          repartidor: { type: "string", description: "Nombre o parte del nombre, o su ID de motoboy." },
          limite: LIMITE,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "asignacion_colectas",
      description:
        "Qué chofer colecta habitualmente cada comercio (el que más veces fue en los últimos 30 días), " +
        "incluidos los comercios sin asignar y los que retiran en un dropOFF. Sin filtros devuelve el " +
        "resumen y la carga por chofer.",
      parameters: {
        type: "object",
        properties: {
          comercio: { type: "string", description: "Nombre del comercio o del lugar de retiro, o parte de él." },
          chofer: { type: "string", description: "Nombre del chofer, o parte de él." },
          solo_sin_asignar: { type: "boolean", description: "Solo comercios que nadie colectó en la ventana." },
          limite: LIMITE,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "colectas_realizadas",
      description:
        "Colectas que efectivamente pasaron (últimos 30 días): por día, comercio y repartidor, con su " +
        "estado (Pendiente, Colectada, En depósito, Cancelada) y paquetes pedidos contra colectados.",
      parameters: {
        type: "object",
        properties: {
          dia: { type: "string", description: "Día como AAAA-MM-DD. Si se omite, el último día con colectas." },
          comercio: { type: "string", description: "Nombre del comercio, o parte de él." },
          repartidor: { type: "string", description: "Nombre del repartidor, o parte de él." },
          estado: { type: "string", enum: ["Pendiente", "Colectada", "En depósito", "Cancelada"] },
          limite: LIMITE,
        },
        additionalProperties: false,
      },
    },
  },
] as const;

/* ---------------------------------------------------------------------------
   Argumentos
   --------------------------------------------------------------------------- */

/** Lee los argumentos que manda el modelo. Un JSON roto es un objeto vacío. */
export function leerArgumentos(crudo: string): Record<string, unknown> {
  try {
    const valor: unknown = JSON.parse(crudo || "{}");
    return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function texto(args: Record<string, unknown>, clave: string): string | null {
  const valor = args[clave];
  if (typeof valor === "number") return String(valor);
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio ? limpio.slice(0, 200) : null;
}

export function booleano(args: Record<string, unknown>, clave: string): boolean {
  return args[clave] === true;
}

/** El modelo puede pedir 1000 filas; recibe como mucho `TOPE_FILAS`. */
export function limite(args: Record<string, unknown>): number {
  const valor = Number(args.limite);
  if (!Number.isFinite(valor) || valor < 1) return FILAS_POR_DEFECTO;
  return Math.min(Math.floor(valor), TOPE_FILAS);
}

export function mesValido(valor: string | null): string | null {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : null;
}

/** Un ID de viaje: solo dígitos, con lo que el modelo le haya pegado alrededor. */
export function diaValido(valor: string | null): string | null {
  return valor && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(valor) ? valor : null;
}

export function idValido(valor: string | null): string | null {
  const limpio = valor?.replace(/[\s#.,]/g, "") ?? "";
  return /^\d{1,12}$/.test(limpio) ? limpio : null;
}

/* ---------------------------------------------------------------------------
   Coincidencias
   --------------------------------------------------------------------------- */

/** Sin acentos, sin mayúsculas y sin espacios de más: como el buscador de las tablas. */
export function normalizar(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function contiene(valor: string | null | undefined, buscado: string | null): boolean {
  if (!buscado) return true;
  return normalizar(valor ?? "").includes(normalizar(buscado));
}

export type Recorte<T> = { total: number; filas: T[]; recortado: boolean };

export function recortar<T>(filas: T[], tope: number): Recorte<T> {
  return { total: filas.length, filas: filas.slice(0, tope), recortado: filas.length > tope };
}

/** Conteo por un campo, de mayor a menor, con el resto sumado en «Otros». */
export function contarPor<T>(filas: T[], campo: (fila: T) => string, tope = 15) {
  const cuenta = new Map<string, number>();
  for (const fila of filas) {
    const clave = campo(fila) || "(vacío)";
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  const ordenado = [...cuenta].sort((a, b) => b[1] - a[1]);
  const grupos = ordenado.slice(0, tope).map(([valor, casos]) => ({ valor, casos }));
  const otros = ordenado.slice(tope).reduce((suma, [, casos]) => suma + casos, 0);
  return otros > 0 ? [...grupos, { valor: "Otros", casos: otros }] : grupos;
}

/* ---------------------------------------------------------------------------
   Qué sale de cada fila

   Lo justo para contestar. Quedan afuera a propósito el teléfono, la
   ubicación y el domicilio del cliente —y los del repartidor—: viajarían a un
   proveedor externo en cada pregunta, y para eso está la ficha del caso en el
   tablero, detrás del login. Una prueba falla si alguno aparece.
   --------------------------------------------------------------------------- */

/**
 * Fechas ya escritas para una persona. Si le llega ISO, el modelo lo repite
 * tal cual —«2026-09-17T17:33:17.792Z»— o lo convierte de zona a ojo y se
 * equivoca; así llega hecho y en hora de México.
 */
const DIA = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MOMENTO = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Mexico_City",
});

/** Un día de datos (`creacion`, `ultimoMovimiento`), guardado como medianoche UTC. */
export function diaLegible(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  const fecha = typeof valor === "string" ? new Date(valor.length === 10 ? `${valor}T00:00:00Z` : valor) : valor;
  return Number.isNaN(fecha.getTime()) ? null : DIA.format(fecha);
}

/** Un instante (alta de un reporte, una visita), en hora de Ciudad de México. */
export function momentoLegible(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  const fecha = typeof valor === "string" ? new Date(valor) : valor;
  return Number.isNaN(fecha.getTime()) ? null : `${MOMENTO.format(fecha)} (hora de México)`;
}

/**
 * Una fecha que ya viene en hora local como texto (`2026-09-17 11:33`), la
 * que manda el flujo 11. No se convierte de zona: se reescribe.
 */
export function horaLocalLegible(valor: string | null | undefined): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(valor ?? "");
  if (!partes) return null;
  const [, anio, mes, dia, hora, minuto] = partes;
  const dia0 = DIA.format(new Date(`${anio}-${mes}-${dia}T00:00:00Z`));
  return `${dia0}, ${hora}:${minuto}`;
}

const fecha = diaLegible;

export function pedidoParaModelo(pedido: Pedido) {
  return {
    id: pedido.id,
    mes: pedido.mes,
    estado: pedido.estado,
    caso: pedido.cerrado ? "cerrado" : "abierto",
    repartidor: pedido.repartidor || null,
    tienda: pedido.tienda || null,
    poligono: pedido.poligono || null,
    creacion: fecha(pedido.creacion),
    ultimo_movimiento: fecha(pedido.ultimoMovimiento),
    visitas: pedido.visitas,
    siniestrado: esSiniestrado(pedido),
    valor_producto: pedido.valorProducto,
    // El 70% es lo que se cobra de un siniestro; solo tiene sentido si lo es.
    valor_70: esSiniestrado(pedido) ? pedido.valor70 : undefined,
    cobrado: esSiniestrado(pedido) ? pedido.cobrado : undefined,
    reclamo_tienda: pedido.reclamoTienda || null,
    tienda_aporto_datos: pedido.tieneDatosTienda,
    aviso: pedido.aviso || null,
    enlace_evidencia: enlaceFotoEntrega(pedido.foto ?? ""),
    enlace_rapiboy: enlaceViaje(pedido.id),
  };
}

export function canceladoParaModelo(cancelado: Cancelado) {
  return {
    id: cancelado.id,
    id_meli: cancelado.idMeli || null,
    tienda: cancelado.tienda || null,
    estado_rapiboy: cancelado.estadoRbp || null,
    estado_meli: cancelado.estadoMeli || null,
    dia_colecta: cancelado.dia,
    minutos_hasta_cancelar: cancelado.minutos,
  };
}

/** El comentario original puede ser largo; el resumen, si hay, alcanza. */
export function reporteParaModelo(reporte: Seguimiento) {
  const cuerpo = reporte.resumen ?? reporte.comentario;
  return {
    enlace_reporte: `/seguimiento?reporte=${reporte.id}`,
    caso_id: reporte.casoId,
    etapa: etapaDe(reporte) as EtapaSeguimiento,
    creado: momentoLegible(reporte.creado),
    creado_por: persona(reporte.creadoPor),
    tomado_por: persona(reporte.tomadoPor),
    cerrado_por: persona(reporte.atendidoPor),
    cerrado_en: momentoLegible(reporte.atendidoEn),
    driver: reporte.driver,
    seller: reporte.seller,
    comentario: cuerpo.length > 400 ? `${cuerpo.slice(0, 400)}…` : cuerpo,
    adjuntos: reporte.archivos.length,
  };
}

export function paqueteEnRutaParaModelo(paquete: PaqueteFila) {
  return {
    id_viaje: paquete.id_viaje,
    estado: paquete.nombre_estado ?? "Estado no informado",
    dia_de_la_ruta: diaLegible(paquete.fecha_ruta),
    id_motoboy: paquete.id_motoboy,
    id_ruta: paquete.id_ruta,
    orden: paquete.orden,
    tienda: paquete.tienda,
    poligono: paquete.poligono,
    ciudad: paquete.ciudad,
    domicilio_laboral: paquete.es_laboral,
    visitado: paquete.visitado,
    fecha_visita: momentoLegible(paquete.fecha_visita),
    motivo_no_entregado: paquete.motivo_no_entregado,
    comentario_repartidor: paquete.comentario_motoboy,
    enlace_evidencia: enlaceFotoEntrega(paquete.evidencia_foto ?? ""),
    enlace_rapiboy: enlaceViaje(paquete.id_viaje),
    activo_en_ruta: paquete.activo_en_ruta,
    retirado_de_ruta_en: momentoLegible(paquete.retirado_de_ruta_en),
  };
}

/** Un repartidor en una línea, para la lista de la jornada. */
export function repartidorEnListaParaModelo(driver: DriverDelTracker) {
  return {
    id: driver.id,
    nombre: driver.nombre,
    paquetes: driver.resumen.total,
    entregados: driver.resumen.entregados,
    no_entregados: driver.resumen.noEntregados,
    pendientes: driver.resumen.pendientes,
    avance_pct: redondear(driver.resumen.avance),
    posicion: driver.estadoPosicion,
    minutos_sin_actualizar: driver.minutosSinActualizar,
    minutos_sin_movimiento: driver.minutosSinMovimiento,
  };
}

/**
 * El repartidor que se está mirando, con detalle. Sin coordenadas ni
 * domicilio: el polígono ya dice dónde anda, y su casa no es asunto del chat.
 */
export function repartidorParaModelo(driver: DriverDelTracker) {
  return {
    ...repartidorEnListaParaModelo(driver),
    fecha_posicion: momentoLegible(driver.fechaPosicion),
    sin_gps: driver.posicion === null,
    poligonos_de_su_posicion: driver.poligonos,
    rutas: driver.rutas,
    resumen: driver.resumen,
    proximo_destino: driver.proximo
      ? {
          id_viaje: driver.proximo.id_viaje,
          orden: driver.proximo.orden,
          tienda: driver.proximo.tienda,
          poligono: driver.proximo.poligono,
        }
      : null,
    orden_confiable: driver.secuencia.confiable,
    demora_informada: driver.demoraInformada
      ? { motivo: driver.demoraInformada.motivo, registrado_por: persona(driver.demoraInformada.registrado_por) }
      : null,
    ultima_info: driver.ultimaInfo,
  };
}

/**
 * Quién hizo algo, sin su correo: `esteban.larcher@rapiboy.com` viaja como
 * `esteban.larcher`. El modelo solo necesita un nombre para contarlo, y el
 * correo completo es un dato personal que no tiene por qué salir.
 */
function persona(correo: string | null | undefined): string | null {
  return correo ? nombreDePersona(correo) : null;
}

function redondear(valor: number | null): number | null {
  return valor == null ? null : Math.round(valor * 10) / 10;
}

/* ---------------------------------------------------------------------------
   Historial desde el sistema (flujo 11 de n8n)
   --------------------------------------------------------------------------- */

/**
 * La respuesta del flujo, ya para el modelo. Llega de afuera, así que se lee
 * campo por campo y lo que no tenga forma queda en `null`: el modelo nunca ve
 * el JSON crudo de n8n.
 */
export function historialParaModelo(crudo: unknown, maxMovimientos = 60) {
  const datos = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const id = typeof datos.id === "string" || typeof datos.id === "number" ? String(datos.id) : null;
  if (datos.encontrado !== true) return { encontrado: false, id };

  const viaje = (datos.viaje && typeof datos.viaje === "object" ? datos.viaje : {}) as Record<string, unknown>;
  const cadena = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);
  const numero = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);
  const movimientos = Array.isArray(datos.historial) ? datos.historial : [];

  // El mismo alcance que Mensual, Ayer y el tracker: modalidad 5, localidad 9.
  // El flujo responde por cualquier viaje de Rapiboy, y el tablero no: un
  // viaje de otra ciudad o modalidad no se detalla, solo se dice que no es
  // nuestro. Si no, el chat daría más acceso que la pantalla.
  if (numero(viaje.id_modalidad) !== 5 || numero(viaje.id_localidad) !== 9) {
    return {
      encontrado: true,
      id,
      en_alcance_del_tablero: false,
      nota: "Es un viaje de otra localidad o modalidad: queda fuera del alcance de este tablero.",
    };
  }

  return {
    encontrado: true,
    id,
    estado_actual: cadena(viaje.estado_actual),
    tienda: cadena(viaje.tienda),
    zona: cadena(viaje.poligono),
    fecha_programado: diaLegible(cadena(viaje.fecha_programado)),
    visitas: numero(viaje.visitas),
    en_alcance_del_tablero: true,
    enlace_rapiboy: id ? enlaceViaje(id) : null,
    total_movimientos: movimientos.length,
    movimientos: movimientos.slice(-maxMovimientos).map((crudoMovimiento) => {
      const m = (crudoMovimiento && typeof crudoMovimiento === "object" ? crudoMovimiento : {}) as Record<
        string,
        unknown
      >;
      return {
        fecha: horaLocalLegible(cadena(m.fecha)),
        estado: cadena(m.estado),
        repartidor: cadena(m.repartidor),
        hubo_visita: m.visitado === true,
        cambiado_por: persona(cadena(m.responsable)),
        enlace_foto: enlaceFotoEntrega(cadena(m.foto) ?? ""),
      };
    }),
  };
}

/* ---------------------------------------------------------------------------
   Cruce sistema ↔ tablero
   --------------------------------------------------------------------------- */

/**
 * Qué dice cada lado sobre el estado, y si coinciden.
 *
 * El sistema es la fuente del estado actual; el tablero lo copia en cada
 * refresco (06:00, 15:13, 18:55 y el botón Actualizar), así que una diferencia
 * casi siempre es un refresco pendiente y no un error. Se compara sin acentos
 * ni mayúsculas: «Devolución» y «Devolucion» son el mismo estado.
 */
export function cruzarEstados(estadoSistema: string | null, estadoTablero: string | null) {
  const coinciden =
    estadoSistema && estadoTablero ? normalizar(estadoSistema) === normalizar(estadoTablero) : null;
  return {
    estado_sistema: estadoSistema,
    estado_tablero: estadoTablero,
    coinciden,
    tablero_desactualizado: coinciden === false,
  };
}

/* ---------------------------------------------------------------------------
   Colectas

   Sin dirección, teléfono ni correo del comercio, ni teléfono del repartidor,
   ni precios: nada de eso hace falta para decir quién fue y qué levantó.
   --------------------------------------------------------------------------- */

export function asignacionParaModelo(asignacion: Asignacion) {
  return {
    comercio: asignacion.seller,
    lugar_de_retiro: asignacion.lugarColecta,
    retira_en_dropoff: asignacion.esDropOff,
    chofer: asignacion.sinAsignar ? null : asignacion.chofer,
    sin_asignar: asignacion.sinAsignar,
    colectas_en_30_dias: asignacion.cantidadColectas,
  };
}

export function colectaParaModelo(colecta: Colecta) {
  return {
    dia: diaLegible(colecta.fecha),
    comercio: colecta.seller,
    repartidor: colecta.repartidor || null,
    estado: colecta.estado,
    paquetes_pedidos: colecta.paquetesSolicitados,
    paquetes_colectados: colecta.paquetesColectados,
    bultos: colecta.bultos,
    colectada_a_las: momentoLegible(colecta.colecta),
    comentario: colecta.comentario || null,
  };
}

/* ---------------------------------------------------------------------------
   Resultado de una herramienta
   --------------------------------------------------------------------------- */

/**
 * Lo más largo que se le devuelve al modelo por llamada, en caracteres: unos
 * 5.000 tokens. Alcanza para `TOPE_FILAS` casos de Mensual, que miden ~14.000.
 */
export const TOPE_RESULTADO = 20_000;

/**
 * Serializa el resultado para el modelo. Si igual se pasa de largo —una fila
 * con un comentario enorme, por ejemplo—, se corta y se avisa: un JSON cortado
 * sin aviso se leería como datos completos.
 */
export function serializarResultado(resultado: unknown): string {
  const json = JSON.stringify(resultado);
  if (json.length <= TOPE_RESULTADO) return json;
  return `${json.slice(0, TOPE_RESULTADO)}… [RESULTADO CORTADO: pedí menos filas o filtrá más]`;
}
