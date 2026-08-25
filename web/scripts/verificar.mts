/**
 * Comprueba que la normalización de la web da los mismos números que el
 * análisis en Python sobre el libro original. Corre contra los fixtures.
 */
import { cargarPedidos, cargarCancelaciones, cargarVistasDelDia } from "../src/lib/datos";
import {
  dispersionRepartidores,
  porDia,
  porDiaSemana,
  porLeadTime,
  porVisitas,
  ranking,
  resumen,
  resumenCancelaciones,
} from "../src/lib/metricas";

const pedidos = await cargarPedidos();
const r = resumen(pedidos);

console.log(`casos: ${r.casos}  devoluciones: ${r.devoluciones} (${r.tasaDevolucion.toFixed(1)}%)`);
console.log(`entregados: ${r.entregados}  abiertos: ${r.abiertos}`);
console.log(`período: ${r.desde} .. ${r.hasta}  visitas promedio: ${r.visitasPromedio.toFixed(2)}`);

console.log("\npor día:");
for (const d of porDia(pedidos)) {
  console.log(`  ${d.clave}  casos=${d.casos}  dev=${d.devoluciones}  tasa=${d.tasaDevolucion.toFixed(1)}%`);
}

console.log("\npor visitas:");
for (const t of porVisitas(pedidos)) console.log(`  ${t.tramo}: ${t.casos} casos, ${t.tasaDevolucion.toFixed(1)}%`);

console.log("\npor lead time:");
for (const t of porLeadTime(pedidos)) console.log(`  ${t.tramo}: ${t.casos} casos, ${t.tasaDevolucion.toFixed(1)}%`);

console.log("\npor día:");
for (const t of porDiaSemana(pedidos)) console.log(`  ${t.tramo}: ${t.casos} casos, ${t.tasaDevolucion.toFixed(1)}%`);

const d = dispersionRepartidores(pedidos);
console.log(
  `\ndispersión: ${d.evaluados} repartidores, mediana ${d.mediana.toFixed(1)}%, ` +
    `${d.criticos} críticos con ${d.casosCriticos} casos, ${d.devolucionesEvitables} devoluciones evitables`,
);

console.log("\npeores tiendas:");
for (const f of ranking(pedidos, "tienda", { limite: 5 }))
  console.log(`  ${f.nombre}: ${f.casos} casos, ${f.tasaDevolucion.toFixed(1)}%`);

const vistas = await cargarVistasDelDia();
console.log(
  `\nvistas del día: ayer=${vistas.ayer.length} demorados=${vistas.demorados.length} noEntregados=${vistas.demoradosNoEntregados.length}`,
);

const c = resumenCancelaciones(await cargarCancelaciones());
console.log(
  `cancelaciones: ${c.casos} casos, ${c.conMinutos} con minutos, mediana ${c.medianaMinutos} min, ${c.masDeDosHoras} de más de 2 h`,
);
