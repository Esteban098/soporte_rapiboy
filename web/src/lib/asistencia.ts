/** Reglas puras de asistencia, compartidas por la pantalla y el webhook. */

export type RespuestaAsistencia = "RUTA_Y_COLECTA" | "RUTA" | "NO_ASISTE";

export function respuestaAsistencia(valor: unknown): RespuestaAsistencia | null {
  const texto = String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (["RUTA Y COLECTA", "RUTA Y COLECTAS", "RUTA_COLECTA"].includes(texto)) return "RUTA_Y_COLECTA";
  if (texto === "RUTA") return "RUTA";
  if (["NO ASISTE", "NO ASISTIRE", "NO ASISTO"].includes(texto)) return "NO_ASISTE";
  return null;
}

/** Deja solo dígitos y conserva la convención mexicana del flujo anterior. */
export function telefonoAsistencia(valor: unknown): string | null {
  const telefono = String(valor ?? "").replace(/\D/g, "").replace(/^521/, "52");
  return /^[0-9]{8,18}$/.test(telefono) ? telefono : null;
}

export function fechaOperacionAsistencia(valor: unknown): string | null {
  const fecha = String(valor ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))
    ? fecha
    : null;
}
