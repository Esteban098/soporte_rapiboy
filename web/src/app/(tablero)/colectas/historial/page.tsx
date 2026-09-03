import { cargarAsignaciones, cargarColectas } from "@/lib/datos";
import {
  colectasPorDia,
  comerciosCubiertos,
  diasDisponibles,
  porRepartidor,
  resumirDia,
  ESTADOS_COLECTA,
} from "@/lib/colectas";
import { diaCorto, diaLargo, fechaHora, numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { Tabla } from "@/components/Tabla";
import { SelectorDia } from "@/components/SelectorDia";
import { BarrasColectas } from "@/components/charts/BarrasColectas";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Colectas · historial" };

/**
 * Cada colecta de un día, con en qué quedó.
 *
 * Una fila es una colecta —no una visita ni un comercio— así que buscar por
 * nombre de tienda encuentra las suyas. La ventana la define la consulta de
 * n8n —hoy 15 días—, no esta pantalla.
 */
export default async function ColectasHistorial({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const [{ filas: colectas, sinTabla }, { filas: asignaciones }] = await Promise.all([
    cargarColectas(),
    cargarAsignaciones(),
  ]);

  if (sinTabla) {
    return (
      <>
        <PageHead eyebrow="Colectas" titulo="Historial" />
        <Callout tono="warning" titulo="Falta crear las tablas">
          Las tablas de colectas todavía no existen en la base. El script está en
          <code> web/supabase/colectas.sql</code>: se corre una vez desde el SQL Editor de
          Supabase, y después el flujo <code>06-colectas</code> las llena solo.
        </Callout>
      </>
    );
  }

  const dias = diasDisponibles(colectas);

  if (dias.length === 0) {
    return (
      <>
        <PageHead eyebrow="Colectas" titulo="Historial" flujo="colectas" />
        <Callout tono="warning" titulo="Todavía no hay colectas cargadas">
          La tabla existe pero está vacía. El flujo <code>06-colectas</code> corre a las 12:00 de
          lunes a viernes; con el botón de arriba se puede pedir la corrida ahora.
        </Callout>
      </>
    );
  }

  const pedido = (await searchParams).dia;
  // Cualquier cosa que no sea un día con datos cae en el más reciente, en vez
  // de dejar la pantalla vacía sin explicar por qué.
  const dia = pedido && dias.includes(pedido) ? pedido : dias[0];

  const delDia = colectas.filter((c) => c.fecha === dia);
  const datos = resumirDia(delDia);
  const serie = colectasPorDia(colectas);
  const repartidores = porRepartidor(delDia);

  /*
   * El renglón por comercio es derivado, no un registro.
   *
   * El sistema no guarda una colecta por tienda: las que entregan en un dropOFF
   * se retiran en una sola visita al punto. Sin este cruce, buscar el nombre de
   * esas tiendas no devuelve nada aunque su mercadería haya salido.
   */
  const cubiertos = comerciosCubiertos(asignaciones, delDia);
  const conPuntoVisitado = cubiertos.filter((c) => c.colectado).length;

  const cumplimiento =
    datos.paquetesSolicitados > 0
      ? (datos.paquetesColectados / datos.paquetesSolicitados) * 100
      : 0;

  /*
   * Las filas de todos los días de la ventana, no solo las del elegido.
   *
   * El gráfico muestra la serie entera, así que para poder abrir cualquier
   * barra hace falta tener sus colectas. Las del día que se está mirando salen
   * de filtrar este mismo arreglo: son las mismas referencias, así que no
   * viajan dos veces al cliente.
   */
  const COLUMNAS_COLECTA = [
    { clave: "fechaCorta", titulo: "Día", tipo: "texto" as const },
    { clave: "seller", titulo: "Comercio", tipo: "texto" as const },
    { clave: "estado", titulo: "Estado", tipo: "texto" as const },
    { clave: "repartidor", titulo: "Repartidor", tipo: "texto" as const },
    { clave: "solicitados", titulo: "Solicitados", tipo: "numero" as const },
    { clave: "colectados", titulo: "Retirados", tipo: "numero" as const },
    { clave: "bultos", titulo: "Bultos", tipo: "numero" as const },
    { clave: "solicitud", titulo: "Pedida", tipo: "texto" as const },
    { clave: "retiro", titulo: "Retirada", tipo: "texto" as const },
    { clave: "deposito", titulo: "En depósito", tipo: "texto" as const },
    { clave: "comentario", titulo: "Comentario", tipo: "texto" as const },
    { clave: "direccion", titulo: "Dirección", tipo: "texto" as const },
    { clave: "telefono", titulo: "Teléfono", tipo: "texto" as const },
  ];

  const todasLasFilas = colectas.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    fechaCorta: diaCorto(c.fecha),
    seller: c.seller,
    estado: c.estado,
    repartidor: c.repartidor || "Sin asignar",
    solicitados: c.paquetesSolicitados,
    colectados: c.paquetesColectados,
    bultos: c.bultos,
    solicitud: fechaHora(c.solicitud),
    retiro: fechaHora(c.colecta),
    deposito: fechaHora(c.llegoDeposito),
    comentario: c.comentario,
    direccion: c.direccionSeller,
    telefono: c.telefonoSeller,
  }));

  const filas = todasLasFilas.filter((f) => f.fecha === dia);

  return (
    <>
      <PageHead
        eyebrow={`Colectas · ${diaLargo(dia)}`}
        titulo="Historial"
        flujo="colectas"
        dek="Cada colecta pedida en el día y en qué quedó: si se retiró, si llegó al depósito o si se canceló. Se guardan los últimos 15 días. Una fila es una colecta, así que buscando el nombre de un comercio salen las suyas."
      />

      <Card
        titulo="Día"
        nota="Solo aparecen los días con colectas cargadas: los domingos y feriados no están, así que un hueco en la lista no es un dato faltante."
      >
        <SelectorDia dias={dias} actual={dia} />
      </Card>

      <div className={estilos.kpis}>
        <Kpi etiqueta="Colectas" valor={numero(datos.colectas)} nota={diaLargo(dia)} />
        <Kpi
          etiqueta="Comercios cubiertos"
          valor={numero(conPuntoVisitado)}
          nota={`de ${numero(cubiertos.length)} con chofer · ${numero(datos.sellers)} puntos visitados`}
        />
        <Kpi
          etiqueta="Paquetes retirados"
          valor={numero(datos.paquetesColectados)}
          nota={`de ${numero(datos.paquetesSolicitados)} solicitados · ${porcentaje(cumplimiento)}`}
          tono={cumplimiento >= 95 ? "good" : cumplimiento < 80 ? "bad" : "neutral"}
        />
        <Kpi
          etiqueta="Canceladas"
          valor={numero(datos.canceladas)}
          tono={datos.canceladas > 0 ? "bad" : "good"}
          nota={`${numero(datos.pendientes)} siguen pendientes`}
        />
        <Kpi
          etiqueta="Sin repartidor"
          valor={numero(datos.sinRepartidor)}
          tono={datos.sinRepartidor > 0 ? "bad" : "good"}
          nota="pedidas y todavía sin asignar"
        />
      </div>

      <div className={estilos.stack}>
        {datos.incompletas > 0 ? (
          <Callout tono="warning" titulo="Colectas que retiraron menos de lo pedido">
            {numero(datos.incompletas)} colectas figuran hechas pero levantaron menos paquetes de
            los que el comercio había cargado. Contadas como colectas cumplidas se ven bien; lo que
            queda es mercadería que no salió. Se filtran ordenando la tabla por «solicitados» y
            comparando con «retirados».
          </Callout>
        ) : null}

        <Card
          titulo="Colectas por día"
          nota="Los días que trae la consulta, para ubicar el elegido dentro de la serie. Los días sin colectas no aparecen."
        >
          <BarrasColectas
            datos={serie}
            destacado={dia}
            detalle={{
              titulo: "Colectas de la ventana",
              columnas: COLUMNAS_COLECTA,
              filas: todasLasFilas,
            }}
          />
        </Card>

        <Card
          titulo={`Colectas del ${diaCorto(dia)}`}
          nota="Una fila por colecta. Se busca por comercio o repartidor, y se filtra por estado. Las columnas de dirección, teléfono y comentario están ocultas de entrada: se muestran desde el menú «Columnas»."
        >
          <Tabla
            id="colectas-dia-detalle"
            titulo={`Colectas · ${diaLargo(dia)}`}
            columnas={COLUMNAS_COLECTA.filter((c) => c.clave !== "fechaCorta")}
            filas={filas}
            filtros={[
              { clave: "estado", etiqueta: "Estado", opciones: [...ESTADOS_COLECTA] },
              { clave: "repartidor", etiqueta: "Repartidor" },
            ]}
            ordenInicial={{ clave: "seller", asc: true }}
            limite={40}
            vacio="No hubo colectas ese día."
          />
        </Card>

        <Card
          titulo={`Comercios el ${diaCorto(dia)}`}
          nota="Un renglón por comercio con chofer habitual, para poder buscar por nombre. Ojo con lo que significa «colectado»: cuando el comercio entrega en un dropOFF, el sistema registra una sola colecta contra el punto, no una por tienda. Así que acá quiere decir «alguien pasó por su punto de retiro», y los paquetes son los del punto entre todos los que lo comparten, no los de esa tienda."
        >
          <Tabla
            id="colectas-dia-comercios"
            titulo={`Comercios · ${diaLargo(dia)}`}
            columnas={[
              { clave: "seller", titulo: "Comercio", tipo: "texto" },
              { clave: "estado", titulo: "Su punto", tipo: "texto" },
              { clave: "repartidor", titulo: "Pasó ese día", tipo: "texto" },
              { clave: "habitual", titulo: "Chofer habitual", tipo: "texto" },
              { clave: "lugar", titulo: "Punto de retiro", tipo: "texto" },
              { clave: "comparten", titulo: "Comercios en el punto", tipo: "numero" },
              { clave: "paquetes", titulo: "Paquetes del punto", tipo: "numero" },
            ]}
            filas={cubiertos.map((c) => ({
              id: c.idUsuario,
              seller: c.seller,
              estado: c.colectado ? "Visitado" : "Sin visitar",
              repartidor: c.repartidorDelDia ?? "—",
              habitual: c.choferHabitual,
              lugar: c.lugarColecta,
              comparten: c.compartenPunto,
              paquetes: c.paquetesDelPunto,
            }))}
            filtros={[
              { clave: "estado", etiqueta: "Su punto", opciones: ["Visitado", "Sin visitar"] },
              { clave: "repartidor", etiqueta: "Pasó ese día" },
              { clave: "lugar", etiqueta: "Punto de retiro" },
            ]}
            ordenInicial={{ clave: "seller", asc: true }}
            limite={40}
            vacio="Todavía no hay asignaciones cargadas."
          />
        </Card>

        <Card
          titulo="Por repartidor"
          nota="Qué hizo cada uno ese día. Las colectas sin repartidor asignado no entran acá; se ven en el KPI de arriba."
        >
          <Tabla
            id="colectas-dia-repartidores"
            titulo={`Repartidores · ${diaLargo(dia)}`}
            columnas={[
              { clave: "repartidor", titulo: "Repartidor", tipo: "texto" },
              { clave: "colectas", titulo: "Colectas", tipo: "numero" },
              { clave: "sellers", titulo: "Comercios", tipo: "numero" },
              { clave: "paquetes", titulo: "Paquetes retirados", tipo: "numero" },
              { clave: "canceladas", titulo: "Canceladas", tipo: "numero" },
            ]}
            filas={repartidores.map((r) => ({ ...r, id: r.repartidor }))}
            ordenInicial={{ clave: "colectas", asc: false }}
            vacio="Ninguna colecta tuvo repartidor asignado ese día."
          />
        </Card>
      </div>
    </>
  );
}
