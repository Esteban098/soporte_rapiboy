import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  BUCKET_EVIDENCIAS,
  TABLA_DRIVERS_ACTIVOS,
  TABLA_EVIDENCIAS_CONFIG,
  TABLA_EVIDENCIAS_REVISION,
  VISTA_EVIDENCIAS_SCORE,
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
import { enVentanaEvidencias, extensionDeMime } from "./evidencias-reglas";

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
};

type Configuracion = {
  modo: "OBSERVACION" | "ACTIVO";
  minimo_muestra_score: number;
  maximo_por_corrida: number;
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
    const terminada = await ejecutarRpc<boolean>("evidencia_entrega_finalizar", {
      p_id: id, p_foto_ruta: ruta, p_foto_mime: foto.mime, p_foto_bytes: foto.buffer.byteLength,
      p_calidad: resultado.calidad, p_tipo_problema: resultado.tipo_problema,
      p_motivo: resultado.motivo, p_confianza: resultado.confianza, p_modelo: modelo,
      p_tokens_entrada: resultado.tokensEntrada, p_tokens_salida: resultado.tokensSalida,
    });
    if (!terminada) throw new Error("reclamo_perdido");

    return { estado: resultado.calidad === "DUDOSA" ? "pendiente_revision" : "analizada", id };
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
  const respuesta = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      input: [{ role: "user", content: [
        { type: "input_text", text: "Evaluá el valor probatorio de esta evidencia de entrega, no fraude ni identidad. Respondé ACEPTABLE y NINGUNO si se ve con claridad al menos una prueba contextual: una persona que recibe o sostiene el paquete; un chat de confirmación o registro de llamada; o el domicilio, fachada o numeración claramente identificable. Esa prueba sigue siendo válida aunque la foto tenga poca luz, algo de desenfoque o encuadre imperfecto, siempre que el contexto se distinga. Respondé DUDOSA si solo se ve el paquete o su etiqueta (SOLO_PAQUETE), si no hay contexto que vincule la entrega (SIN_CONTEXTO_DE_ENTREGA), o si la prueba contextual está demasiado borrosa, oscura, cortada o ilegible. No infieras datos, no leas ni repitas textos, nombres, teléfonos o direcciones. El motivo debe ser breve, concreto y sin datos personales." },
        { type: "input_image", image_url: `data:${mime};base64,${base64}`, detail: "low" },
      ] }],
      text: { format: { type: "json_schema", name: "calidad_evidencia", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: {
          calidad: { type: "string", enum: ["ACEPTABLE", "DUDOSA"] },
          tipo_problema: { type: "string", enum: ["BORROSA", "OSCURA", "CORTADA", "ILEGIBLE", "PAQUETE_NO_DISTINGUIBLE", "SOLO_PAQUETE", "SIN_CONTEXTO_DE_ENTREGA", "OTRO", "NINGUNO"] },
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
  const tipos = ["BORROSA", "OSCURA", "CORTADA", "ILEGIBLE", "PAQUETE_NO_DISTINGUIBLE", "SOLO_PAQUETE", "SIN_CONTEXTO_DE_ENTREGA", "OTRO", "NINGUNO"];
  if (!["ACEPTABLE", "DUDOSA"].includes(resultado.calidad) || !tipos.includes(resultado.tipo_problema) ||
      typeof resultado.motivo !== "string" || typeof resultado.confianza !== "number") throw new Error("respuesta_modelo_invalida");
  const usage = (cuerpo.usage ?? {}) as Record<string, unknown>;
  return {
    ...resultado, motivo: resultado.motivo.replace(/\s+/g, " ").trim().slice(0, 500),
    confianza: Math.max(0, Math.min(1, resultado.confianza)),
    tokensEntrada: Number(usage.input_tokens) || null, tokensSalida: Number(usage.output_tokens) || null,
  };
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

export async function cargarPanelEvidencias(): Promise<{ pendientes: EvidenciaPanel[]; scores: ScoreDriver[]; config: Configuracion }> {
  const [pendientes, scores, configFilas, drivers] = await Promise.all([
    consultarFresco<RevisionFila>(TABLA_EVIDENCIAS_REVISION, { estado_proceso: "eq.PENDIENTE_REVISION", order: "evidencia_en.desc", limit: "100" }),
    consultarFresco<Record<string, unknown>>(VISTA_EVIDENCIAS_SCORE, { order: "proporcion_malas.desc", limit: "200" }),
    consultarFresco<Configuracion>(TABLA_EVIDENCIAS_CONFIG, { id: "eq.true", limit: "1" }),
    consultarFresco<{ id_motoboy: number; nombre: string | null }>(TABLA_DRIVERS_ACTIVOS, { select: "id_motoboy,nombre", limit: "1000" }).catch(() => []),
  ]);
  const nombres = new Map(drivers.map((d) => [Number(d.id_motoboy), d.nombre?.trim() || `Driver #${d.id_motoboy}`]));
  const urls = await firmarArchivos(BUCKET_EVIDENCIAS, pendientes.flatMap((p) => p.foto_ruta ? [p.foto_ruta] : []), 900);
  return {
    pendientes: pendientes.map((p) => ({
      id: p.id, idViaje: Number(p.id_viaje), idMotoboy: p.id_motoboy == null ? null : Number(p.id_motoboy),
      driver: p.driver_evento || (p.id_motoboy ? nombres.get(Number(p.id_motoboy)) : null) || "Driver sin resolver",
      evidenciaEn: p.evidencia_en, tipoProblema: p.tipo_problema_modelo, motivo: p.motivo_modelo || "Sin detalle",
      confianza: p.confianza_modelo == null ? null : Number(p.confianza_modelo), observacion: p.modo_observacion,
      fotoUrl: p.foto_ruta ? urls.get(p.foto_ruta) ?? null : null,
    })),
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
  return panel.pendientes.slice(0, 20);
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
