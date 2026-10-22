import assert from "node:assert/strict";
import {
  agruparSeguimientos,
  agruparPorResponsableSeguimiento,
  colorDePersona,
  etapaDe,
  inicialesDePersona,
  minutosAbierto,
  moverPeriodo,
  parsearSeguimiento,
  periodoActual,
  periodoValido,
  responsablesDesdeRapiboyData,
  resumirSeguimientos,
  seguimientoVencido,
  tiempoResolucionMinutos,
  type FilaSeguimiento,
  type Seguimiento,
} from "../src/lib/seguimiento";
import {
  aliasMencionados,
  armarDirectorio,
  consultaEnCurso,
  correosMencionados,
  tramosConMenciones,
} from "../src/lib/menciones";

function fila(cambios: Partial<FilaSeguimiento> = {}): FilaSeguimiento {
  return {
    id: "reporte-1",
    created_at: "2026-09-07T06:01:00.000Z",
    caso_id: "29202236",
    driver: " Driver Uno ",
    seller: " Seller Uno ",
    comentario_original: "No pudo entregarse",
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

// Una fila antigua con resumen no reemplaza el comentario original ni lo expone.
const conResumenLegado = parsearSeguimiento({
  ...fila({ comentario_original: "Comentario completo del equipo con @esteban" }),
  ...{ resumen_llm: "Texto generado antiguo" },
});
assert.equal(conResumenLegado.comentario, "Comentario completo del equipo con @esteban");
assert.ok(!("resumen" in conResumenLegado));

// Un valor legado `tomado` en la columna estado sigue siendo trabajo pendiente.
const legado = parsearSeguimiento(fila({ estado: "tomado" }));
assert.equal(legado.estado, "abierto");
assert.equal(etapaDe(legado), "abierto");
assert.equal(legado.driver, "Driver Uno");
assert.equal(legado.seller, "Seller Uno");

// Si faltan responsables, se toman de la respuesta vigente de RapiboyData:
// tienda del viaje y último repartidor no vacío del historial.
assert.deepEqual(
  responsablesDesdeRapiboyData({
    encontrado: true,
    viaje: { tienda: " Seller Sistema ", id_modalidad: 5, id_localidad: 9 },
    historial: [
      { repartidor: "Driver Anterior" },
      { repartidor: null },
      { repartidor: " Driver Vigente " },
    ],
  }),
  { driver: "Driver Vigente", seller: "Seller Sistema" },
);
assert.deepEqual(
  responsablesDesdeRapiboyData({
    encontrado: true,
    viaje: { tienda: "Fuera de alcance", id_modalidad: 7, id_localidad: 9 },
    historial: [{ repartidor: "Otro driver" }],
  }),
  { driver: null, seller: null },
);

// Tomado es `tomado_por` sobre un abierto: cuenta como abierto en los totales.
const tomado = parsearSeguimiento(
  fila({ id: "tomado", tomado_por: "esteban.larcher@rapiboy.com", tomado_en: "2026-09-07T07:00:00.000Z" }),
);
assert.equal(tomado.estado, "abierto");
assert.equal(etapaDe(tomado), "tomado");
assert.equal(inicialesDePersona(tomado.tomadoPor), "EL");
assert.equal(minutosAbierto(tomado, Date.parse("2026-09-07T08:00:00.000Z")), 120);

// Cerrado manda sobre tomado, y el cerrado no tiene antigüedad abierta.
const cerrado = parsearSeguimiento(
  fila({
    id: "cerrado",
    estado: "cerrado",
    tomado_por: "esteban.larcher@rapiboy.com",
    tomado_en: "2026-09-07T07:00:00.000Z",
    abierto_en: "2026-09-07T06:00:00.000Z",
    atendido_en: "2026-09-07T08:30:00.000Z",
  }),
);
assert.equal(etapaDe(cerrado), "cerrado");
assert.equal(minutosAbierto(cerrado, Date.now()), null);
assert.equal(tiempoResolucionMinutos(cerrado), 150);

// La alerta vencida exige más de tres días abiertos y un responsable tomado.
const cuatroDias = Date.parse("2026-09-11T06:00:00.000Z");
assert.equal(seguimientoVencido(tomado, cuatroDias), true);
assert.equal(seguimientoVencido({ ...tomado, tomadoPor: null }, cuatroDias), false);
assert.equal(seguimientoVencido(cerrado, cuatroDias), false);

assert.deepEqual(resumirSeguimientos([legado, tomado, cerrado]), {
  total: 3,
  abiertos: 2,
  sinTomar: 1,
  tomados: 1,
  cerrados: 1,
  resolucionPromedioMinutos: 150,
});

// Lista y tablero usan quien tomó para pendientes y quien cerró para cerrados,
// sin atribuirle responsable a un registro legado que no lo guardó.
const gruposResponsable = agruparPorResponsableSeguimiento([
  legado,
  tomado,
  { ...cerrado, id: "cerrado-tomado", tomadoPor: "esteban.larcher@rapiboy.com", atendidoPor: "operador@rapiboy.com" },
  { ...cerrado, id: "cerrado-sin-responsable", atendidoPor: null },
]);
assert.deepEqual(
  gruposResponsable.map((grupo) => [grupo.etiqueta, grupo.reportes.map((item) => item.id)]),
  [
    ["Sin tomar", ["reporte-1"]],
    ["Cerrado por operador", ["cerrado-tomado"]],
    ["Tomado por esteban.larcher", ["tomado"]],
    ["Sin cierre registrado", ["cerrado-sin-responsable"]],
  ],
);
assert.deepEqual(
  gruposResponsable.map((grupo) => grupo.responsable),
  [null, "operador@rapiboy.com", "esteban.larcher@rapiboy.com", null],
);
assert.match(colorDePersona("esteban.larcher@rapiboy.com"), /--persona-esteban/);
assert.match(colorDePersona("candelaria@rapiboy.com"), /--persona-candelaria/);
assert.notEqual(colorDePersona("esteban@rapiboy.com"), colorDePersona("cande@rapiboy.com"));

// El corte semanal usa Ciudad de México: ambos instantes están en UTC, pero el
// primero todavía es domingo local y el segundo ya es lunes local.
const semanas = agruparSeguimientos([
  reporte("lunes", "2026-09-07T06:01:00.000Z"),
  reporte("domingo", "2026-09-07T04:59:00.000Z"),
  reporte("martes", "2026-09-08T12:00:00.000Z"),
]);

assert.deepEqual(
  semanas.map((grupo) => [grupo.clave, grupo.reportes.map((item) => item.id)]),
  [
    ["2026-09-07", ["lunes", "martes"]],
    ["2026-08-31", ["domingo"]],
  ],
);

// El selector navega períodos calendario estables y solo acepta lunes como
// clave semanal, para que una URL manual no produzca semanas desplazadas.
assert.equal(periodoActual("semana", new Date("2026-09-08T12:00:00Z")), "2026-09-07");
assert.equal(periodoActual("mes", new Date("2026-09-01T03:00:00Z")), "2026-08");
assert.equal(moverPeriodo("semana", "2026-09-07", -1), "2026-08-31");
assert.equal(moverPeriodo("mes", "2026-01", -1), "2025-12");
assert.equal(periodoValido("semana", "2026-09-07"), true);
assert.equal(periodoValido("semana", "2026-09-08"), false);
assert.equal(periodoValido("mes", "2026-13"), false);

// El corte mensual también: 1 de septiembre 03:00 UTC sigue siendo agosto en México.
const meses = agruparSeguimientos(
  [
    reporte("agosto", "2026-09-01T03:00:00.000Z"),
    reporte("septiembre", "2026-09-01T07:00:00.000Z"),
    reporte("sin-fecha", null),
  ],
  "mes",
);

assert.deepEqual(
  meses.map((grupo) => [grupo.clave, grupo.etiqueta, grupo.reportes.map((item) => item.id)]),
  [
    ["2026-09", "Septiembre de 2026", ["septiembre"]],
    ["2026-08", "Agosto de 2026", ["agosto"]],
    ["sin-fecha", "Sin fecha", ["sin-fecha"]],
  ],
);

// Menciones: alias = parte local del correo; los alias ambiguos no resuelven.
const directorio = armarDirectorio([
  { email: "Esteban.Larcher@rapiboy.com", nombre: "Esteban" },
  { email: "ana@rapiboy.com" },
  { email: "ana@otra.com" },
  { email: "luis@rapiboy.com" },
  { email: "luis@rapiboy.com", nombre: "Luis" },
  { email: "local" },
]);
assert.deepEqual(
  directorio.map((persona) => [persona.alias, persona.email, persona.nombre]),
  [
    ["esteban.larcher", "esteban.larcher@rapiboy.com", "Esteban"],
    ["luis", "luis@rapiboy.com", "Luis"],
  ],
);

const texto = "Avisale a @Esteban.Larcher y a @luis. Copia a @ana, no a soporte@rapiboy.com ni @nadie";
assert.deepEqual(aliasMencionados(texto), ["esteban.larcher", "luis", "ana", "nadie"]);
assert.deepEqual(correosMencionados(texto, directorio), [
  "esteban.larcher@rapiboy.com",
  "luis@rapiboy.com",
]);

assert.deepEqual(tramosConMenciones("hola @luis, ¿lo ves?"), [
  { texto: "hola ", alias: null },
  { texto: "@luis", alias: "luis" },
  { texto: ", ¿lo ves?", alias: null },
]);

assert.deepEqual(consultaEnCurso("pasale a @es", 12), { inicio: 9, consulta: "es" });
assert.deepEqual(consultaEnCurso("@", 1), { inicio: 0, consulta: "" });
assert.equal(consultaEnCurso("correo@rap", 10), null);
assert.equal(consultaEnCurso("@luis listo", 11), null);

console.log("Seguimiento: etapas, totales, agrupación y menciones correctos.");
