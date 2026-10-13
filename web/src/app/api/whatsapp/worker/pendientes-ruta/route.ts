import { autorizadoN8n, jsonLimitado } from "@/lib/chat-interno";
import {
  TABLA_AVISOS_PENDIENTES_MANANA,
  TABLA_DRIVERS_ACTIVOS,
  TABLA_TRACKER_PAQUETES,
} from "@/lib/config";
import {
  candidatosPendientesManana,
  GRUPO_OPERATIVO_PENDIENTES,
  MINIMO_AVISO_OPERATIVO,
  textoAvisoDriver,
  textoAvisoOperativo,
} from "@/lib/pendientes-manana";
import { diaDeOperacion, diaOperativoAnterior } from "@/lib/tracker";
import { consultarFresco, insertarFilasSinDuplicar } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DriverFila = {
  id_motoboy: number | string;
  nombre: string | null;
  grupo_jid: string | null;
  latitud_manual: number | string | null;
  longitud_manual: number | string | null;
};

type PaqueteFila = {
  id_motoboy: number | string | null;
  latitud_destino: number | string | null;
  longitud_destino: number | string | null;
};

type AvisoFila = {
  id_motoboy: number | string;
  tipo: "DRIVER" | "OPERATIVO";
};

type Aviso = {
  fechaOperacion: string;
  jornada: string;
  idDriver: number;
  tipo: "DRIVER" | "OPERATIVO";
  chatId: string;
  texto: string;
};

const numero = (valor: number | string | null): number | null => {
  if (valor == null || valor === "") return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

/**
 * n8n pide solo los avisos que todavía no fueron enviados hoy. La evaluación
 * geográfica queda en la plataforma porque es la fuente única del KMZ de
 * cobertura; al flujo no se le copian polígonos ni coordenadas de domicilios.
 */
export async function GET(request: Request) {
  if (!autorizadoN8n(request)) return Response.json({ ok: false }, { status: 401 });

  try {
    const fechaOperacion = diaDeOperacion();
    const jornada = diaOperativoAnterior(fechaOperacion);
    const [drivers, paquetes, enviados] = await Promise.all([
      consultarFresco<DriverFila>(TABLA_DRIVERS_ACTIVOS, {
        activo: "eq.true",
        select: "id_motoboy,nombre,grupo_jid,latitud_manual,longitud_manual",
      }),
      consultarFresco<PaqueteFila>(TABLA_TRACKER_PAQUETES, {
        fecha_ruta: `eq.${jornada}`,
        clasificacion: "eq.PENDIENTE_NO_VISITADO",
        select: "id_motoboy,latitud_destino,longitud_destino",
      }),
      consultarFresco<AvisoFila>(TABLA_AVISOS_PENDIENTES_MANANA, {
        fecha_operacion: `eq.${fechaOperacion}`,
        select: "id_motoboy,tipo",
      }),
    ]);

    const yaEnviado = new Set(enviados.map((aviso) => `${aviso.id_motoboy}:${aviso.tipo}`));
    const avisos: Aviso[] = [];
    for (const candidato of candidatosPendientesManana(
      drivers.flatMap((driver) => {
        const id = numero(driver.id_motoboy);
        if (id == null || id <= 0) return [];
        return [{
          id,
          nombre: driver.nombre?.trim() || `Driver ${id}`,
          grupoJid: driver.grupo_jid?.trim() || null,
          latitudManual: numero(driver.latitud_manual),
          longitudManual: numero(driver.longitud_manual),
        }];
      }),
      paquetes.map((paquete) => ({
        idDriver: numero(paquete.id_motoboy),
        latitudDestino: numero(paquete.latitud_destino),
        longitudDestino: numero(paquete.longitud_destino),
      })),
    )) {
      if (candidato.grupoJid && !yaEnviado.has(`${candidato.idDriver}:DRIVER`)) {
        avisos.push({
          fechaOperacion,
          jornada,
          idDriver: candidato.idDriver,
          tipo: "DRIVER",
          chatId: candidato.grupoJid,
          texto: textoAvisoDriver(candidato, jornada),
        });
      }
      if (candidato.pendientes >= MINIMO_AVISO_OPERATIVO && !yaEnviado.has(`${candidato.idDriver}:OPERATIVO`)) {
        avisos.push({
          fechaOperacion,
          jornada,
          idDriver: candidato.idDriver,
          tipo: "OPERATIVO",
          chatId: GRUPO_OPERATIVO_PENDIENTES,
          texto: textoAvisoOperativo(candidato, jornada),
        });
      }
    }

    return Response.json(avisos, { headers: { "cache-control": "no-store" } });
  } catch {
    // No se filtran detalles de tablas, coordenadas ni grupos hacia n8n.
    return Response.json({ ok: false }, { status: 503 });
  }
}

/** Se llama solo después de una respuesta exitosa de WAHA. */
export async function POST(request: Request) {
  if (!autorizadoN8n(request)) return Response.json({ ok: false }, { status: 401 });
  const entrada = await jsonLimitado(request) as Partial<Aviso> | null;
  const fechaOperacion = typeof entrada?.fechaOperacion === "string" ? entrada.fechaOperacion : "";
  const jornada = typeof entrada?.jornada === "string" ? entrada.jornada : "";
  const idDriver = Number(entrada?.idDriver);
  const tipo = entrada?.tipo;
  const texto = typeof entrada?.texto === "string" ? entrada.texto.trim() : "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaOperacion) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(jornada) ||
    !Number.isSafeInteger(idDriver) || idDriver <= 0 ||
    (tipo !== "DRIVER" && tipo !== "OPERATIVO") ||
    !texto || texto.length > 1500
  ) return Response.json({ ok: false }, { status: 400 });

  const error = await insertarFilasSinDuplicar(
    TABLA_AVISOS_PENDIENTES_MANANA,
    [{ fecha_operacion: fechaOperacion, jornada, id_motoboy: idDriver, tipo, mensaje: texto }],
    "fecha_operacion,id_motoboy,tipo",
  );
  return error ? Response.json({ ok: false }, { status: 503 }) : Response.json({ ok: true });
}
