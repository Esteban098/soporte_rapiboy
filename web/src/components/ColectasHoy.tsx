"use client";

import { useMemo } from "react";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_FASE,
  alertasDelDia,
  nombreDeRepartidor,
  paquetesDe,
  prepararColecta,
  totalesDelDia,
  type ColectasDelDia,
} from "@/lib/colectas-vivo";
import { diaLargo, numero, porcentaje } from "@/lib/formato";
import { Card, Callout, Kpi } from "./Card";
import { Tabla, type Columna, type Fila, type Filtro } from "./Tabla";
import { GraficoDinamico } from "./charts/GraficoDinamico";
import estilos from "./ui.module.css";

const ID = "colectas-de-hoy";

const COLUMNAS: Columna[] = [
  { clave: "colecta", titulo: "Colecta", tipo: "numero" },
  { clave: "tienda", titulo: "Comercio", tipo: "tienda" },
  { clave: "punto", titulo: "Punto de retiro", tipo: "tienda" },
  { clave: "fase", titulo: "Etapa", tipo: "texto" },
  { clave: "estado", titulo: "Estado", tipo: "texto" },
  { clave: "repartidor", titulo: "Repartidor", tipo: "texto" },
  { clave: "esperados", titulo: "En pedido", tipo: "numero" },
  { clave: "retirados", titulo: "Retirados", tipo: "numero" },
  { clave: "bodega", titulo: "En bodega", tipo: "numero" },
  { clave: "faltantes", titulo: "Faltantes", tipo: "numero" },
];

const FILTROS: Filtro[] = [
  { clave: "fase", etiqueta: "Etapa" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "repartidor", etiqueta: "Repartidor" },
  { clave: "punto", etiqueta: "Punto de retiro" },
];

/** Jornada de colectas, con la tabla y los gráficos atados al mismo filtro. */
export function ColectasHoy({ dia }: { dia: ColectasDelDia }) {
  const totales = useMemo(() => totalesDelDia(dia), [dia]);
  const alertas = useMemo(() => alertasDelDia(dia, null), [dia]);
  const filas = useMemo<Fila[]>(() => {
    const drivers = new Map(dia.drivers.map((driver) => [driver.id_motoboy, driver]));
    return dia.colectas.map((fila) => {
      const colecta = prepararColecta(fila, dia.lugarDeColecta);
      const paquetes = paquetesDe(colecta);
      return {
        id: colecta.id_colecta,
        colecta: colecta.id_colecta,
        tienda: colecta.seller ?? "Sin comercio",
        punto: colecta.lugar ?? colecta.seller ?? "Sin punto",
        fase: ETIQUETA_FASE[colecta.fase],
        estado: ETIQUETA_ESTADO[colecta.estado],
        repartidor: nombreDeRepartidor(drivers.get(colecta.idDriver ?? -1), colecta.idDriver),
        esperados: paquetes.esperados ?? 0,
        retirados: paquetes.retirados,
        bodega: paquetes.enBodega,
        faltantes: paquetes.faltantes ?? 0,
      };
    });
  }, [dia]);

  if (filas.length === 0) {
    return (
      <Callout tono="warning" titulo="Todavía no hay colectas para hoy">
        La foto operativa está vacía. Cuando haya jornada, el flujo de colectas en vivo cargará sus estados y paquetes acá.
      </Callout>
    );
  }

  const pendientes = totales.porFase.PENDIENTE + totales.porFase.EN_CURSO;
  const criticas = alertas.filter((alerta) => alerta.nivel === "critica").length;

  return (
    <section className={estilos.stack} aria-label="Colectas de hoy">
      <div className={estilos.kpis}>
        <Kpi etiqueta="Colectas de hoy" valor={numero(totales.colectas)} nota={`${diaLargo(dia.dia)} · ${numero(totales.tiendas)} comercios`} />
        <Kpi etiqueta="Por colectar" valor={numero(pendientes)} nota={`${numero(totales.porFase.EN_CURSO)} en camino o en el local`} tono={pendientes > 0 ? "warning" : "neutral"} />
        <Kpi etiqueta="En bodega" valor={numero(totales.porFase.CERRADA)} nota={`${numero(totales.paquetes.enBodega)} paquetes recibidos`} tono="good" />
        <Kpi etiqueta="Integridad" valor={numero(totales.paquetes.retirados - totales.paquetes.faltantes)} nota={totales.paquetes.retirados ? `${porcentaje(((totales.paquetes.retirados - totales.paquetes.faltantes) * 100) / totales.paquetes.retirados)} de paquetes retirados cierran` : "sin paquetes retirados"} tono={totales.paquetes.faltantes > 0 ? "warning" : "neutral"} />
      </div>

      {alertas.length > 0 ? (
        <Callout tono={criticas > 0 ? "critical" : "warning"} titulo={criticas > 0 ? `${criticas} colectas requieren atención` : "Datos para revisar"}>
          {alertas.slice(0, 4).map((alerta) => alerta.texto).join(" · ")}{alertas.length > 4 ? ` · y ${alertas.length - 4} más.` : ""}
        </Callout>
      ) : null}

      <div>
        <Card titulo="Estado de la jornada" nota="Se recalcula con los filtros y la búsqueda de la tabla de abajo.">
          <GraficoDinamico
            id={ID}
            filas={filas}
            columnas={COLUMNAS}
            filtros={FILTROS}
            titulo="Colectas de hoy"
            dimensiones={[
              { clave: "fase", etiqueta: "Etapa" },
              { clave: "estado", etiqueta: "Estado" },
            ]}
            medidas={[
              { clave: "colectas", etiqueta: "Colectas", vale: () => 1 },
              { clave: "faltantes", etiqueta: "Paquetes faltantes", vale: (fila) => Number(fila.faltantes ?? 0) },
            ]}
          />
        </Card>
      </div>

      <Card titulo="Colectas de hoy" nota="Estados y paquetes de la última foto operativa. La tabla se puede buscar, filtrar, ordenar e imprimir.">
        <Tabla
          id={ID}
          titulo="Colectas de hoy"
          columnas={COLUMNAS}
          filas={filas}
          filtros={FILTROS}
          ordenInicial={{ clave: "colecta", asc: false }}
          limite={40}
          vacio="No hay colectas en la jornada elegida."
        />
      </Card>
    </section>
  );
}
