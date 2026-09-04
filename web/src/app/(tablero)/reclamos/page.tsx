import { cargarPedidos } from "@/lib/datos";
import { reclamos } from "@/lib/metricas";
import { numero, porcentaje } from "@/lib/formato";
import { PageHead } from "@/components/Shell";
import { Callout, Card, Kpi } from "@/components/Card";
import { EstadosTable } from "@/components/EstadosTable";
import { Tabla } from "@/components/Tabla";
import { columnasPara, filasDePedidos } from "@/lib/filas";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Reclamos de tienda" };

export default async function Reclamos() {
  const mes = await cargarPedidos();
  const pedidos = mes.pedidos;
  const datos = reclamos(pedidos);

  // El detalle va ordenado por lo que hay que atender primero: sin avisar y
  // todavía abierto, arriba de todo.
  const conReclamo = pedidos
    .filter((p) => p.tieneDatosTienda)
    .sort((a, b) => {
      const prioridad = (p: typeof a) => (p.avisoPendiente ? 0 : 1) + (p.cerrado ? 2 : 0);
      return prioridad(a) - prioridad(b) || b.ultimoMovimiento!.getTime() - a.ultimoMovimiento!.getTime();
    });
  const filas = filasDePedidos(conReclamo);

  return (
    <>
      <PageHead
        eyebrow="Datos que aporta el comercio"
        titulo="Reclamos de tienda"
        flujo="global"
        dek="Casos donde la tienda nos compartió algo con qué trabajar: un teléfono, una ubicación o una indicación del domicilio. No importa en qué columna quedó cargado; lo que importa es si esa información terminó sirviendo."
      />

      <div className={estilos.kpis}>
        <Kpi
          etiqueta="Casos con datos"
          valor={numero(datos.conReclamo)}
          nota={`${porcentaje(datos.porcentaje)} de los casos del mes`}
        />
        <Kpi
          etiqueta="Entregados con datos"
          valor={porcentaje(datos.tasaEntregaConReclamo)}
          tono="good"
          relleno
          nota={`${numero(datos.entregadosConReclamo)} de ${numero(datos.conReclamo)} fueron entregados`}
        />
        <Kpi
          etiqueta="Entregados sin datos"
          valor={porcentaje(datos.tasaEntregaSinReclamo)}
          tono="warning"
          relleno
          nota="referencia: casos donde la tienda no aportó nada"
        />
        <Kpi
          etiqueta="Con datos vacios"
          valor={numero(datos.tipificadosSinDatos)}
          nota="con reclamo cargado pero sin ningún dato atrás"
        />
      </div>

      <div className={estilos.stack}>

        {datos.tipificadosSinDatos > 0 ? (
          <Callout tono="warning" titulo="Casos tipificados que no traen ningún dato">
            {numero(datos.tipificadosSinDatos)} casos tienen la columna RECLAMO TIENDA cargada
            pero ningún dato atrás: ni teléfono, ni ubicación, ni indicaciones. Quedan fuera de
            esta sección, porque si la tienda no pasó nada con qué trabajar no son casos con
            datos por más que estén clasificados. Vale revisar por qué se tipifican sin completar.
          </Callout>
        ) : null}

        <Card
          titulo="Casos con datos de la tienda"
          nota="Todo lo que el comercio aportó para concretar la entrega, con la información del viaje. Se puede filtrar por aviso y estado, y ordenar por cualquier columna."
        >
          <Tabla
            id="reclamos-casos"
            titulo="Casos con datos de la tienda"
            columnas={columnasPara(mes.campos)}
            filas={filas}
            filtros={[
              { clave: "aviso", etiqueta: "Aviso", opciones: ["NO AVISADO", "AVISADO"] },
              { clave: "estado", etiqueta: "Estado" },
              { clave: "caso", etiqueta: "Caso", opciones: ["Abierto", "Cerrado"] },
            ]}
            ordenInicial={{ clave: "quieto", asc: false }}
            limite={30}
            vacio="No hay casos con datos de la tienda."
            editable
          />
        </Card>

        <Card
          titulo="Qué tipo de dato aporta la tienda"
          nota="La tipificación que carga soporte en la columna RECLAMO TIENDA, con cuántos de esos casos llegaron a entregarse."
        >
          <Tabla
            id="reclamos-tipos"
            titulo="Qué tipo de dato aporta la tienda"
            columnas={[
              { clave: "tipo", titulo: "Tipo de dato", tipo: "texto" },
              { clave: "casos", titulo: "Casos", tipo: "numero" },
              { clave: "entregados", titulo: "Entregados", tipo: "numero" },
              { clave: "tasaEntrega", titulo: "% entrega", tipo: "porcentaje" },
              { clave: "abiertos", titulo: "Abiertos", tipo: "numero" },
            ]}
            filas={datos.porTipo.map((fila) => ({
              id: fila.tipo,
              tipo: fila.tipo,
              casos: fila.casos,
              entregados: fila.entregados,
              tasaEntrega: fila.tasaEntrega,
              abiertos: fila.abiertos,
            }))}
            ordenInicial={{ clave: "casos", asc: false }}
            vacio="Todavía no hay casos con datos de la tienda este mes."
          />
        </Card>

        <Card
          titulo="En qué terminaron los casos con datos"
          nota="El desglose completo de estados, solo para los casos donde la tienda aportó información."
        >
          <EstadosTable id="reclamos-estados" titulo="Reclamos · en qué terminaron" filas={datos.porEstado} />
        </Card>

      </div>
    </>
  );
}
