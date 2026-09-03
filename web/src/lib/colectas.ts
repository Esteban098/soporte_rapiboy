/**
 * Colectas: quién retira la mercadería en cada comercio.
 *
 * Son dos cosas distintas y el módulo las trata como tales:
 *
 * - **La asignación** dice quién colecta habitualmente cada comercio. Sale de
 *   rankear los últimos 30 días, así que no es una orden sino una constatación:
 *   «al que más va es este». Se rehace entera en cada corrida.
 * - **Las colectas realizadas** son lo que efectivamente pasó cada día. Sirven
 *   para mirar un martes puntual, no para deducir una regla.
 *
 * La diferencia importa al leer: un comercio puede tener asignado a un chofer y
 * que ayer haya ido otro. Eso no es un error de los datos, es la realidad que
 * el tablero está mostrando.
 */

/** Un comercio con el chofer que más veces lo colectó. */
export type Asignacion = {
  idUsuario: number;
  seller: string;
  /**
   * Dónde se colecta de hecho: el comercio mismo, o el dropOFF cuando varios
   * comparten punto de retiro. El ranking se calcula por lugar y no por
   * comercio, porque el chofer va una vez y levanta todo lo que hay ahí.
   */
  lugarColecta: string;
  idMotoboy: string;
  chofer: string;
  /** Veces que ese chofer fue a ese lugar en la ventana consultada. */
  cantidadColectas: number;
  /** Viajes que respaldan el mapeo a dropOFF. Cero si el comercio no es uno. */
  cantidadHistorica: number;
  actualizado: Date | null;
  /** El punto de retiro es compartido, no el comercio. */
  esDropOff: boolean;
  /**
   * Nadie lo colectó en la ventana. La consulta escribe «SIN ASIGNACION» en el
   * chofer, y son justamente los comercios que hay que repartir.
   */
  sinAsignar: boolean;
};

/**
 * Una colecta, con su ciclo de vida.
 *
 * El registro nace cuando alguien pide la colecta y cambia hasta que se retira,
 * llega al depósito o se cancela. Por eso hay cuatro fechas y no una: el estado
 * sale de cuáles están llenas, no de un campo que alguien tenga que mantener.
 */
export type Colecta = {
  id: number;
  /** Día en que se creó el pedido de colecta. Es el que filtra la pantalla. */
  fecha: string;
  solicitud: Date | null;
  colecta: Date | null;
  llegoDeposito: Date | null;
  cancelada: Date | null;
  estado: EstadoColecta;

  paquetesSolicitados: number | null;
  paquetesColectados: number | null;
  bultos: number | null;
  depositosVisitados: number | null;
  comentario: string;

  idSeller: number;
  seller: string;
  direccionSeller: string;
  telefonoSeller: string;
  emailSeller: string;

  /** Vacío cuando la colecta todavía no tiene repartidor asignado. */
  repartidor: string;
  telefonoRepartidor: string;

  idReserva: number | null;
  reservaCancelada: boolean;

  precio: number | null;
  incentivo: number | null;
  comision: number | null;
  idPedidos: string;
};

/**
 * En qué quedó la colecta.
 *
 * Se deduce de las fechas y no de `id_estado`, que llega como número y sin su
 * tabla de nombres. El orden de la comprobación importa: una colecta cancelada
 * puede tener fecha de colecta si se canceló después de retirar, y ahí lo que
 * manda es la cancelación.
 */
export type EstadoColecta = "Cancelada" | "En depósito" | "Colectada" | "Pendiente";

export const ESTADOS_COLECTA: EstadoColecta[] = [
  "Pendiente",
  "Colectada",
  "En depósito",
  "Cancelada",
];

const SIN_ASIGNACION = "sin asignacion";

function celda(fila: string[], indice: number | undefined): string {
  if (indice == null) return "";
  return String(fila[indice] ?? "").replace(/\s+/g, " ").trim();
}

function indices(encabezado: string[], nombres: string[]): Record<string, number> {
  const normalizado = encabezado.map((c) => c.toLowerCase().trim());
  return Object.fromEntries(nombres.map((n) => [n, normalizado.indexOf(n)]));
}

function entero(valor: string): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function parsearAsignaciones(filas: string[][]): Asignacion[] {
  const [encabezado, ...cuerpo] = filas;
  if (!encabezado) return [];
  const i = indices(encabezado, [
    "id_usuario", "seller", "lugar_colecta", "id_motoboy", "chofer",
    "cantidad_colectas", "cantidad_historica", "actualizado_en",
  ]);

  return cuerpo
    .map((fila) => {
      const idUsuario = Number(celda(fila, i.id_usuario));
      if (!Number.isFinite(idUsuario) || idUsuario <= 0) return null;

      const seller = celda(fila, i.seller);
      const lugarColecta = celda(fila, i.lugar_colecta) || seller;
      const chofer = celda(fila, i.chofer);
      const actualizado = celda(fila, i.actualizado_en);

      return {
        idUsuario,
        seller,
        lugarColecta,
        idMotoboy: celda(fila, i.id_motoboy),
        chofer,
        cantidadColectas: entero(celda(fila, i.cantidad_colectas)),
        cantidadHistorica: entero(celda(fila, i.cantidad_historica)),
        actualizado: actualizado ? new Date(actualizado) : null,
        // El lugar difiere del comercio solo cuando hay dropOFF de por medio.
        esDropOff: lugarColecta !== "" && lugarColecta !== seller,
        sinAsignar: chofer.toLowerCase() === SIN_ASIGNACION || chofer === "",
      };
    })
    .filter((a): a is Asignacion => a !== null);
}

function marca(valor: string): Date | null {
  const m = valor.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  const d = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
  return d ? new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])) : null;
}

function numeroONulo(valor: string): number | null {
  if (valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function estadoDe(cancelada: Date | null, deposito: Date | null, colecta: Date | null): EstadoColecta {
  if (cancelada) return "Cancelada";
  if (deposito) return "En depósito";
  if (colecta) return "Colectada";
  return "Pendiente";
}

const COLUMNAS_COLECTA = [
  "id", "fecha", "fecha_solicitud", "fecha_colecta", "fecha_llego_deposito", "fecha_cancelada",
  "paquetes_solicitados", "paquetes_colectados", "cantidad_bultos", "depositos_visitados",
  "comentario", "id_seller", "seller", "direccion_seller", "telefono_seller", "email_seller",
  "repartidor", "telefono_repartidor", "id_reserva", "reserva_cancelada",
  "precio", "incentivo", "comision", "id_pedidos",
];

export function parsearColectas(filas: string[][]): Colecta[] {
  const [encabezado, ...cuerpo] = filas;
  if (!encabezado) return [];
  const i = indices(encabezado, COLUMNAS_COLECTA);

  return cuerpo
    .map((fila) => {
      const id = Number(celda(fila, i.id));
      const fecha = celda(fila, i.fecha).slice(0, 10);
      if (!Number.isFinite(id) || id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

      const colecta = marca(celda(fila, i.fecha_colecta));
      const llegoDeposito = marca(celda(fila, i.fecha_llego_deposito));
      const cancelada = marca(celda(fila, i.fecha_cancelada));

      return {
        id,
        fecha,
        solicitud: marca(celda(fila, i.fecha_solicitud)),
        colecta,
        llegoDeposito,
        cancelada,
        estado: estadoDe(cancelada, llegoDeposito, colecta),
        paquetesSolicitados: numeroONulo(celda(fila, i.paquetes_solicitados)),
        paquetesColectados: numeroONulo(celda(fila, i.paquetes_colectados)),
        bultos: numeroONulo(celda(fila, i.cantidad_bultos)),
        depositosVisitados: numeroONulo(celda(fila, i.depositos_visitados)),
        comentario: celda(fila, i.comentario),
        idSeller: Number(celda(fila, i.id_seller)) || 0,
        seller: celda(fila, i.seller),
        direccionSeller: celda(fila, i.direccion_seller),
        telefonoSeller: celda(fila, i.telefono_seller),
        emailSeller: celda(fila, i.email_seller),
        repartidor: celda(fila, i.repartidor),
        telefonoRepartidor: celda(fila, i.telefono_repartidor),
        idReserva: numeroONulo(celda(fila, i.id_reserva)),
        reservaCancelada: celda(fila, i.reserva_cancelada).toLowerCase() === "true",
        precio: numeroONulo(celda(fila, i.precio)),
        incentivo: numeroONulo(celda(fila, i.incentivo)),
        comision: numeroONulo(celda(fila, i.comision)),
        idPedidos: celda(fila, i.id_pedidos),
      };
    })
    .filter((c): c is Colecta => c !== null);
}

/* ------------------------------------------------------------------------- */
/* Asignación                                                                 */
/* ------------------------------------------------------------------------- */

export type ResumenAsignacion = {
  comercios: number;
  sinAsignar: number;
  choferes: number;
  /** Puntos de retiro distintos: menos que comercios cuando hay dropOFF. */
  lugares: number;
  enDropOff: number;
  actualizado: Date | null;
};

export function resumirAsignaciones(filas: Asignacion[]): ResumenAsignacion {
  const conChofer = filas.filter((a) => !a.sinAsignar);
  const fechas = filas.map((a) => a.actualizado).filter((f): f is Date => f !== null);

  return {
    comercios: filas.length,
    sinAsignar: filas.filter((a) => a.sinAsignar).length,
    choferes: new Set(conChofer.map((a) => a.chofer)).size,
    lugares: new Set(filas.map((a) => a.lugarColecta)).size,
    enDropOff: filas.filter((a) => a.esDropOff).length,
    actualizado: fechas.length
      ? new Date(Math.max(...fechas.map((f) => f.getTime())))
      : null,
  };
}

export type CargaChofer = {
  chofer: string;
  comercios: number;
  lugares: number;
  colectas: number;
};

/**
 * Cuántos comercios tiene cada chofer.
 *
 * Se cuentan también los lugares, y casi nunca coinciden: un dropOFF junta
 * varios comercios en una sola parada, así que un chofer con doce comercios y
 * tres lugares hace muchas menos paradas que uno con seis y seis. Mirar solo
 * los comercios haría parecer que el primero está más cargado.
 */
export function cargaPorChofer(filas: Asignacion[]): CargaChofer[] {
  const grupos = new Map<string, Asignacion[]>();
  for (const a of filas) {
    if (a.sinAsignar) continue;
    const lista = grupos.get(a.chofer);
    if (lista) lista.push(a);
    else grupos.set(a.chofer, [a]);
  }

  return [...grupos.entries()]
    .map(([chofer, lista]) => ({
      chofer,
      comercios: lista.length,
      lugares: new Set(lista.map((a) => a.lugarColecta)).size,
      colectas: lista.reduce((suma, a) => suma + a.cantidadColectas, 0),
    }))
    .sort((a, b) => b.comercios - a.comercios || a.chofer.localeCompare(b.chofer));
}

/* ------------------------------------------------------------------------- */
/* Colectas realizadas                                                        */
/* ------------------------------------------------------------------------- */

/** Los días con colectas cargadas, del más nuevo al más viejo. */
export function diasDisponibles(colectas: Colecta[]): string[] {
  return [...new Set(colectas.map((c) => c.fecha))].sort().reverse();
}

export type FilaDia = {
  dia: string;
  colectas: number;
  colectadas: number;
  canceladas: number;
  paquetes: number;
};

/**
 * La serie por día.
 *
 * Solo entran los días que tienen algo: a diferencia del histórico mensual, un
 * día en cero acá casi siempre es un domingo o un feriado y no un problema.
 * Rellenar con ceros llenaría el gráfico de huecos que no dicen nada.
 */
export function colectasPorDia(colectas: Colecta[]): FilaDia[] {
  const grupos = new Map<string, Colecta[]>();
  for (const c of colectas) {
    const lista = grupos.get(c.fecha);
    if (lista) lista.push(c);
    else grupos.set(c.fecha, [c]);
  }

  return [...grupos.entries()]
    .map(([dia, lista]) => ({
      dia,
      colectas: lista.length,
      colectadas: lista.filter((c) => c.estado !== "Pendiente" && c.estado !== "Cancelada").length,
      canceladas: lista.filter((c) => c.estado === "Cancelada").length,
      paquetes: lista.reduce((suma, c) => suma + (c.paquetesColectados ?? 0), 0),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

export type ResumenDia = {
  colectas: number;
  sellers: number;
  repartidores: number;
  /** Pedidas y todavía sin repartidor asignado. */
  sinRepartidor: number;
  canceladas: number;
  pendientes: number;
  paquetesSolicitados: number;
  paquetesColectados: number;
  /**
   * Colectas que pasaron pero levantaron menos de lo pedido.
   *
   * Es la lectura que el conteo de colectas no da: una visita que retiró tres
   * de diez paquetes cuenta como colecta hecha y deja siete en el comercio.
   */
  incompletas: number;
};

export function resumirDia(colectas: Colecta[]): ResumenDia {
  const hechas = colectas.filter((c) => c.estado === "Colectada" || c.estado === "En depósito");

  return {
    colectas: colectas.length,
    sellers: new Set(colectas.map((c) => c.idSeller)).size,
    repartidores: new Set(colectas.filter((c) => c.repartidor).map((c) => c.repartidor)).size,
    sinRepartidor: colectas.filter((c) => !c.repartidor && c.estado !== "Cancelada").length,
    canceladas: colectas.filter((c) => c.estado === "Cancelada").length,
    pendientes: colectas.filter((c) => c.estado === "Pendiente").length,
    paquetesSolicitados: colectas.reduce((s, c) => s + (c.paquetesSolicitados ?? 0), 0),
    paquetesColectados: colectas.reduce((s, c) => s + (c.paquetesColectados ?? 0), 0),
    incompletas: hechas.filter(
      (c) =>
        c.paquetesSolicitados != null &&
        c.paquetesColectados != null &&
        c.paquetesColectados < c.paquetesSolicitados,
    ).length,
  };
}

export type FilaRepartidor = {
  repartidor: string;
  colectas: number;
  paquetes: number;
  canceladas: number;
  sellers: number;
};

/** Qué hizo cada repartidor ese día. Las colectas sin asignar quedan afuera. */
export function porRepartidor(colectas: Colecta[]): FilaRepartidor[] {
  const grupos = new Map<string, Colecta[]>();
  for (const c of colectas) {
    if (!c.repartidor) continue;
    const lista = grupos.get(c.repartidor);
    if (lista) lista.push(c);
    else grupos.set(c.repartidor, [c]);
  }

  return [...grupos.entries()]
    .map(([repartidor, lista]) => ({
      repartidor,
      colectas: lista.length,
      paquetes: lista.reduce((s, c) => s + (c.paquetesColectados ?? 0), 0),
      canceladas: lista.filter((c) => c.estado === "Cancelada").length,
      sellers: new Set(lista.map((c) => c.idSeller)).size,
    }))
    .sort((a, b) => b.colectas - a.colectas || a.repartidor.localeCompare(b.repartidor));
}

/* ------------------------------------------------------------------------- */
/* El puente entre las dos tablas                                             */
/* ------------------------------------------------------------------------- */

/**
 * Cada comercio y si su punto de retiro se visitó ese día.
 *
 * Existe porque el sistema no guarda una colecta por tienda. Cuando un
 * comercio entrega en un dropOFF, la colecta se registra una sola vez contra
 * el dropOFF: buscar «Casa Baberos» en `colectas` no devuelve nada aunque se
 * haya retirado su mercadería, porque la fila dice «dropOFF TERESITA EXPRESS».
 * Está comprobado sobre los datos: de 197 comercios con chofer, 52 aparecen
 * por su nombre y los 145 restantes —144 de ellos con dropOFF— no aparecen
 * nunca.
 *
 * Así que el renglón por comercio se deriva: se parte de la asignación, que sí
 * sabe que Casa Baberos entrega en Teresita, y se busca si ese punto tuvo
 * colecta. Es información derivada y no un registro, y la pantalla tiene que
 * decirlo: «colectado» acá significa «alguien pasó por su punto», no «se
 * retiró un paquete suyo».
 */
export type ComercioCubierto = {
  idUsuario: number;
  seller: string;
  lugarColecta: string;
  esDropOff: boolean;
  choferHabitual: string;
  /** Quién pasó por su punto ese día, o `null` si no pasó nadie. */
  repartidorDelDia: string | null;
  colectado: boolean;
  /**
   * Paquetes retirados en ese punto, entre todos los comercios que lo
   * comparten. NO son los de esta tienda: el sistema no los separa.
   */
  paquetesDelPunto: number;
  /** Cuántos comercios comparten el punto. 1 cuando colecta en su puerta. */
  compartenPunto: number;
};

export function comerciosCubiertos(
  asignaciones: Asignacion[],
  delDia: Colecta[],
): ComercioCubierto[] {
  const asignados = asignaciones.filter((a) => !a.sinAsignar);

  const cuantosEnElPunto = new Map<string, number>();
  for (const a of asignados) {
    cuantosEnElPunto.set(a.lugarColecta, (cuantosEnElPunto.get(a.lugarColecta) ?? 0) + 1);
  }

  /*
   * El nombre del punto en la asignación y el del seller en las colectas no
   * son iguales —«dropOFF Teresita» contra «dropOFF TERESITA EXPRESS»— así que
   * se comparan normalizados y por prefijo. Comparando literal no cruzaría
   * ninguno de los dropOFF, que es justamente el caso que esto resuelve.
   */
  const visitas = new Map<string, { repartidor: string; paquetes: number }>();
  for (const c of delDia) {
    const clave = normalizarLugar(c.seller);
    const previo = visitas.get(clave);
    visitas.set(clave, {
      repartidor: previo?.repartidor || c.repartidor,
      paquetes: (previo?.paquetes ?? 0) + (c.paquetesColectados ?? 0),
    });
  }

  const buscarVisita = (lugar: string) => {
    const clave = normalizarLugar(lugar);
    const exacta = visitas.get(clave);
    if (exacta) return exacta;
    for (const [otra, visita] of visitas) {
      if (otra.startsWith(clave) || clave.startsWith(otra)) return visita;
    }
    return null;
  };

  return asignados
    .map((a) => {
      const visita = buscarVisita(a.lugarColecta);
      return {
        idUsuario: a.idUsuario,
        seller: a.seller,
        lugarColecta: a.lugarColecta,
        esDropOff: a.esDropOff,
        choferHabitual: a.chofer,
        repartidorDelDia: visita?.repartidor || null,
        colectado: visita !== null,
        paquetesDelPunto: visita?.paquetes ?? 0,
        compartenPunto: cuantosEnElPunto.get(a.lugarColecta) ?? 1,
      };
    })
    .sort((a, b) => a.seller.localeCompare(b.seller));
}

/** Sin acentos, sin mayúsculas y sin los sufijos que difieren entre tablas. */
function normalizarLugar(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
