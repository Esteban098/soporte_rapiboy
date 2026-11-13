import type { Devolucion } from "@/lib/devoluciones-datos";
import type { Columna } from "@/components/Tabla";
import { MetricasDevoluciones } from "@/components/MetricasDevoluciones";
import { horasDevolucion, horasPendientesDevolucion } from "@/lib/devoluciones-metricas";

const columnas: Columna[] = [
  { clave: "id", titulo: "Viaje", tipo: "viaje" },
  { clave: "primera", titulo: "Primera devolución" },
  { clave: "ultima", titulo: "Última devolución" },
  { clave: "devuelto", titulo: "Fecha Devuelto" },
  { clave: "horasResolucion", titulo: "Tiempo hasta Devuelto", tipo: "duracion" },
  { clave: "horasPendiente", titulo: "Tiempo pendiente", tipo: "duracion" },
  { clave: "estado", titulo: "Estado actual", tipo: "estado" },
  { clave: "repartidor", titulo: "Driver" },
  { clave: "tienda", titulo: "Seller", tipo: "tienda" },
  { clave: "poligono", titulo: "Polígono" },
  { clave: "destino", titulo: "Destino" },
  { clave: "mes", titulo: "Mes" },
];

function fecha(valor: string | null | undefined) {
  if (!valor) return "—";
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short",
  }).format(fecha) + " hs arg";
}

export function PanelDevoluciones({ filas, id = "devoluciones-operacion" }: { filas: Devolucion[]; id?: string }) {
  const ahora = new Date().toISOString();
  return <MetricasDevoluciones id={id} columnas={columnas}
    filtros={[{ clave: "estado", etiqueta: "Estado" }, { clave: "repartidor", etiqueta: "Driver" }, { clave: "tienda", etiqueta: "Seller" }]}
    filas={filas.map((fila) => ({
      id: fila.id, primera: fecha(fila.primera_devolucion), ultima: fecha(fila.ultima_devolucion),
      devuelto: fecha(fila.fecha_devuelto), fechaDevueltoISO: fila.fecha_devuelto ?? null,
      horasResolucion: horasDevolucion(fila.primera_devolucion, fila.fecha_devuelto),
      horasPendiente: horasPendientesDevolucion(fila.primera_devolucion, fila.estado, fila.fecha_devuelto, ahora),
      estado: fila.estado, repartidor: fila.repartidor, tienda: fila.tienda,
      poligono: fila.poligono, destino: fila.destino, mes: fila.mes.slice(0, 7),
    }))} />;
}
