import assert from "node:assert/strict";
import {
  agruparSeguimientosPorSemana,
  parsearSeguimiento,
  resumirSeguimientos,
  tiempoResolucionMinutos,
  type FilaSeguimiento,
  type Seguimiento,
} from "../src/lib/seguimiento";

function fila(cambios: Partial<FilaSeguimiento> = {}): FilaSeguimiento {
  return {
    id: "reporte-1",
    created_at: "2026-09-07T06:01:00.000Z",
    caso_id: "29202236",
    driver: " Driver Uno ",
    seller: " Seller Uno ",
    comentario_original: "No pudo entregarse",
    resumen_llm: null,
    archivos: [],
    estado: "abierto",
    abierto_en: "2026-09-07T06:00:00.000Z",
    creado_por: "operador@rapiboy.com",
    atendido_por: null,
    atendido_en: null,
    ...cambios,
  };
}

function reporte(id: string, creado: string | null): Seguimiento {
  return parsearSeguimiento(fila({ id, created_at: creado }));
}

// Un estado legado Tomado sigue siendo trabajo pendiente y vuelve a Abierto.
const legado = parsearSeguimiento(fila({ estado: "tomado" }));
assert.equal(legado.estado, "abierto");
assert.equal(legado.driver, "Driver Uno");
assert.equal(legado.seller, "Seller Uno");

const cerrado = parsearSeguimiento(
  fila({
    id: "cerrado",
    estado: "cerrado",
    abierto_en: "2026-09-07T06:00:00.000Z",
    atendido_en: "2026-09-07T08:30:00.000Z",
  }),
);
assert.equal(tiempoResolucionMinutos(cerrado), 150);
assert.equal(resumirSeguimientos([legado, cerrado]).resolucionPromedioMinutos, 150);

// El corte semanal usa Ciudad de México: ambos instantes están en UTC, pero el
// primero todavía es domingo local y el segundo ya es lunes local.
const grupos = agruparSeguimientosPorSemana([
  reporte("lunes", "2026-09-07T06:01:00.000Z"),
  reporte("domingo", "2026-09-07T04:59:00.000Z"),
  reporte("martes", "2026-09-08T12:00:00.000Z"),
]);

assert.deepEqual(
  grupos.map((grupo) => [grupo.clave, grupo.reportes.map((item) => item.id)]),
  [
    ["2026-09-07", ["lunes", "martes"]],
    ["2026-08-31", ["domingo"]],
  ],
);

console.log("Seguimiento: estados y agrupación semanal correctos.");
