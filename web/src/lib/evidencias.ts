import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  BUCKET_EVIDENCIAS,
  TABLA_DRIVERS_ACTIVOS,
  TABLA_EVIDENCIAS_CONFIG,
  TABLA_EVIDENCIAS_REVISION,
  VISTA_EVIDENCIAS_SCORE,
  TABLA_TRACKER_PAQUETES,
  evidenciasConfig,
} from "./config";
import {
  borrarArchivos,
  consultarFresco,
  consultarTodo,
  ejecutarRpc,
  firmarArchivos,
  subirArchivoServidor,
} from "./supabase";
import { diaEvidencias, enVentanaEvidencias, extensionDeMime } from "./evidencias-reglas";
import { distanciaEvidencia, puntoEvidencia, type EstadoGeografico } from "./evidencias-geografia";

export type DecisionEvidencia = "CONFIRMADA" | "DESCARTADA" | "INCONCLUSA";
export type TipoProblemaEvidencia =
  | "BORROSA" | "OSCURA" | "CORTADA" | "ILEGIBLE"
  | "PAQUETE_NO_DISTINGUIBLE" | "SOLO_PAQUETE" | "SIN_CONTEXTO_DE_ENTREGA"
  | "OTRO" | "NINGUNO";

export type EvidenciaEntrada = {
  claveOrigen: string;
  idViaje: number;
  historialEventoId: number;
  idMotoboy: number | null;
  driverEvento: string | null;
  evidenciaEn: string;
  fotoUrl: string;
  domicilioDestino?: string | null;
  geografia?: {
    estadoEvento: string;
    distanciaM: number | null;
    visitadoEvento: boolean;
    latitudEvento: number | null;
    longitudEvento: number | null;
    latitudDestino: number | null;
    longitudDestino: number | null;
  };
};

type Configuracion = {
  modo: "OBSERVACION" | "ACTIVO";
  minimo_muestra_score: number;
  maximo_por_corrida: number;
  radio_geografico_m?: number;
};

type RevisionFila = {
  id: string;
  id_viaje: number;
  id_motoboy: number | null;
  driver_evento: string | null;
  evidencia_en: string;
  foto_ruta: string | null;
  estado_proceso: string;
  tipo_problema_modelo: TipoProblemaEvidencia | null;
  motivo_modelo: string | null;
  confianza_modelo: number | null;
  modo_observacion: boolean;
  decision_humana: DecisionEvidencia | null;
  revisada_por: string | null;
  revisada_en: string | null;
  comentario_revision: string | null;
  estado_geografico?: EstadoGeografico;
  distancia_entrega_m?: number | null;
  radio_geografico_m?: number | null;
  domicilio_destino?: string | null;
  estado_evento?: string | null;
  visitado_evento?: boolean | null;
  latitud_evento?: number | null;
  longitud_evento?: number | null;
  latitud_destino?: number | null;
  longitud_destino?: number | null;
  calidad_modelo?: "ACEPTABLE" | "DUDOSA" | null;
};

type ResultadoVision = {
  calidad: "ACEPTABLE" | "DUDOSA";
  tipo_problema: TipoProblemaEvidencia;
  motivo: string;
  confianza: number;
  tokensEntrada: number | null;
  tokensSalida: number | null;
};

export type EvidenciaPanel = {
  id: string;
  idViaje: number;
  idMotoboy: number | null;
  driver: string;
  evidenciaEn: string;
  tipoProblema: TipoProblemaEvidencia | null;
  motivo: string;
  confianza: number | null;
  observacion: boolean;
  fotoUrl: string | null;
  decision: DecisionEvidencia | null;
  revisadaPor: string | null;
  revisadaEn: string | null;
  comentarioRevision: string | null;
  estadoGeografico: EstadoGeografico;
  distanciaM: number | null;
  radioM: number | null;
  domicilio: string | null;
  estadoEvento: string | null;
  visitadoEvento: boolean | null;
  calidadVisual: "ACEPTABLE" | "DUDOSA" | null;
  domicilioActual: boolean;
  puntoEvento: { lat: number; lon: number } | null;
  puntoDestino: { lat: number; lon: number } | null;
};

export type ScoreDriver = {
  idMotoboy: number;
  driver: string;
  total: number;
  confirmadas: number;
  descartadas: number;
  inconclusas: number;
  minimo: number;
  muestraSuficiente: boolean;
  score: number | null;
  proporcionMalas: number;
};

export function autorizarWebhook(encabezado: string | null): boolean {
  const recibido = encabezado?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const esperado = evidenciasConfig()?.secretoN8n ?? "";
  if (!recibido || !esperado) return false;
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export function validarEntrada(valor: unknown): EvidenciaEntrada {
  const x = (valor ?? {}) as Record<string, unknown>;
  const numero = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
  const claveOrigen = String(x.claveOrigen ?? "").trim();
  const idViaje = numero(x.idViaje);
  const historialEventoId = numero(x.historialEventoId);
  const idMotoboy = x.idMotoboy == null ? null : numero(x.idMotoboy);
  const evidenciaEn = String(x.evidenciaEn ?? "").trim();
  const fotoUrl = String(x.fotoUrl ?? "").trim();
  if (!claveOrigen || claveOrigen.length > 300 || !idViaje || !historialEventoId ||
      (x.idMotoboy != null && !idMotoboy) || !Number.isFinite(Date.parse(evidenciaEn)) || !fotoUrl) {
    throw new Error("entrada_invalida");
  }
  return {
    claveOrigen, idViaje, historialEventoId, idMotoboy,
    driverEvento: String(x.driverEvento ?? "").trim().slice(0, 200) || null,
    evidenciaEn: new Date(evidenciaEn).toISOString(), fotoUrl,
    domicilioDestino: typeof x.domicilioDestino === "string" ? x.domicilioDestino.trim().slice(0, 500) || null : null,
    ...(x.geografia && typeof x.geografia === "object" ? {
      geografia: (() => {
        const g = x.geografia as Record<string, unknown>;
        const evento = puntoEvidencia(g.latitudEvento, g.longitudEvento);
        const destino = puntoEvidencia(g.latitudDestino, g.longitudDestino);
        return {
          estadoEvento: String(g.estadoEvento ?? "").trim().slice(0, 100),
          visitadoEvento: g.visitadoEvento === true || g.visitadoEvento === 1 || g.visitadoEvento === "1",
          distanciaM: distanciaEvidencia(evento, destino),
          latitudEvento: evento?.lat ?? null,
          longitudEvento: evento?.lon ?? null,
          latitudDestino: destino?.lat ?? null,
          longitudDestino: destino?.lon ?? null,
        };
      })(),
    } : {}),
  };
}

export async function procesarEvidencia(entrada: EvidenciaEntrada): Promise<{ estado: string; id?: string }> {
  if (!enVentanaEvidencias()) return { estado: "fuera_de_ventana" };
  const id = await ejecutarRpc<string | null>("evidencia_entrega_reclamar", {
    p_clave_origen: entrada.claveOrigen,
    p_id_viaje: entrada.idViaje,
    p_historial_evento_id: entrada.historialEventoId,
    p_id_motoboy: entrada.idMotoboy,
    p_driver_evento: entrada.driverEvento,
    p_evidencia_en: entrada.evidenciaEn,
  });
  if (!id) return { estado: "ya_procesada" };

  try {
    const foto = await descargarFoto(entrada.fotoUrl);
    const extension = extensionDeMime(foto.mime);
    if (!extension) throw new Error("mime_no_admitido");
    const ruta = `${entrada.evidenciaEn.slice(0, 10)}/${id}.${extension}`;
    const fallaSubida = await subirArchivoServidor(BUCKET_EVIDENCIAS, ruta, foto.buffer, foto.mime);
    if (fallaSubida) throw new Error("fallo_copia_privada");

    const configEntorno = evidenciasConfig();
    if (!configEntorno) throw new Error("falta_evidencias_webhook_secret");
    const { modelo } = configEntorno;
    const resultado = await analizarFoto(foto.buffer, foto.mime, modelo);
    const terminada = await ejecutarRpc<{ ok: boolean; estado?: EstadoGeografico }>("evidencia_entrega_finalizar_visita_mapa", {
      p_id: id, p_foto_ruta: ruta, p_foto_mime: foto.mime, p_foto_bytes: foto.buffer.byteLength,
      p_calidad: resultado.calidad, p_tipo_problema: resultado.tipo_problema,
      p_motivo: resultado.motivo, p_confianza: resultado.confianza, p_modelo: modelo,
      p_tokens_entrada: resultado.tokensEntrada, p_tokens_salida: resultado.tokensSalida,
      p_geografia_recibida: entrada.geografia != null,
      p_estado_evento: entrada.geografia?.estadoEvento ?? null,
      p_distancia_m: entrada.geografia?.distanciaM ?? null,
      p_visitado_evento: entrada.geografia?.visitadoEvento ?? false,
      p_domicilio_destino: entrada.domicilioDestino ?? null,
      p_latitud_evento: entrada.geografia?.latitudEvento ?? null,
      p_longitud_evento: entrada.geografia?.longitudEvento ?? null,
      p_latitud_destino: entrada.geografia?.latitudDestino ?? null,
      p_longitud_destino: entrada.geografia?.longitudDestino ?? null,
    });
    if (!terminada?.ok) throw new Error("reclamo_perdido");

    return { estado: resultado.calidad === "DUDOSA" || terminada.estado === "FUERA_DEL_RANGO" ? "pendiente_revision" : "analizada", id };
  } catch (error) {
    await ejecutarRpc("evidencia_entrega_fallar", { p_id: id, p_codigo: codigoDeError(error) }).catch(() => false);
    throw error;
  }
}

async function descargarFoto(origen: string): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const configEntorno = evidenciasConfig();
  if (!configEntorno) throw new Error("falta_evidencias_webhook_secret");
  const { hostsOrigen, maxBytes } = configEntorno;
  let url = new URL(origen);
  for (let salto = 0; salto <= 3; salto += 1) {
    if (url.protocol !== "https:" || !hostsOrigen.has(url.hostname.toLowerCase())) throw new Error("origen_no_permitido");
    const respuesta = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if ([301, 302, 303, 307, 308].includes(respuesta.status)) {
      const destino = respuesta.headers.get("location");
      if (!destino || salto === 3) throw new Error("redireccion_no_permitida");
      url = new URL(destino, url);
      continue;
    }
    if (!respuesta.ok) throw new Error(`descarga_http_${respuesta.status}`);
    const largo = Number(respuesta.headers.get("content-length") ?? 0);
    if (largo > maxBytes) throw new Error("foto_demasiado_grande");
    const mime = (respuesta.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!extensionDeMime(mime)) throw new Error("mime_no_admitido");
    const buffer = await respuesta.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) throw new Error("tamano_no_admitido");
    return { buffer, mime };
  }
  throw new Error("redireccion_no_permitida");
}

async function analizarFoto(buffer: ArrayBuffer, mime: string, modelo: string): Promise<ResultadoVision> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("falta_openai_api_key");
  const base64 = Buffer.from(buffer).toString("base64");
  const primera = await solicitarAnalisisFoto({
    apiKey, base64, mime, modelo, detalle: "low",
    instruccion: "Evaluá si la imagen es una evidencia visual utilizable. No evalúes fraude, identidad ni si demuestra una entrega. Respondé ACEPTABLE y NINGUNO cuando se pueda distinguir al menos uno de estos elementos: un paquete o etiqueta reconocible; un chat o conversación; una captura de Mercado Libre; un registro o pantalla de llamada; o un domicilio, fachada, puerta o acceso. Para chats, Mercado Libre y llamadas basta con reconocer el tipo de captura: el texto puede ser ilegible o estar cortado y no necesita mencionar una entrega. Un domicilio visible es suficiente aunque no se vea numeración, persona ni paquete. No exijas contexto que vincule la imagen con una entrega ni una persona receptora. La poca luz, el desenfoque o el recorte solo justifican DUDOSA cuando son tan severos que impiden reconocer cualquier elemento útil. Respondé DUDOSA únicamente si la imagen completa es inutilizable o no permite distinguir qué muestra. No uses ILEGIBLE solo porque no pueda leerse el texto de una captura. No infieras datos ni repitas textos, nombres, teléfonos o direcciones. El motivo debe ser breve, concreto y sin datos personales.",
  });
  if (primera.calidad === "ACEPTABLE") return primera;

  // Una duda en baja resolución no alcanza para alertar: se verifica nuevamente
  // con más detalle para reducir falsos positivos sin encarecer todas las fotos.
  const verificacion = await solicitarAnalisisFoto({
    apiKey, base64, mime, modelo, detalle: "high",
    instruccion: "Verificá de forma conservadora una posible falsa alerta de calidad. Hacé una evaluación independiente y no supongas que la imagen es mala. Respondé ACEPTABLE y NINGUNO si podés reconocer cualquier elemento visual útil, por ejemplo una persona, un paquete o etiqueta, una puerta, acceso, domicilio o fachada, un chat, una captura de Mercado Libre o una pantalla de llamada. La imagen no necesita demostrar una entrega y puede estar algo desenfocada, oscura, recortada o tener texto ilegible. DUDOSA se reserva exclusivamente para una degradación severa de toda la imagen que impida reconocer qué muestra. Si se distinguen una persona con un paquete o un domicilio, necesariamente es ACEPTABLE. No infieras datos ni repitas textos, nombres, teléfonos o direcciones. El motivo debe ser breve, concreto y sin datos personales.",
  });
  return {
    ...verificacion,
    tokensEntrada: sumarTokens(primera.tokensEntrada, verificacion.tokensEntrada),
    tokensSalida: sumarTokens(primera.tokensSalida, verificacion.tokensSalida),
  };
}

async function solicitarAnalisisFoto({
  apiKey, base64, mime, modelo, detalle, instruccion,
}: {
  apiKey: string;
  base64: string;
  mime: string;
  modelo: string;
  detalle: "low" | "high";
  instruccion: string;
}): Promise<ResultadoVision> {
  const respuesta = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      input: [{ role: "user", content: [
        { type: "input_text", text: instruccion },
        { type: "input_image", image_url: `data:${mime};base64,${base64}`, detail: detalle },
      ] }],
      text: { format: { type: "json_schema", name: "calidad_evidencia", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: {
          calidad: { type: "string", enum: ["ACEPTABLE", "DUDOSA"] },
          tipo_problema: { type: "string", enum: ["BORROSA", "OSCURA", "CORTADA", "ILEGIBLE", "PAQUETE_NO_DISTINGUIBLE", "OTRO", "NINGUNO"] },
          motivo: { type: "string" }, confianza: { type: "number", minimum: 0, maximum: 1 },
        }, required: ["calidad", "tipo_problema", "motivo", "confianza"],
      } } },
      max_output_tokens: 180,
    }),
    signal: AbortSignal.timeout(45_000), cache: "no-store",
  });
  if (!respuesta.ok) throw new Error(`modelo_http_${respuesta.status}`);
  const cuerpo = await respuesta.json() as Record<string, unknown>;
  const texto = extraerTexto(cuerpo);
  const resultado = JSON.parse(texto) as Omit<ResultadoVision, "tokensEntrada" | "tokensSalida">;
  const tipos = ["BORROSA", "OSCURA", "CORTADA", "ILEGIBLE", "PAQUETE_NO_DISTINGUIBLE", "OTRO", "NINGUNO"];
  if (!["ACEPTABLE", "DUDOSA"].includes(resultado.calidad) || !tipos.includes(resultado.tipo_problema) ||
      typeof resultado.motivo !== "string" || typeof resultado.confianza !== "number") throw new Error("respuesta_modelo_invalida");
  const usage = (cuerpo.usage ?? {}) as Record<string, unknown>;
  const calidad = resultado.calidad;
  return {
    ...resultado,
    calidad,
    tipo_problema: calidad === "ACEPTABLE"
      ? "NINGUNO"
      : resultado.tipo_problema === "NINGUNO" ? "OTRO" : resultado.tipo_problema,
    motivo: resultado.motivo.replace(/\s+/g, " ").trim().slice(0, 500),
    confianza: Math.max(0, Math.min(1, resultado.confianza)),
    tokensEntrada: Number(usage.input_tokens) || null, tokensSalida: Number(usage.output_tokens) || null,
  };
}

function sumarTokens(a: number | null, b: number | null): number | null {
  return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
}

function extraerTexto(cuerpo: Record<string, unknown>): string {
  if (typeof cuerpo.output_text === "string") return cuerpo.output_text;
  const salida = Array.isArray(cuerpo.output) ? cuerpo.output : [];
  for (const item of salida) {
    const contenidos = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const contenido of contenidos) {
      const texto = (contenido as { text?: unknown }).text;
      if (typeof texto === "string") return texto;
    }
  }
  throw new Error("modelo_sin_salida");
}

export async function cargarPanelEvidencias(): Promise<{
  pendientesHoy: EvidenciaPanel[];
  pendientesAnteriores: EvidenciaPanel[];
  revisadasRecientes: EvidenciaPanel[];
  geografiaReciente: EvidenciaPanel[];
  scores: ScoreDriver[];
  config: Configuracion;
}> {
  const [pendientes, revisadas, scores, configFilas, drivers, recientes] = await Promise.all([
    consultarTodo<RevisionFila>(TABLA_EVIDENCIAS_REVISION, { estado_proceso: "eq.PENDIENTE_REVISION" }, "evidencia_en.desc"),
    consultarFresco<RevisionFila>(TABLA_EVIDENCIAS_REVISION, {
      estado_proceso: "eq.REVISADA", vence_en: `gt.${new Date().toISOString()}`,
      order: "revisada_en.desc", limit: "50",
    }),
    consultarFresco<Record<string, unknown>>(VISTA_EVIDENCIAS_SCORE, { order: "proporcion_malas.desc", limit: "200" }),
    consultarFresco<Configuracion>(TABLA_EVIDENCIAS_CONFIG, { id: "eq.true", limit: "1" }),
    consultarFresco<{ id_motoboy: number; nombre: string | null }>(TABLA_DRIVERS_ACTIVOS, { select: "id_motoboy,nombre", limit: "1000" }).catch(() => []),
    consultarFresco<RevisionFila>(TABLA_EVIDENCIAS_REVISION, {
      estado_proceso: "in.(ANALIZADA,PENDIENTE_REVISION,REVISADA)",
      vence_en: `gt.${new Date().toISOString()}`, order: "analizada_en.desc,id.desc", limit: "50",
    }),
  ]);
  const nombres = new Map(drivers.map((d) => [Number(d.id_motoboy), d.nombre?.trim() || `Driver #${d.id_motoboy}`]));
  const filasConFoto = [...pendientes, ...revisadas, ...recientes];
  // Solo completa la dirección visible; jamás usa estado, visita o GPS actuales
  // para recalcular una evidencia histórica. Consultas acotadas, no una por ID.
  const sinDomicilio = [...new Set(filasConFoto.filter((p) => !p.domicilio_destino?.trim()).map((p) => Number(p.id_viaje)))];
  const direccionesActuales = new Map<number, string>();
  for (let i = 0; i < sinDomicilio.length; i += 100) {
    const ids = sinDomicilio.slice(i, i + 100);
    const referencias = await consultarFresco<{ id_viaje: number; direccion: string | null }>(TABLA_TRACKER_PAQUETES, {
      select: "id_viaje,direccion", id_viaje: `in.(${ids.join(",")})`, limit: String(ids.length),
    });
    for (const referencia of referencias) if (referencia.direccion?.trim()) direccionesActuales.set(Number(referencia.id_viaje), referencia.direccion.trim());
  }
  const urls = await firmarArchivos(BUCKET_EVIDENCIAS, filasConFoto.flatMap((p) => p.foto_ruta ? [p.foto_ruta] : []), 900);
  const aPanel = (p: RevisionFila): EvidenciaPanel => ({
    id: p.id, idViaje: Number(p.id_viaje), idMotoboy: p.id_motoboy == null ? null : Number(p.id_motoboy),
    driver: p.driver_evento || (p.id_motoboy ? nombres.get(Number(p.id_motoboy)) : null) || "Driver sin resolver",
    evidenciaEn: p.evidencia_en, tipoProblema: p.tipo_problema_modelo, motivo: p.motivo_modelo || "Sin detalle",
    confianza: p.confianza_modelo == null ? null : Number(p.confianza_modelo), observacion: p.modo_observacion,
    fotoUrl: p.foto_ruta ? urls.get(p.foto_ruta) ?? null : null,
    decision: p.decision_humana, revisadaPor: p.revisada_por, revisadaEn: p.revisada_en,
    comentarioRevision: p.comentario_revision,
    estadoGeografico: p.estado_geografico ?? "NO_EVALUADA",
    distanciaM: p.distancia_entrega_m == null ? null : Number(p.distancia_entrega_m),
    radioM: p.radio_geografico_m == null ? null : Number(p.radio_geografico_m),
    domicilio: p.domicilio_destino?.trim() || direccionesActuales.get(Number(p.id_viaje)) || null,
    domicilioActual: !p.domicilio_destino?.trim() && direccionesActuales.has(Number(p.id_viaje)),
    estadoEvento: p.estado_evento?.trim() || null,
    visitadoEvento: p.visitado_evento ?? null,
    calidadVisual: p.calidad_modelo ?? null,
    puntoEvento: puntoEvidencia(p.latitud_evento, p.longitud_evento),
    puntoDestino: puntoEvidencia(p.latitud_destino, p.longitud_destino),
  });
  const paneles = pendientes.map(aPanel);
  const hoy = diaEvidencias();
  return {
    pendientesHoy: paneles.filter((p) => diaEvidencias(new Date(p.evidenciaEn)) === hoy),
    pendientesAnteriores: paneles.filter((p) => diaEvidencias(new Date(p.evidenciaEn)) !== hoy),
    revisadasRecientes: revisadas.map(aPanel),
    geografiaReciente: recientes.map(aPanel),
    scores: scores.map((s) => ({
      idMotoboy: Number(s.id_motoboy), driver: nombres.get(Number(s.id_motoboy)) || `Driver #${s.id_motoboy}`,
      total: Number(s.total_revisadas), confirmadas: Number(s.problemas_confirmados), descartadas: Number(s.falsos_positivos),
      inconclusas: Number(s.inconclusas), minimo: Number(s.minimo_muestra_score), muestraSuficiente: Boolean(s.muestra_suficiente),
      score: s.score_calidad == null ? null : Number(s.score_calidad), proporcionMalas: Number(s.proporcion_malas),
    })),
    config: configFilas[0] ?? { modo: "OBSERVACION", minimo_muestra_score: 20, maximo_por_corrida: 20 },
  };
}

export async function alertasEmergentes(): Promise<EvidenciaPanel[]> {
  if (!enVentanaEvidencias()) return [];
  const [config] = await consultarFresco<Configuracion>(TABLA_EVIDENCIAS_CONFIG, { id: "eq.true", limit: "1" });
  if (!config || config.modo !== "ACTIVO") return [];
  const panel = await cargarPanelEvidencias();
  return panel.pendientesHoy.slice(0, 20);
}

export async function limpiarEvidenciasVencidas(): Promise<{ eliminadas: number; fallidas: number }> {
  const filas = await consultarTodo<{ id: string; foto_ruta: string | null }>(TABLA_EVIDENCIAS_REVISION, {
    select: "id,foto_ruta", vence_en: `lte.${new Date().toISOString()}`,
  }, "vence_en.asc,id.asc");
  let eliminadas = 0; let fallidas = 0;
  for (let desde = 0; desde < filas.length; desde += 100) {
    const lote = filas.slice(desde, desde + 100);
    const rutas = lote.flatMap((fila) => fila.foto_ruta ? [fila.foto_ruta] : []);
    if (await borrarArchivos(BUCKET_EVIDENCIAS, rutas)) { fallidas += lote.length; continue; }
    for (let sub = 0; sub < lote.length; sub += 20) {
      const resultados = await Promise.all(lote.slice(sub, sub + 20).map((fila) =>
        ejecutarRpc<boolean>("evidencia_entrega_eliminar_operativa", { p_id: fila.id }).catch(() => false),
      ));
      eliminadas += resultados.filter(Boolean).length;
      fallidas += resultados.filter((ok) => !ok).length;
    }
  }
  return { eliminadas, fallidas };
}

function codigoDeError(error: unknown): string {
  return (error instanceof Error ? error.message : "error_desconocido")
    .toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) || "error_desconocido";
}
