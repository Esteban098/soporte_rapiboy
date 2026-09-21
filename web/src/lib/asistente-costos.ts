/**
 * Cuánto cuesta una pregunta al asistente, y cuánto se gastó en total.
 *
 * Módulo puro: lo usa el servidor al registrar cada pregunta y lo prueba
 * `npm run test:asistente` sin red.
 */

/**
 * Precios de OpenAI en dólares por millón de tokens: entrada, entrada en
 * caché y salida. Verificados en developers.openai.com/api/docs/pricing en
 * septiembre de 2026.
 *
 * Es una estimación y se guarda con cada pregunta: si OpenAI cambia sus
 * precios, se actualiza esta tabla y lo ya gastado no se reescribe. Un modelo
 * que no está acá se registra con costo `null` —«sin precio»—, nunca en cero.
 */
export const PRECIOS: Record<string, { entrada: number; cache: number; salida: number }> = {
  "gpt-5-mini": { entrada: 0.25, cache: 0.025, salida: 2 },
  "gpt-5": { entrada: 1.25, cache: 0.125, salida: 10 },
  "gpt-5.1": { entrada: 1.25, cache: 0.125, salida: 10 },
  "gpt-5.2": { entrada: 1.75, cache: 0.175, salida: 14 },
  "gpt-4.1": { entrada: 2, cache: 0.5, salida: 8 },
  "gpt-4.1-mini": { entrada: 0.4, cache: 0.1, salida: 1.6 },
  "gpt-4o-mini": { entrada: 0.15, cache: 0.075, salida: 0.6 },
};

export type UsoTokens = { entrada: number; cache: number; salida: number };

/**
 * Costo estimado en dólares. `entrada` incluye los tokens en caché —así los
 * informa OpenAI—, que se cobran aparte y más baratos.
 */
export function costoEstimado(modelo: string, uso: UsoTokens): number | null {
  const precio = PRECIOS[modelo];
  if (!precio) return null;
  const cache = Math.min(uso.cache, uso.entrada);
  const dolares =
    ((uso.entrada - cache) * precio.entrada + cache * precio.cache + uso.salida * precio.salida) / 1_000_000;
  return Math.round(dolares * 1_000_000) / 1_000_000;
}

/** Una fila de `asistente_uso`, tal como la devuelve PostgREST. */
export type FilaUso = {
  email: string;
  dia: string;
  created_at: string;
  modelo: string;
  ok: boolean;
  tokens_entrada: number;
  tokens_cache: number;
  tokens_salida: number;
  /** PostgREST devuelve `numeric` como número; `null` si el modelo no tenía precio. */
  costo_usd: number | string | null;
};

export type UsoPorPersona = {
  email: string;
  consultas: number;
  fallidas: number;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  /** Preguntas de un modelo sin precio conocido: su costo no está sumado. */
  sinPrecio: number;
  ultima: string | null;
};

/** Agrupa por persona, de quien más gastó a quien menos. */
export function usoPorPersona(filas: FilaUso[]): UsoPorPersona[] {
  const personas = new Map<string, UsoPorPersona>();
  for (const fila of filas) {
    const actual = personas.get(fila.email) ?? {
      email: fila.email,
      consultas: 0,
      fallidas: 0,
      tokensEntrada: 0,
      tokensSalida: 0,
      costoUsd: 0,
      sinPrecio: 0,
      ultima: null,
    };
    const costo = fila.costo_usd == null ? null : Number(fila.costo_usd);

    actual.consultas += 1;
    if (!fila.ok) actual.fallidas += 1;
    actual.tokensEntrada += fila.tokens_entrada;
    actual.tokensSalida += fila.tokens_salida;
    if (costo == null || !Number.isFinite(costo)) actual.sinPrecio += 1;
    else actual.costoUsd += costo;
    if (!actual.ultima || fila.created_at > actual.ultima) actual.ultima = fila.created_at;

    personas.set(fila.email, actual);
  }
  return [...personas.values()].sort((a, b) => b.costoUsd - a.costoUsd || b.consultas - a.consultas);
}
