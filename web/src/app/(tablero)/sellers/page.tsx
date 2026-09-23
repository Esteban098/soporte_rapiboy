import { Callout, Card, Kpi } from "@/components/Card";
import { PageHead } from "@/components/Shell";
import { Tabla } from "@/components/Tabla";
import estilos from "@/components/ui.module.css";
import { modoDatos } from "@/lib/config";
import { leerSellersDirectorio } from "@/lib/directorio-datos";
import { fechaCalendario, fechaHoraMexico, resumirDirectorio } from "@/lib/directorio";
import { numero } from "@/lib/formato";
import { TablaFaltante } from "@/lib/supabase";

export const metadata = { title: "Directorio · Sellers" };

export default async function Sellers() {
  if (modoDatos() !== "supabase") return <SinBase />;

  let sellers;
  try {
    sellers = await leerSellersDirectorio();
  } catch (error) {
    if (error instanceof TablaFaltante) return <SinTablas />;
    throw error;
  }

  const resumen = resumirDirectorio(sellers);
  const filas = sellers.map((seller) => ({
    id: seller.id,
    seller: seller.nombre,
    whatsapp: seller.grupoWhatsapp ? "Vinculado" : "Sin grupo",
    grupo: seller.grupoWhatsapp ?? "",
    asignacion: seller.asignacion === "MANUAL" ? "Manual" : seller.asignacion === "AUTOMATICO" ? "Automática" : "",
    soporte: seller.soporteAsignado,
    labels: seller.labelsWaha.map((label) => label.name).join(", "),
    alerta: alertaSoporte(seller.soporteAsignado, seller.labelsWaha.flatMap((label) => label.name ? [label.name] : [])),
    ubicacionManual: seller.ubicacionManual,
    latitudManual: seller.latitudManual,
    longitudManual: seller.longitudManual,
    comercial: seller.comercial,
    horaCorte: seller.horaCorte,
    bodega: seller.llevaBodega ? "Sí" : "No",
    dropoff: seller.llevaDropoff ? "Sí" : "No",
    pagaColecta: seller.pagaColecta ? "Sí" : "No",
    tope: seller.topeMaximo,
    celular: seller.celular,
    email: seller.email,
    direccion: seller.direccion,
    activacion: fechaCalendario(seller.fechaActivacion),
    actualizado: fechaHoraMexico(seller.actualizadoEn),
  }));

  return (
    <>
      <PageHead
        eyebrow="Directorio · México"
        titulo="Sellers"
        flujo="directorio"
        dek="Tiendas activas sincronizadas desde Rapiboy y su grupo asignado de WhatsApp. Este directorio será la fuente de destinatarios para los mensajes predeterminados de WAHA."
      />

      <div className={estilos.kpis}>
        <Kpi etiqueta="Sellers activos" valor={numero(resumen.total)} nota="disponibles en el directorio" />
        <Kpi etiqueta="Con grupo" valor={numero(resumen.vinculados)} nota="listos para mensajería" tono="good" />
        <Kpi etiqueta="Sin grupo" valor={numero(resumen.pendientes)} nota="requieren vinculación" tono={resumen.pendientes ? "warning" : "neutral"} />
        <Kpi etiqueta="Asignación manual" valor={numero(resumen.manuales)} nota="protegida de la sincronización" />
      </div>

      <div className={estilos.stack}>
        <Card titulo="Directorio de sellers" nota="Solo se muestran sellers activos de México. La búsqueda revisa todas las columnas y los filtros se pueden combinar.">
          <Tabla
            id="directorio-sellers"
            titulo="Directorio · Sellers"
            filas={filas}
            limite={20}
            ordenInicial={{ clave: "seller", asc: true }}
            filtros={[
              { clave: "whatsapp", etiqueta: "WhatsApp" },
              { clave: "asignacion", etiqueta: "Asignación" },
              { clave: "comercial", etiqueta: "Comercial" },
            ]}
            columnas={[
              { clave: "id", titulo: "ID", tipo: "numero" },
              { clave: "seller", titulo: "Seller", tipo: "tienda" },
              { clave: "whatsapp", titulo: "WhatsApp", tipo: "texto" },
              { clave: "grupo", titulo: "Grupo", tipo: "texto" },
              { clave: "asignacion", titulo: "Asignación", tipo: "texto" },
              { clave: "soporte", titulo: "Soporte", tipo: "soporte" },
              { clave: "labels", titulo: "Labels WAHA", tipo: "texto" },
              { clave: "alerta", titulo: "Validación", tipo: "texto" },
              { clave: "ubicacionManual", titulo: "Ubicación manual", tipo: "ubicacion" },
              { clave: "comercial", titulo: "Comercial", tipo: "texto" },
              { clave: "horaCorte", titulo: "Hora corte", tipo: "texto" },
              { clave: "bodega", titulo: "Bodega", tipo: "texto" },
              { clave: "dropoff", titulo: "Dropoff", tipo: "texto" },
              { clave: "pagaColecta", titulo: "Paga colecta", tipo: "texto" },
              { clave: "tope", titulo: "Tope diario", tipo: "numero" },
              { clave: "celular", titulo: "Celular", tipo: "texto" },
              { clave: "email", titulo: "Email", tipo: "texto" },
              { clave: "direccion", titulo: "Dirección", tipo: "texto" },
              { clave: "activacion", titulo: "Activación", tipo: "texto" },
              { clave: "actualizado", titulo: "Actualizado", tipo: "texto" },
            ]}
            vacio="No hay sellers activos sincronizados."
          />
        </Card>
      </div>
    </>
  );
}

function alertaSoporte(soporte: "CANDE" | "ESTEBAN" | null, labels: string[]): string {
  if (!soporte) return labels.length ? "⚠️ Falta asignación" : "Sin asignar";
  const esperado = soporte === "CANDE" ? "cande" : "esteban";
  const relevantes = labelsSoporte(labels);
  const coincide = relevantes.some((label) => normalizar(label).includes(esperado));
  if (!relevantes.length) return "Asignado manualmente";
  return coincide ? "Correcto" : "⚠️ No coincide";
}

function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}

function labelsSoporte(labels: string[]): string[] {
  return labels.filter((label) => {
    const valor = normalizar(label);
    return valor.includes("cande") || valor.includes("candelaria") || valor.includes("esteban");
  });
}

function SinBase() {
  return (
    <>
      <PageHead eyebrow="Directorio · México" titulo="Sellers" flujo="directorio" />
      <Callout tono="warning" titulo="La plataforma no está usando Supabase">
        El directorio operativo solo está disponible con la base de Supabase activa.
      </Callout>
    </>
  );
}

function SinTablas() {
  return (
    <>
      <PageHead eyebrow="Directorio · México" titulo="Sellers" flujo="directorio" />
      <Callout tono="warning" titulo="Falta crear el directorio">
        Corré <code>web/supabase/migracion-17-directorio-activos-whatsapp.sql</code> en Supabase y después ejecutá el flujo <code>n8n/13-directorio-activos-whatsapp.json</code>.
      </Callout>
    </>
  );
}
