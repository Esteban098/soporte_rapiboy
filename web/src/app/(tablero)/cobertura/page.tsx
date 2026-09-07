import { PageHead } from "@/components/Shell";
import { Card, Kpi } from "@/components/Card";
import { MapaCobertura } from "@/components/MapaCobertura";
import { BuscadorCobertura } from "@/components/BuscadorCobertura";
import { ALTO, ANCHO, COBERTURA, RESUMEN } from "@/lib/cobertura";
import { numero } from "@/lib/formato";
import estilos from "@/components/ui.module.css";

export const metadata = { title: "Cobertura" };

export default function Cobertura() {
  return (
    <>
      <PageHead
        eyebrow="Dónde entregamos"
        titulo="Cobertura"
        dek="Los polígonos donde hay servicio, y una verificación puntual para cuando hay que decidir si un domicilio entra o no. Los mantiene operaciones en un KMZ; acá se muestran tal cual, sin retoques."
      />

      <div className={estilos.kpis}>
        <Kpi etiqueta="Zonas" valor={numero(RESUMEN.zonas)} nota="ZONA 1 y ZONA 2" />
        <Kpi
          etiqueta="Polígonos"
          valor={numero(RESUMEN.poligonos)}
          nota="áreas de reparto con nombre propio"
        />
        <Kpi
          etiqueta="Extensión"
          valor={`${kilometros(COBERTURA.bbox.este - COBERTURA.bbox.oeste, COBERTURA.bbox)} km`}
          nota="de ancho, de punta a punta"
        />
        <Kpi
          etiqueta="Vértices"
          valor={numero(RESUMEN.puntos)}
          nota="puntos que definen el contorno"
        />
      </div>

      <div className={estilos.stack}>
        <Card
          titulo="¿Este domicilio entra?"
          nota="La respuesta sale del polígono, que está en el repo: no depende de que la base ni n8n estén arriba. Traducir una dirección a coordenadas sí consulta OpenStreetMap."
        >
          <BuscadorCobertura ancho={ANCHO} alto={ALTO}>
            <MapaCobertura />
          </BuscadorCobertura>
        </Card>
      </div>
    </>
  );
}

/** Grados de longitud a kilómetros, corrigiendo por la latitud de la zona. */
function kilometros(grados: number, caja: { sur: number; norte: number }): string {
  const latitudMedia = ((caja.sur + caja.norte) / 2) * (Math.PI / 180);
  return (grados * 111.32 * Math.cos(latitudMedia)).toFixed(0);
}
