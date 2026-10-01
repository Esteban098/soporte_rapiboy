import { Callout, Card, Kpi } from "@/components/Card";
import { PageHead } from "@/components/Shell";
import { Tabla } from "@/components/Tabla";
import estilos from "@/components/ui.module.css";
import { modoDatos } from "@/lib/config";
import { leerDriversDirectorio } from "@/lib/directorio-datos";
import { fechaHoraMexico, resumirDirectorio } from "@/lib/directorio";
import { numero } from "@/lib/formato";
import { TablaFaltante } from "@/lib/supabase";

export const metadata = { title: "Base de datos · Drivers" };

export default async function Drivers() {
  if (modoDatos() !== "supabase") return <SinBase />;

  let drivers;
  try {
    drivers = await leerDriversDirectorio();
  } catch (error) {
    if (error instanceof TablaFaltante) return <SinTablas />;
    throw error;
  }

  const resumen = resumirDirectorio(drivers);
  const filas = drivers.map((driver) => ({
    id: driver.id,
    driver: driver.nombre,
    whatsapp: driver.grupoWhatsapp ? "Vinculado" : "Sin grupo",
    grupo: driver.grupoWhatsapp ?? "",
    asignacion: driver.asignacion === "MANUAL" ? "Manual" : driver.asignacion === "AUTOMATICO" ? "Automática" : "",
    condicion: driver.condicion,
    flotilla: driver.flotilla,
    labels: driver.labelsWaha.map((label) => label.name).join(", "),
    ubicacion: driver.ubicacionManual,
    ubicacionManual: driver.ubicacionManual,
    latitudManual: driver.latitudManual,
    longitudManual: driver.longitudManual,
    actualizado: fechaHoraMexico(driver.actualizadoEn),
  }));

  return (
    <>
      <PageHead
        eyebrow="Base de datos · México"
        titulo="Drivers"
        flujo="directorio"
        dek="Repartidores activos, vínculo de WhatsApp y ubicación operativa."
      />

      <div className={estilos.kpis}>
        <Kpi etiqueta="Drivers activos" valor={numero(resumen.total)} nota="sincronizados desde Rapiboy" />
        <Kpi etiqueta="Con grupo" valor={numero(resumen.vinculados)} nota="listos para mensajería" tono="good" />
        <Kpi etiqueta="Sin grupo" valor={numero(resumen.pendientes)} nota="requieren vinculación" tono={resumen.pendientes ? "warning" : "neutral"} />
        <Kpi etiqueta="Asignación manual" valor={numero(resumen.manuales)} nota="protegida de la sincronización" />
      </div>

      <div className={estilos.stack}>
        <Card titulo="Base de datos · drivers" nota="Vista operativa de vínculo, condición y ubicación. Ordená o filtrá antes de abrir una edición.">
          <Tabla
            id="directorio-drivers"
            titulo="Base de datos · Drivers"
            filas={filas}
            limite={20}
            compacta
            ordenInicial={{ clave: "driver", asc: true }}
            filtros={[
              { clave: "whatsapp", etiqueta: "WhatsApp" },
              { clave: "asignacion", etiqueta: "Asignación" },
              { clave: "condicion", etiqueta: "Condición" },
              { clave: "flotilla", etiqueta: "Flotilla" },
              { clave: "labels", etiqueta: "Labels WAHA" },
            ]}
            columnas={[
              { clave: "id", titulo: "ID", tipo: "numero" },
              { clave: "driver", titulo: "Driver", tipo: "texto" },
              { clave: "whatsapp", titulo: "WhatsApp", tipo: "texto" },
              { clave: "grupo", titulo: "Grupo", tipo: "texto" },
              { clave: "condicion", titulo: "Condición", tipo: "texto" },
              { clave: "flotilla", titulo: "Flotilla", tipo: "texto" },
              { clave: "ubicacion", titulo: "Ubicación manual", tipo: "ubicacionDriver" },
              { clave: "actualizado", titulo: "Actualizado", tipo: "texto" },
            ]}
            vacio="No hay drivers activos sincronizados."
          />
        </Card>
      </div>
    </>
  );
}

function SinBase() {
  return (
    <>
      <PageHead eyebrow="Base de datos · México" titulo="Drivers" flujo="directorio" />
      <Callout tono="warning" titulo="La plataforma no está usando Supabase">
        El directorio operativo solo está disponible con la base de Supabase activa.
      </Callout>
    </>
  );
}

function SinTablas() {
  return (
    <>
      <PageHead eyebrow="Base de datos · México" titulo="Drivers" flujo="directorio" />
      <Callout tono="warning" titulo="Falta crear el directorio">
        Ejecutá en Supabase <code>web/supabase/migracion-17-directorio-activos-whatsapp.sql</code>, las migraciones 24 y 25 (especialmente <code>web/supabase/migracion-25-drivers-activos.sql</code>) y después corré el flujo <code>n8n/13-directorio-activos-whatsapp.json</code>.
      </Callout>
    </>
  );
}
